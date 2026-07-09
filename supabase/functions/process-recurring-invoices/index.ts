// Genereert nieuwe facturen op basis van terugkerende sjablonen.
// Aanroepbaar handmatig (POST) of via pg_cron — zie add-recurring-invoice-columns.sql.
//
// Werking:
//  1. Haal alle templates op waar is_recurring = true AND recurrence_next_run_at <= now().
//  2. Per template: insert een nieuwe gewone factuur (kopie van items/notes/btw/etc.)
//     met een vers factuurnummer, status 'sent', recurring_template_id = template.id.
//  3. Stuur de klant een mail + portaalnotificatie (zoals bij handmatig versturen).
//  4. Update template: zet recurrence_last_run_at op nu en schuif recurrence_next_run_at
//     op met het interval. Als de nieuwe waarde nog steeds in het verleden ligt
//     (bv. een uitgevallen cron), blijven we incrementeren tot in de toekomst.
//  5. Stuur de admin(s) één samenvattingsmail met alle verstuurde facturen, zodat
//     Koen weet wanneer hij zijn rekening extra in de gaten moet houden.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PORTAL_URL = 'https://portal.designpixels.nl'

type RecurrenceInterval = 'daily' | 'weekly' | 'monthly' | 'yearly'

interface InvoiceTemplate {
  id: string
  number: string
  project_id: string
  client_id: string
  amount: number
  subtotal: number
  due_date: string
  invoice_date: string | null
  is_test: boolean
  client_name: string | null
  client_email: string | null
  client_address: string | null
  items: unknown
  discount_percent: number
  btw_percent: number
  notes: string | null
  recurrence_interval: RecurrenceInterval
  recurrence_send_time: string
  recurrence_next_run_at: string
  project: { name: string } | null
  client: { name: string | null; email: string | null } | null
}

interface InvoiceSettingsRow {
  invoice_prefix: string
  year_format: 'YY' | 'YYYY'
  start_number: number
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function diffDays(a: string, b: string): number {
  const ms = new Date(a).getTime() - new Date(b).getTime()
  return Math.round(ms / 86400000)
}

function advance(interval: RecurrenceInterval, from: Date): Date {
  const next = new Date(from)
  if (interval === 'daily') next.setDate(next.getDate() + 1)
  else if (interval === 'weekly') next.setDate(next.getDate() + 7)
  else if (interval === 'monthly') next.setMonth(next.getMonth() + 1)
  else if (interval === 'yearly') next.setFullYear(next.getFullYear() + 1)
  return next
}

function nextRunAfter(interval: RecurrenceInterval, from: Date, now: Date): Date {
  let next = advance(interval, from)
  // Als de cron heeft hapertingen heeft gehad, kunnen we ver achterlopen.
  // Blijf incrementen tot de volgende run in de toekomst ligt.
  while (next <= now) next = advance(interval, next)
  return next
}

function generateInvoiceNumber(
  prefix: string,
  yearFormat: 'YY' | 'YYYY',
  startNumber: number,
  existingNumbers: string[],
): string {
  const currentYear = new Date().getFullYear()
  const yearStr = yearFormat === 'YY' ? String(currentYear).slice(-2) : String(currentYear)
  const basePrefix = `${prefix}${yearStr}`
  let maxNum = startNumber - 1
  for (const num of existingNumbers) {
    if (num.startsWith(basePrefix)) {
      const suffix = num.slice(basePrefix.length)
      const parsed = parseInt(suffix, 10)
      if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed
    }
  }
  return `${basePrefix}${maxNum + 1}`
}

function formatDateNL(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatAmount(amount: number): string {
  return `€${amount.toFixed(2).replace('.', ',')}`
}

// Verstuurt de klantmail via EmailIt. Gooit bij falen, zodat de aanroeper het
// kan loggen — generatie van de factuur mag er echter niet op stuklopen.
async function sendClientEmail(opts: {
  apiKey: string
  from: string
  recipientEmail: string
  recipientName: string
  projectName: string
  number: string
  amount: number
  dueDate: string | null
  invoiceId: string
}): Promise<void> {
  const invoiceUrl = `${PORTAL_URL}/factuur/${opts.invoiceId}`
  const amountFormatted = formatAmount(opts.amount)
  const dueDateText = formatDateNL(opts.dueDate)

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nieuwe factuur beschikbaar</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#222;font-size:15px;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 24px;font-size:14px;color:#888;">DesignPixels</p>
<p style="margin:0 0 16px;">Hoi ${opts.recipientName},</p>
<p style="margin:0 0 16px;">Voor je domein <strong>${opts.projectName}</strong> staat een nieuwe factuur voor je klaar:</p>
<p style="margin:0 0 16px;"><strong>${opts.number}</strong> — ${amountFormatted}${dueDateText ? `<br><span style="color:#666;font-size:14px;">Vervaldatum: ${dueDateText}</span>` : ''}</p>
<p style="margin:0 0 24px;">Bekijk de factuur en betalingsgegevens via je portaal:</p>
<p style="margin:0 0 24px;"><a href="${invoiceUrl}" style="color:#6b46c1;">${invoiceUrl}</a></p>
<p style="margin:32px 0 0;font-size:14px;color:#888;">Met vriendelijke groet,<br>DesignPixels</p>
</div>
</body>
</html>`

  const text = `Hoi ${opts.recipientName},

Voor je domein ${opts.projectName} staat een nieuwe factuur voor je klaar:

${opts.number} — ${amountFormatted}${dueDateText ? `\nVervaldatum: ${dueDateText}` : ''}

Bekijk de factuur en betalingsgegevens via je portaal:
${invoiceUrl}

Met vriendelijke groet,
DesignPixels`

  const res = await fetch('https://api.emailit.com/v2/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: opts.from,
      to: opts.recipientEmail,
      subject: `Nieuwe factuur voor ${opts.projectName}`,
      html,
      text,
    }),
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`EmailIt API error: ${res.status} ${errorText}`)
  }
}

interface GeneratedRow {
  template_id: string
  new_invoice_id: string
  number: string
  client_name: string
  amount: number
  is_test: boolean
  email_sent: boolean
  email_error?: string
}

// Bouwt en verstuurt de samenvattingsmail naar de admin(s).
async function sendAdminSummary(opts: {
  apiKey: string
  from: string
  to: string[]
  generated: GeneratedRow[]
}): Promise<void> {
  const realCount = opts.generated.filter((g) => !g.is_test).length
  const now = new Date().toLocaleString('nl-NL', { dateStyle: 'full', timeStyle: 'short' })

  const rows = opts.generated.map((g) => {
    const badge = g.is_test ? ' <span style="color:#b45309;font-size:12px;">(test)</span>' : ''
    const mailState = g.email_sent
      ? '<span style="color:#166534;">mail verstuurd</span>'
      : `<span style="color:#b91c1c;">mail mislukt${g.email_error ? `: ${g.email_error}` : ''}</span>`
    return `<tr>
<td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;">${g.number}${badge}</td>
<td style="padding:8px 12px;border-bottom:1px solid #eee;">${g.client_name || '—'}</td>
<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${formatAmount(g.amount)}</td>
<td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;">${mailState}</td>
</tr>`
  }).join('')

  const subject = realCount > 0
    ? `${realCount} terugkerende factuur${realCount === 1 ? '' : 'en'} verstuurd — let op je rekening`
    : `Terugkerende facturen verwerkt (alleen test)`

  const html = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f7fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#222;">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
<div style="background:linear-gradient(135deg,#9e86ff,#7c3aed);padding:28px 32px;">
<h1 style="color:#fff;margin:0;font-size:20px;">Terugkerende facturen verstuurd</h1>
</div>
<div style="padding:28px 32px;">
<p style="margin:0 0 16px;">Er ${opts.generated.length === 1 ? 'is' : 'zijn'} zojuist <strong>${opts.generated.length}</strong> terugkerende factu${opts.generated.length === 1 ? 'ur' : 'ren'} automatisch gegenereerd en naar de klant verstuurd.${realCount > 0 ? ' Houd je rekening de komende dagen extra in de gaten.' : ''}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 0;">
<thead><tr>
<th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd;">Factuur</th>
<th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd;">Klant</th>
<th style="padding:8px 12px;text-align:right;border-bottom:2px solid #ddd;">Bedrag</th>
<th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd;">Klantmail</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">Verwerkt op ${now}</p>
</div>
</div>
</body>
</html>`

  const text = `Terugkerende facturen verstuurd (${now})\n\n` +
    opts.generated.map((g) =>
      `- ${g.number}${g.is_test ? ' (test)' : ''} | ${g.client_name || '—'} | ${formatAmount(g.amount)} | klantmail: ${g.email_sent ? 'verstuurd' : 'mislukt'}`,
    ).join('\n') +
    (realCount > 0 ? '\n\nHoud je rekening de komende dagen extra in de gaten.' : '')

  for (const to of opts.to) {
    try {
      const res = await fetch('https://api.emailit.com/v2/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: opts.from, to, subject, html, text }),
      })
      if (!res.ok) console.error(`Admin summary mail mislukt voor ${to}: ${res.status} ${await res.text()}`)
    } catch (e) {
      console.error(`Admin summary mail exception voor ${to}:`, e instanceof Error ? e.message : String(e))
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const EMAILIT_API_KEY = Deno.env.get('EMAILIT_API_KEY') || ''
    const EMAILIT_FROM = Deno.env.get('EMAILIT_FROM') || 'DesignPixels <noreply@designpixels.nl>'

    const nowIso = new Date().toISOString()
    const { data: templates, error: tplErr } = await db
      .from('invoices')
      .select('*, project:projects(name), client:clients(name, email)')
      .eq('is_recurring', true)
      .not('recurrence_next_run_at', 'is', null)
      .lte('recurrence_next_run_at', nowIso)

    if (tplErr) throw new Error(`Kon templates niet laden: ${tplErr.message}`)

    const due = (templates || []) as unknown as InvoiceTemplate[]
    if (due.length === 0) {
      return new Response(
        JSON.stringify({ success: true, generated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Eén keer settings + bestaande nummers + admin-mails ophalen; we werken de
    // lokale nummerlijst bij voor opeenvolgende inserts in dezelfde run.
    const [settingsRes, numsRes, adminsRes] = await Promise.all([
      db.from('invoice_settings').select('invoice_prefix, year_format, start_number').limit(1).single(),
      db.from('invoices').select('number, is_test, has_temp_number, is_recurring'),
      db.from('profiles').select('email').eq('role', 'admin'),
    ])

    if (settingsRes.error || !settingsRes.data) {
      throw new Error('Factuurinstellingen niet gevonden')
    }
    const settings = settingsRes.data as InvoiceSettingsRow
    // Alleen echte facturen tellen mee voor de nummerreeks. Sjablonen (is_recurring),
    // testfacturen en facturen met een tijdelijk nummer vallen er expliciet buiten,
    // zodat een terugkerend sjabloon nooit een reeksnummer opslokt.
    const realNumbers = (numsRes.data || [])
      .filter((r) => !r.is_test && !r.has_temp_number && !r.is_recurring)
      .map((r) => r.number as string)

    const adminEmails = (adminsRes.data || [])
      .map((a) => (a as { email: string | null }).email)
      .filter((e): e is string => !!e && e.includes('@'))

    const generated: GeneratedRow[] = []
    const errors: { template_id: string; error: string }[] = []

    for (const tpl of due) {
      try {
        // Factuurnummer
        let newNumber: string
        if (tpl.is_test) {
          newNumber = `TEST-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`
        } else {
          newNumber = generateInvoiceNumber(settings.invoice_prefix, settings.year_format, settings.start_number, realNumbers)
          realNumbers.push(newNumber)
        }

        // Datums
        const invoiceDate = todayIso()
        const offset = tpl.invoice_date ? diffDays(tpl.due_date, tpl.invoice_date) : 14
        const dueDate = addDaysIso(invoiceDate, offset > 0 ? offset : 14)

        const insertPayload = {
          number: newNumber,
          project_id: tpl.project_id,
          client_id: tpl.client_id,
          amount: tpl.amount,
          subtotal: tpl.subtotal,
          status: 'sent',
          due_date: dueDate,
          invoice_date: invoiceDate,
          is_test: tpl.is_test,
          client_name: tpl.client_name,
          client_email: tpl.client_email,
          client_address: tpl.client_address,
          items: tpl.items,
          discount_percent: tpl.discount_percent,
          btw_percent: tpl.btw_percent,
          notes: tpl.notes,
          recurring_template_id: tpl.id,
          // Expliciet false zodat de gegenereerde factuur niet zelf een sjabloon wordt.
          is_recurring: false,
          recurrence_interval: null,
          recurrence_next_run_at: null,
        }

        const { data: inserted, error: insErr } = await db
          .from('invoices')
          .insert(insertPayload)
          .select('id')
          .single()

        if (insErr || !inserted) throw new Error(insErr?.message || 'insert mislukt')

        const newNext = nextRunAfter(tpl.recurrence_interval, new Date(tpl.recurrence_next_run_at), new Date())
        const { error: updErr } = await db.from('invoices').update({
          recurrence_last_run_at: nowIso,
          recurrence_next_run_at: newNext.toISOString(),
        }).eq('id', tpl.id)

        if (updErr) throw new Error(`update template: ${updErr.message}`)

        // Snapshot op de template wint van het live klant-adres: één klant kan
        // per domein een ander factuuradres hebben (projects.invoice_email).
        const recipientEmail = tpl.client_email || tpl.client?.email
        const recipientName = tpl.client_name || tpl.client?.name || 'klant'
        const projectName = tpl.project?.name || 'je domein'

        // Klantmail + portaalnotificatie. Niet-fataal: lukt de mail niet, dan blijft
        // de factuur gewoon staan en loggen we de fout in de samenvatting.
        let emailSent = false
        let emailError: string | undefined
        if (!EMAILIT_API_KEY) {
          emailError = 'EMAILIT_API_KEY niet geconfigureerd'
        } else if (!recipientEmail) {
          emailError = 'klant heeft geen e-mailadres'
        } else {
          try {
            await sendClientEmail({
              apiKey: EMAILIT_API_KEY,
              from: EMAILIT_FROM,
              recipientEmail,
              recipientName,
              projectName,
              number: newNumber,
              amount: tpl.amount,
              dueDate,
              invoiceId: inserted.id,
            })
            emailSent = true
          } catch (e) {
            emailError = e instanceof Error ? e.message : String(e)
          }
        }

        // Portaalnotificatie (zelfde patroon als de handmatige "Versturen"-knop).
        const { error: notifErr } = await db.from('client_notifications').insert({
          project_id: tpl.project_id,
          client_id: tpl.client_id,
          type: 'invoice',
          title: 'Nieuwe factuur beschikbaar',
          message: `Er staat een nieuwe factuur (${newNumber}) voor je klaar.`,
          link_url: `/factuur/${inserted.id}`,
        })
        if (notifErr) console.error('Notificatie aanmaken mislukt:', notifErr.message)

        generated.push({
          template_id: tpl.id,
          new_invoice_id: inserted.id,
          number: newNumber,
          client_name: recipientName,
          amount: tpl.amount,
          is_test: tpl.is_test,
          email_sent: emailSent,
          email_error: emailError,
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        errors.push({ template_id: tpl.id, error: message })
      }
    }

    // Eén samenvattingsmail naar de admin(s), zodat Koen weet wanneer hij zijn
    // rekening in de gaten moet houden.
    if (generated.length > 0 && EMAILIT_API_KEY && adminEmails.length > 0) {
      await sendAdminSummary({ apiKey: EMAILIT_API_KEY, from: EMAILIT_FROM, to: adminEmails, generated })
    }

    return new Response(
      JSON.stringify({ success: true, generated: generated.length, items: generated, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('process-recurring-invoices error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
