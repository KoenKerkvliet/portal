// Dagelijkse cron-functie: stuurt KOEN (admin) een mail wanneer er openstaande
// facturen zijn die binnen 3 dagen vervallen en nog niet betaald zijn. De klant
// krijgt hier NIETS van — die herinnering stuurt Koen handmatig per factuur via
// de knop 'Herinnering sturen' (send-invoice-reminder). Zo voorkomen we dat een
// klant onterecht een aanmaning krijgt terwijl de betaling al binnen is maar nog
// niet verwerkt.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PORTAL_URL = 'https://portal.designpixels.nl'

function formatDateNL(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function euro(n: number): string {
  return `€${n.toFixed(2).replace('.', ',')}`
}

Deno.serve(async () => {
  try {
    const EMAILIT_API_KEY = Deno.env.get('EMAILIT_API_KEY')
    if (!EMAILIT_API_KEY) throw new Error('EMAILIT_API_KEY not configured')
    const EMAILIT_FROM = Deno.env.get('EMAILIT_FROM') || 'DesignPixels <noreply@designpixels.nl>'
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const db = createClient(supabaseUrl, serviceKey)

    // Bepaal de grens: facturen die vandaag t/m over 3 dagen vervallen.
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const limit = new Date(today)
    limit.setDate(limit.getDate() + 3)
    const todayStr = today.toISOString().slice(0, 10)
    const limitStr = limit.toISOString().slice(0, 10)

    // Openstaande, echte facturen met vervaldatum binnen het venster, nog niet
    // gewaarschuwd.
    const { data: invoices, error: invErr } = await db
      .from('invoices')
      .select('id, number, amount, due_date, client_name, client:clients(name), project:projects(name)')
      .eq('status', 'sent')
      .eq('is_test', false)
      .eq('has_temp_number', false)
      .eq('is_recurring', false)
      .is('payment_reminder_sent_at', null)
      .not('due_date', 'is', null)
      .gte('due_date', todayStr)
      .lte('due_date', limitStr)
      .order('due_date', { ascending: true })

    if (invErr) throw new Error(`Facturen ophalen mislukt: ${invErr.message}`)

    if (!invoices || invoices.length === 0) {
      return new Response(
        JSON.stringify({ success: true, count: 0, message: 'Geen aankomende vervaldatums' }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    type Row = {
      id: string
      number: string
      amount: number
      due_date: string | null
      client_name: string | null
      client: { name: string } | null
      project: { name: string } | null
    }
    const rows = invoices as unknown as Row[]

    // Admin-ontvangers
    const { data: admins } = await db.from('profiles').select('email').eq('role', 'admin')
    const adminEmails = (admins || []).map((a) => a.email as string).filter(Boolean)
    if (adminEmails.length === 0) {
      const fallback = Deno.env.get('ADMIN_EMAIL') || 'koen.kerkvliet@designpixels.nl'
      adminEmails.push(fallback)
    }

    const listHtml = rows
      .map((r) => {
        const client = r.client?.name || r.client_name || 'onbekend'
        const domain = r.project?.name || ''
        const url = `${PORTAL_URL}/factuur/${r.id}`
        return `<tr>
<td style="padding:8px 12px;border-bottom:1px solid #eee;"><a href="${url}" style="color:#6b46c1;text-decoration:none;">${r.number}</a></td>
<td style="padding:8px 12px;border-bottom:1px solid #eee;">${client}${domain ? ` <span style=\"color:#888;\">(${domain})</span>` : ''}</td>
<td style="padding:8px 12px;border-bottom:1px solid #eee;">${euro(r.amount)}</td>
<td style="padding:8px 12px;border-bottom:1px solid #eee;">${formatDateNL(r.due_date)}</td>
</tr>`
      })
      .join('')

    const html = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#222;font-size:15px;line-height:1.55;">
<div style="max-width:640px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 24px;font-size:14px;color:#888;">DesignPixels — interne melding</p>
<p style="margin:0 0 16px;">Hoi Koen,</p>
<p style="margin:0 0 16px;">De volgende ${rows.length === 1 ? 'factuur vervalt' : 'facturen vervallen'} binnen 3 dagen en ${rows.length === 1 ? 'staat' : 'staan'} nog op <strong>openstaand</strong>:</p>
<table style="border-collapse:collapse;width:100%;margin:0 0 24px;font-size:14px;">
<thead><tr>
<th style="text-align:left;padding:8px 12px;border-bottom:2px solid #ddd;">Factuur</th>
<th style="text-align:left;padding:8px 12px;border-bottom:2px solid #ddd;">Klant</th>
<th style="text-align:left;padding:8px 12px;border-bottom:2px solid #ddd;">Bedrag</th>
<th style="text-align:left;padding:8px 12px;border-bottom:2px solid #ddd;">Vervaldatum</th>
</tr></thead>
<tbody>${listHtml}</tbody>
</table>
<p style="margin:0 0 16px;">Controleer je rekening. Is een betaling al binnen maar nog niet verwerkt? Verwerk ‘m dan even. Is er nog niets binnen? Dan kun je de klant via het portaal een vriendelijke herinnering sturen met de knop <strong>Herinnering sturen</strong>.</p>
<p style="margin:24px 0 0;font-size:14px;color:#888;">Deze melding is automatisch verstuurd. De klant heeft hierover niets ontvangen.</p>
</div>
</body>
</html>`

    const text = `Hoi Koen,\n\nDe volgende facturen vervallen binnen 3 dagen en staan nog op openstaand:\n\n` +
      rows.map((r) => {
        const client = r.client?.name || r.client_name || 'onbekend'
        return `- ${r.number} | ${client} | ${euro(r.amount)} | vervalt ${formatDateNL(r.due_date)}`
      }).join('\n') +
      `\n\nControleer je rekening. Stuur de klant zo nodig handmatig een herinnering via het portaal.\n\n(Automatische interne melding — de klant heeft niets ontvangen.)`

    const emailResponse = await fetch('https://api.emailit.com/v2/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${EMAILIT_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: EMAILIT_FROM,
        to: adminEmails.join(','),
        subject: `${rows.length} factuur/facturen vervalt binnen 3 dagen — nog niet betaald`,
        html,
        text,
      }),
    })

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text()
      throw new Error(`EmailIt API error: ${emailResponse.status} ${errorText}`)
    }

    // Markeer als gewaarschuwd zodat we niet elke dag opnieuw mailen.
    const ids = rows.map((r) => r.id)
    await db.from('invoices').update({ payment_reminder_sent_at: new Date().toISOString() }).in('id', ids)

    return new Response(
      JSON.stringify({ success: true, count: rows.length, sent_to: adminEmails }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-payment-reminders error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
