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

async function handleGet(db: SupabaseClient, type: DocType, token: string) {
  const doc = await loadDocument(db, type, token)
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
  return DESIGNS
    .filter(d => typeof cd[d.field] === 'string' && (cd[d.field] as string).trim())
    .map(d => ({ type: d.type, title: d.title, image_url: cd[d.field] as string, approval: approvals[d.type] || null }))
}

async function handleDesignGet(db: SupabaseClient, token: string) {
  const phase = await loadDesignPhase(db, token)
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
    const type = body.type as DocType | 'design'
    const token = typeof body.token === 'string' ? body.token : ''
    if (type !== 'design' && !(type in TABLES)) throw new HttpError(400, 'Onbekend documenttype.')
    if (!TOKEN_PATTERN.test(token)) throw notFound()

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    if (type === 'design') {
      switch (action) {
        case 'get': return await handleDesignGet(db, token)
        case 'accept': return await handleDesignResponse(db, token, body, true)
        case 'decline': return await handleDesignResponse(db, token, body, false)
        default: throw new HttpError(400, 'Onbekende actie.')
      }
    }

    switch (action) {
      case 'get': return await handleGet(db, type, token)
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
