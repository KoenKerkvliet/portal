// Publieke toegang tot één offerte, factuur, opdracht of de designs van een
// domein via de geheime code (public_token) uit de mail, zonder inloggen. De
// database blijft dicht voor anonieme bezoekers: deze function draait met
// service_role en geeft alleen het document terug waar de code bij hoort.
//
// Acties (POST, JSON):
//   { action: 'get',        type, token }
//   { action: 'accept',     type, token, name, signature, remarks?, terms: true }   — offerte/opdracht
//   { action: 'decline',    type, token, reason }                                     — offerte/opdracht
//   { action: 'attachment', type: 'quote', token, attachment_id }                     — tijdelijke downloadlink
//   { action: 'accept',     type: 'design', token, design_type, name }               — design goedkeuren
//   { action: 'decline',    type: 'design', token, design_type, reason, name? }      — design afkeuren
//   { action: 'get',        type: 'form', token }                                     — vragenlijst + antwoorden
//   { action: 'save',       type: 'form', token, data }                               — tussentijds opslaan
//   { action: 'submit',     type: 'form', token, data }                               — insturen
//
// verify_jwt = false (zie supabase/config.toml): de geheime code ís de autorisatie.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_EMAIL = 'koen.kerkvliet@designpixels.nl'

type DocType = 'quote' | 'invoice' | 'assignment'

const TABLES: Record<DocType, string> = {
  quote: 'quotes',
  invoice: 'invoices',
  assignment: 'assignments',
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/
const MAX_NAME = 200
const MAX_TEXT = 2000
const MAX_SIGNATURE = 500_000

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const asText = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

// Zelfde melding voor elke onbekende/ongeldige code, zodat niets te raden valt
const notFound = () => new HttpError(404, 'Deze link is ongeldig of niet meer actief.')

async function loadDocument(db: SupabaseClient, type: DocType, token: string) {
  const { data, error } = await db
    .from(TABLES[type])
    .select('*, project:projects(name), client:clients(name, company)')
    .eq('public_token', token)
    .maybeSingle()
  if (error) throw new Error(`Document laden mislukt: ${error.message}`)
  if (!data) throw notFound()
  return data as Record<string, unknown> & {
    id: string
    project_id: string | null
    client_id: string | null
    status: string
    project: { name: string } | null
    client: { name: string | null; company: string | null } | null
  }
}

// De geheime code gaat nooit terug naar de browser. Klant (naam/bedrijf) en
// domeinnaam wel: die staan op het document en in de PDF.
function publicView(doc: Record<string, unknown>) {
  const rest = { ...doc }
  delete rest.public_token
  return rest
}

function labelFor(type: DocType, doc: Record<string, unknown>) {
  if (type === 'quote') return `Offerte ${doc.number}`
  if (type === 'invoice') return `Factuur ${doc.number}`
  return `Opdracht: ${doc.title}`
}

// Registreert dat een document via de link is geopend (portaalgebruik in het beheer).
// Mijn eigen bezoeken (ingelogd als admin) tellen niet mee, en hetzelfde document binnen
// 30 minuten telt één keer. Mag het openen nooit laten mislukken.
async function logDocOpen(db: SupabaseClient, req: Request, event: {
  doc_type: string
  doc_id: string
  project_id: string | null
  client_id: string | null
  label: string
}) {
  try {
    const bearer = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    if (bearer.split('.').length === 3) {
      const { data: { user } } = await db.auth.getUser(bearer)
      if (user) {
        const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle()
        if (profile?.role === 'admin') return
      }
    }
    const since = new Date(Date.now() - 30 * 60_000).toISOString()
    const { data: recent } = await db
      .from('portal_events')
      .select('id')
      .eq('kind', 'doc_open')
      .eq('doc_type', event.doc_type)
      .eq('doc_id', event.doc_id)
      .gt('created_at', since)
      .limit(1)
    if (recent && recent.length > 0) return
    await db.from('portal_events').insert({ kind: 'doc_open', ...event })
  } catch (e) {
    console.error('[public-document] Openen registreren mislukt:', e instanceof Error ? e.message : String(e))
  }
}

// Zet de stap met de knop naar dit document op voltooid (zelfde gedrag als in het portaal)
async function markStepCompleted(db: SupabaseClient, projectId: string, matches: (data: Record<string, string>) => boolean) {
  const { data: phaseRecords } = await db.from('project_phases').select('id, custom_data').eq('project_id', projectId)
  for (const record of phaseRecords || []) {
    const customData = record.custom_data as { steps?: Array<{ completed?: boolean; elements?: Array<{ type: string; data: Record<string, string> }> }> } | null
    if (!customData?.steps) continue
    let changed = false
    for (const step of customData.steps) {
      if (step.completed) continue
      if (step.elements?.some(el => el.type === 'button' && el.data && matches(el.data))) {
        step.completed = true
        changed = true
      }
    }
    if (changed) {
      await db.from('project_phases').update({ custom_data: customData }).eq('id', record.id)
    }
  }
}

async function sendAdminMail(opts: {
  accepted: boolean
  itemLabel: string
  clientName: string
  projectName: string
  remarks?: string
  declineReason?: string
}) {
  const apiKey = Deno.env.get('EMAILIT_API_KEY')
  if (!apiKey) {
    console.error('[public-document] EMAILIT_API_KEY ontbreekt, geen adminmail verstuurd')
    return
  }
  const from = Deno.env.get('EMAILIT_FROM') || 'DesignPixels <noreply@designpixels.nl>'
  const statusLabel = opts.accepted ? 'geaccepteerd' : 'afgekeurd'
  const color = opts.accepted ? '#16a34a' : '#dc2626'
  const bg = opts.accepted ? '#f0fdf4' : '#fef2f2'
  const border = opts.accepted ? '#bbf7d0' : '#fecaca'
  const item = escapeHtml(opts.itemLabel)
  const client = escapeHtml(opts.clientName || 'de klant')
  const project = escapeHtml(opts.projectName || '-')

  const detail = (title: string, text: string) => `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-top:16px;">
      <p style="color:#6b7280;font-size:12px;font-weight:600;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.05em;">${title}</p>
      <p style="color:#374151;font-size:14px;line-height:1.6;margin:0;white-space:pre-wrap;">${escapeHtml(text)}</p>
    </div>`

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8f7fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:480px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
  <div style="background:linear-gradient(135deg,#9e86ff,#7c3aed);padding:32px;text-align:center;">
    <h1 style="color:white;margin:0;font-size:22px;font-weight:700;">DesignPixels</h1>
  </div>
  <div style="padding:32px;">
    <h2 style="color:#1f2937;margin:0 0 8px;font-size:20px;">${opts.accepted ? '✅' : '❌'} ${item} ${statusLabel}</h2>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;"><strong>${item}</strong> is ${statusLabel} door <strong>${client}</strong> via de link in de mail.</p>
    <div style="background:${bg};border:1px solid ${border};border-radius:12px;padding:16px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="color:#6b7280;font-size:13px;padding:4px 0;">Item</td><td style="color:#1f2937;font-size:13px;font-weight:600;text-align:right;padding:4px 0;">${item}</td></tr>
        <tr><td style="color:#6b7280;font-size:13px;padding:4px 0;">Klant</td><td style="color:#1f2937;font-size:13px;font-weight:600;text-align:right;padding:4px 0;">${client}</td></tr>
        <tr><td style="color:#6b7280;font-size:13px;padding:4px 0;">Domein</td><td style="color:#1f2937;font-size:13px;font-weight:600;text-align:right;padding:4px 0;">${project}</td></tr>
        <tr><td style="color:#6b7280;font-size:13px;padding:4px 0;">Status</td><td style="color:${color};font-size:13px;font-weight:700;text-align:right;padding:4px 0;">${opts.accepted ? 'Geaccepteerd' : 'Afgekeurd'}</td></tr>
      </table>
    </div>
    ${opts.remarks ? detail('Opmerking van klant', opts.remarks) : ''}
    ${opts.declineReason ? detail('Reden van afwijzing', opts.declineReason) : ''}
    <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:24px 0 0;">${new Date().toLocaleString('nl-NL', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Amsterdam' })}</p>
  </div>
</div>
</body></html>`

  const subject = `${opts.itemLabel} is ${statusLabel} door ${opts.clientName || 'klant'}`
  try {
    const res = await fetch('https://api.emailit.com/v2/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: ADMIN_EMAIL, subject, html }),
    })
    if (!res.ok) console.error(`[public-document] Adminmail mislukt: ${res.status} ${await res.text()}`)
  } catch (e) {
    console.error('[public-document] Adminmail exception:', e instanceof Error ? e.message : String(e))
  }
}

// req alleen bij het openen van de pagina, zodat een reactie niet nog eens als "geopend" telt
async function handleGet(db: SupabaseClient, type: DocType, token: string, req?: Request) {
  const doc = await loadDocument(db, type, token)
  if (req) {
    await logDocOpen(db, req, {
      doc_type: type, doc_id: doc.id, project_id: doc.project_id, client_id: doc.client_id, label: labelFor(type, doc),
    })
  }
  const { data: settings } = await db.from('invoice_settings').select('*').limit(1).maybeSingle()

  let attachments: unknown[] = []
  const attachmentIds = (doc.attachment_ids as string[] | null) || []
  if (type === 'quote' && attachmentIds.length > 0) {
    const { data } = await db
      .from('quote_attachments')
      .select('id, title, description, kind, content, file_name, file_size, mime_type, sort_order, created_at')
      .in('id', attachmentIds)
      .order('sort_order')
      .order('created_at')
    attachments = data || []
  }

  return json({
    success: true,
    type,
    document: publicView(doc),
    project_name: doc.project?.name || '',
    client_name: (doc.client_name as string | null) || doc.client?.name || '',
    client_company: doc.client?.company || '',
    settings: settings || null,
    attachments,
  })
}

async function handleAccept(db: SupabaseClient, type: DocType, token: string, body: Record<string, unknown>) {
  if (type === 'invoice') throw new HttpError(400, 'Een factuur kan niet geaccepteerd worden.')
  const name = asText(body.name, MAX_NAME)
  const remarks = asText(body.remarks, MAX_TEXT)
  const signature = typeof body.signature === 'string' ? body.signature : ''
  if (!name) throw new HttpError(400, 'Vul je naam in.')
  if (!signature.startsWith('data:image/png;base64,') || signature.length > MAX_SIGNATURE) {
    throw new HttpError(400, 'Zet je handtekening.')
  }
  if (body.terms !== true) throw new HttpError(400, 'Ga akkoord met de voorwaarden.')

  const doc = await loadDocument(db, type, token)
  if (doc.status === 'accepted' || doc.status === 'declined') {
    throw new HttpError(409, 'Hier is al op gereageerd.')
  }

  // Alleen bijwerken als de status intussen niet veranderd is
  const { data: updated, error } = await db
    .from(TABLES[type])
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_name: name,
      accepted_signature: signature,
      accepted_remarks: remarks || null,
    })
    .eq('id', doc.id)
    .not('status', 'in', '(accepted,declined)')
    .select('id')
  if (error) throw new Error(`Accepteren mislukt: ${error.message}`)
  if (!updated || updated.length === 0) throw new HttpError(409, 'Hier is al op gereageerd.')

  const idField = type === 'quote' ? 'quoteId' : 'assignmentId'
  if (doc.project_id) await markStepCompleted(db, doc.project_id, data => data.action === type && data[idField] === doc.id)

  const itemLabel = labelFor(type, doc)
  const clientName = doc.client?.name || name
  await db.from('admin_notifications').insert({
    type: 'quote_accepted',
    title: type === 'quote' ? `${itemLabel} geaccepteerd` : `Opdracht "${doc.title}" geaccepteerd`,
    message: `${clientName} heeft de ${type === 'quote' ? 'offerte' : 'opdracht'} geaccepteerd via de link in de mail.${remarks ? ` Opmerking: "${remarks}"` : ''}`,
    project_id: doc.project_id,
    client_id: doc.client_id,
  })
  await sendAdminMail({ accepted: true, itemLabel, clientName, projectName: doc.project?.name || '', remarks })

  return handleGet(db, type, token)
}

async function handleDecline(db: SupabaseClient, type: DocType, token: string, body: Record<string, unknown>) {
  if (type === 'invoice') throw new HttpError(400, 'Een factuur kan niet afgewezen worden.')
  const reason = asText(body.reason, MAX_TEXT)
  if (!reason) throw new HttpError(400, 'Geef een reden op.')

  const doc = await loadDocument(db, type, token)
  if (doc.status === 'accepted' || doc.status === 'declined') {
    throw new HttpError(409, 'Hier is al op gereageerd.')
  }

  const { data: updated, error } = await db
    .from(TABLES[type])
    .update({ status: 'declined', declined_at: new Date().toISOString(), declined_reason: reason })
    .eq('id', doc.id)
    .not('status', 'in', '(accepted,declined)')
    .select('id')
  if (error) throw new Error(`Afwijzen mislukt: ${error.message}`)
  if (!updated || updated.length === 0) throw new HttpError(409, 'Hier is al op gereageerd.')

  const itemLabel = labelFor(type, doc)
  const clientName = doc.client?.name || ''
  await db.from('admin_notifications').insert({
    type: 'quote_declined',
    title: type === 'quote' ? `${itemLabel} afgekeurd` : `Opdracht "${doc.title}" afgekeurd`,
    message: `${clientName || 'De klant'} heeft de ${type === 'quote' ? 'offerte' : 'opdracht'} afgekeurd via de link in de mail. Reden: "${reason}"`,
    project_id: doc.project_id,
    client_id: doc.client_id,
  })
  await sendAdminMail({ accepted: false, itemLabel, clientName, projectName: doc.project?.name || '', declineReason: reason })

  return handleGet(db, type, token)
}

async function handleAttachment(db: SupabaseClient, type: DocType, token: string, body: Record<string, unknown>) {
  if (type !== 'quote') throw new HttpError(400, 'Alleen offertes hebben bijlages.')
  const attachmentId = typeof body.attachment_id === 'string' ? body.attachment_id : ''
  const doc = await loadDocument(db, type, token)
  const attachmentIds = (doc.attachment_ids as string[] | null) || []
  // Alleen bijlages die echt aan deze offerte hangen
  if (!attachmentId || !attachmentIds.includes(attachmentId)) throw notFound()

  const { data: attachment } = await db
    .from('quote_attachments')
    .select('kind, file_path, file_name')
    .eq('id', attachmentId)
    .maybeSingle()
  if (!attachment || attachment.kind !== 'file' || !attachment.file_path) throw notFound()

  const { data, error } = await db.storage
    .from('quote-attachments')
    .createSignedUrl(attachment.file_path, 60, { download: attachment.file_name || undefined })
  if (error || !data) throw new Error(`Downloadlink maken mislukt: ${error?.message}`)
  return json({ success: true, url: data.signedUrl })
}

// ── Designs ──
// De code hoort bij de Design-fase van een domein en geeft toegang tot alle
// designs daarvan; goedkeuren/afkeuren gaat per design.

const DESIGNS = [
  { type: 'styleguide', title: 'Styleguide', field: 'design_image_styleguide' },
  { type: 'homepage', title: 'Homepage', field: 'design_image_homepage' },
  { type: 'contactpage', title: 'Contactpagina', field: 'design_image_tweede' },
] as const

type DesignApproval = {
  status?: string
  accepted_at?: string
  accepted_name?: string
  declined_at?: string
  declined_name?: string
  declined_reason?: string
}

async function loadDesignPhase(db: SupabaseClient, token: string) {
  const { data, error } = await db
    .from('project_phases')
    .select('id, project_id, custom_data, project:projects(name, client:clients(name))')
    .eq('public_token', token)
    .eq('phase', 'design')
    .maybeSingle()
  if (error) throw new Error(`Designs laden mislukt: ${error.message}`)
  if (!data) throw notFound()
  return data as unknown as {
    id: string
    project_id: string
    custom_data: Record<string, unknown> | null
    project: { name: string; client: { name: string | null } | null } | null
  }
}

function designView(customData: Record<string, unknown> | null) {
  const cd = customData || {}
  const approvals = (cd.design_approvals || {}) as Record<string, DesignApproval>
  const deadlines = (cd.design_deadlines || {}) as Record<string, string>
  return DESIGNS
    .filter(d => typeof cd[d.field] === 'string' && (cd[d.field] as string).trim())
    .map(d => ({
      type: d.type, title: d.title, image_url: cd[d.field] as string, approval: approvals[d.type] || null,
      feedback_deadline: deadlines[d.type] || null, // uiterlijke reactiedatum (YYYY-MM-DD)
    }))
}

async function handleDesignGet(db: SupabaseClient, token: string, req?: Request) {
  const phase = await loadDesignPhase(db, token)
  if (req) {
    await logDocOpen(db, req, {
      doc_type: 'design', doc_id: phase.id, project_id: phase.project_id, client_id: null, label: 'Ontwerpen',
    })
  }
  return json({
    success: true,
    type: 'design',
    document: { designs: designView(phase.custom_data) },
    project_name: phase.project?.name || '',
    client_name: phase.project?.client?.name || '',
    client_company: '',
    settings: null,
    attachments: [],
  })
}

async function handleDesignResponse(db: SupabaseClient, token: string, body: Record<string, unknown>, accepted: boolean) {
  const design = DESIGNS.find(d => d.type === body.design_type)
  if (!design) throw new HttpError(400, 'Onbekend design.')
  const name = asText(body.name, MAX_NAME)
  const reason = asText(body.reason, MAX_TEXT)
  if (accepted && !name) throw new HttpError(400, 'Vul je naam in.')
  if (!accepted && !reason) throw new HttpError(400, 'Geef aan wat er anders moet.')

  const phase = await loadDesignPhase(db, token)
  const cd = phase.custom_data || {}
  if (!(typeof cd[design.field] === 'string' && (cd[design.field] as string).trim())) throw notFound()
  const approvals = (cd.design_approvals || {}) as Record<string, DesignApproval>
  const current = approvals[design.type]?.status
  if (current === 'accepted' || current === 'declined') throw new HttpError(409, 'Op dit design is al gereageerd.')

  const now = new Date().toISOString()
  const approval: DesignApproval = accepted
    ? { status: 'accepted', accepted_at: now, accepted_name: name }
    : { status: 'declined', declined_at: now, declined_name: name || undefined, declined_reason: reason }
  const { error } = await db
    .from('project_phases')
    .update({ custom_data: { ...cd, design_approvals: { ...approvals, [design.type]: approval } } })
    .eq('id', phase.id)
  if (error) throw new Error(`Opslaan mislukt: ${error.message}`)

  if (accepted) await markStepCompleted(db, phase.project_id, data => data.action === design.type)

  const clientName = name || phase.project?.client?.name || ''
  await db.from('admin_notifications').insert({
    type: accepted ? 'quote_accepted' : 'quote_declined',
    title: `Design "${design.title}" ${accepted ? 'goedgekeurd' : 'afgekeurd'}`,
    message: accepted
      ? `${clientName || 'De klant'} heeft het design "${design.title}" goedgekeurd via de link in de mail.`
      : `${clientName || 'De klant'} heeft het design "${design.title}" afgekeurd via de link in de mail. Reden: "${reason}"`,
    project_id: phase.project_id,
    client_id: null,
  })
  await sendAdminMail({
    accepted,
    itemLabel: `Design: ${design.title}`,
    clientName,
    projectName: phase.project?.name || '',
    declineReason: accepted ? undefined : reason,
  })

  return handleDesignGet(db, token)
}

// ── Vragenlijsten ──
// De code hoort bij één form_submissions-rij (vragenlijst x domein). De klant kan
// tussentijds opslaan en later via dezelfde link verder; na insturen is hij alleen-lezen.

type FormField = { id: string; type: string; label?: string; required?: boolean; options?: { id: string }[] }
type FormStep = { id: string; title?: string; fields?: FormField[] }
type Answer = string | string[] | boolean

const MAX_ANSWER = 5000

async function loadFormSubmission(db: SupabaseClient, token: string) {
  const { data, error } = await db
    .from('form_submissions')
    .select('id, project_id, data, submitted_at, form:forms(id, title, description, steps), project:projects(name, client:clients(name))')
    .eq('public_token', token)
    .maybeSingle()
  if (error) throw new Error(`Vragenlijst laden mislukt: ${error.message}`)
  if (!data) throw notFound()
  return data as unknown as {
    id: string
    project_id: string
    data: Record<string, Answer> | null
    submitted_at: string | null
    form: { id: string; title: string; description: string | null; steps: FormStep[] | null } | null
    project: { name: string; client: { name: string | null } | null } | null
  }
}

// Alleen antwoorden op velden die in het formulier staan, met het juiste type en een maximale lengte
function cleanAnswers(steps: FormStep[], raw: unknown): Record<string, Answer> {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const clean: Record<string, Answer> = {}
  for (const step of steps) {
    for (const field of step.fields || []) {
      if (field.type === 'heading' || !(field.id in input)) continue
      const value = input[field.id]
      if (field.type === 'checkbox') {
        const allowed = new Set((field.options || []).map(o => o.id))
        if (Array.isArray(value)) clean[field.id] = value.filter((v): v is string => typeof v === 'string' && allowed.has(v))
        else if (typeof value === 'boolean') clean[field.id] = value
      } else if (typeof value === 'string') {
        clean[field.id] = value.slice(0, MAX_ANSWER)
      }
    }
  }
  return clean
}

const isEmptyAnswer = (value: Answer | undefined) =>
  value === undefined || value === '' || value === false || (Array.isArray(value) && value.length === 0)

async function handleFormGet(db: SupabaseClient, token: string, req?: Request) {
  const sub = await loadFormSubmission(db, token)
  if (req) {
    await logDocOpen(db, req, {
      doc_type: 'form', doc_id: sub.id, project_id: sub.project_id, client_id: null,
      label: `Vragenlijst "${sub.form?.title || 'Vragenlijst'}"`,
    })
  }
  return json({
    success: true,
    type: 'form',
    document: {
      form: { title: sub.form?.title || 'Vragenlijst', description: sub.form?.description || '', steps: sub.form?.steps || [] },
      data: sub.data || {},
      submitted_at: sub.submitted_at,
    },
    project_name: sub.project?.name || '',
    client_name: sub.project?.client?.name || '',
    client_company: '',
    settings: null,
    attachments: [],
  })
}

async function handleFormSave(db: SupabaseClient, token: string, body: Record<string, unknown>, submit: boolean) {
  const sub = await loadFormSubmission(db, token)
  if (sub.submitted_at) throw new HttpError(409, 'Deze vragenlijst is al ingestuurd.')
  const steps = sub.form?.steps || []
  const answers = cleanAnswers(steps, body.data)

  if (submit) {
    const missing = steps.flatMap(s => s.fields || []).filter(f => f.required && f.type !== 'heading' && isEmptyAnswer(answers[f.id]))
    if (missing.length > 0) throw new HttpError(400, `Vul eerst alle verplichte vragen in (${missing.length} open).`)
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await db
    .from('form_submissions')
    .update({ data: answers, updated_at: now, ...(submit ? { submitted_at: now } : {}) })
    .eq('id', sub.id)
    .is('submitted_at', null)
    .select('id')
  if (error) throw new Error(`Opslaan mislukt: ${error.message}`)
  if (!updated || updated.length === 0) throw new HttpError(409, 'Deze vragenlijst is al ingestuurd.')

  if (submit) {
    const formTitle = sub.form?.title || 'Vragenlijst'
    const clientName = sub.project?.client?.name || ''
    await markStepCompleted(db, sub.project_id, data => data.action === 'form' && data.formId === sub.form?.id)
    await db.from('admin_notifications').insert({
      type: 'assignment',
      title: `Vragenlijst "${formTitle}" ingevuld`,
      message: `${clientName || 'De klant'} heeft de vragenlijst "${formTitle}" voor ${sub.project?.name || 'het domein'} ingestuurd via de link in de mail.`,
      project_id: sub.project_id,
      client_id: null,
    })
    await sendFormAdminMail(formTitle, clientName, sub.project?.name || '')
    return handleFormGet(db, token)
  }
  return json({ success: true, saved_at: now })
}

async function sendFormAdminMail(formTitle: string, clientName: string, projectName: string) {
  const apiKey = Deno.env.get('EMAILIT_API_KEY')
  if (!apiKey) return
  const from = Deno.env.get('EMAILIT_FROM') || 'DesignPixels <noreply@designpixels.nl>'
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8f7fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:480px;margin:40px auto;background:white;border-radius:16px;padding:32px;">
  <h2 style="color:#1f2937;margin:0 0 8px;font-size:20px;">📝 Vragenlijst ingevuld</h2>
  <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0;"><strong>${escapeHtml(clientName || 'De klant')}</strong> heeft de vragenlijst <strong>${escapeHtml(formTitle)}</strong> voor <strong>${escapeHtml(projectName || '-')}</strong> ingestuurd. Je kunt de antwoorden als PDF downloaden op de domeinpagina, bij de intake.</p>
</div></body></html>`
  try {
    const res = await fetch('https://api.emailit.com/v2/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: ADMIN_EMAIL, subject: `Vragenlijst "${formTitle}" ingevuld door ${clientName || 'klant'}`, html }),
    })
    if (!res.ok) console.error(`[public-document] Adminmail vragenlijst mislukt: ${res.status} ${await res.text()}`)
  } catch (e) {
    console.error('[public-document] Adminmail vragenlijst exception:', e instanceof Error ? e.message : String(e))
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ success: false, error: 'Methode niet toegestaan' }, 405)

  try {
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      throw new HttpError(400, 'Ongeldig verzoek.')
    }

    const action = body.action
    const type = body.type as DocType | 'design' | 'form'
    const token = typeof body.token === 'string' ? body.token : ''
    if (type !== 'design' && type !== 'form' && !(type in TABLES)) throw new HttpError(400, 'Onbekend documenttype.')
    if (!TOKEN_PATTERN.test(token)) throw notFound()

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    if (type === 'design') {
      switch (action) {
        case 'get': return await handleDesignGet(db, token, req)
        case 'accept': return await handleDesignResponse(db, token, body, true)
        case 'decline': return await handleDesignResponse(db, token, body, false)
        default: throw new HttpError(400, 'Onbekende actie.')
      }
    }

    if (type === 'form') {
      switch (action) {
        case 'get': return await handleFormGet(db, token, req)
        case 'save': return await handleFormSave(db, token, body, false)
        case 'submit': return await handleFormSave(db, token, body, true)
        default: throw new HttpError(400, 'Onbekende actie.')
      }
    }

    switch (action) {
      case 'get': return await handleGet(db, type, token, req)
      case 'accept': return await handleAccept(db, type, token, body)
      case 'decline': return await handleDecline(db, type, token, body)
      case 'attachment': return await handleAttachment(db, type, token, body)
      default: throw new HttpError(400, 'Onbekende actie.')
    }
  } catch (err) {
    if (err instanceof HttpError) return json({ success: false, error: err.message }, err.status)
    console.error('[public-document] error:', err instanceof Error ? err.message : String(err))
    return json({ success: false, error: 'Er ging iets mis. Probeer het later opnieuw.' }, 500)
  }
})
