// Stuurt een VRIENDELIJKE betalingsherinnering naar de klant voor een openstaande
// factuur. Wordt alleen handmatig door de admin aangeroepen (knop 'Herinnering
// sturen' in het portaal). De toon is bewust zacht en niet beschuldigend: als de
// klant al betaald heeft, mag-ie dit bericht negeren. Alleen aanroepbaar door admins.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PORTAL_URL = 'https://portal.designpixels.nl'

function formatDateNL(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Niet geautoriseerd' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const EMAILIT_API_KEY = Deno.env.get('EMAILIT_API_KEY')
    if (!EMAILIT_API_KEY) throw new Error('EMAILIT_API_KEY not configured')
    const EMAILIT_FROM = Deno.env.get('EMAILIT_FROM') || 'DesignPixels <noreply@designpixels.nl>'
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Identificeer aanroeper en check admin-rol
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Niet ingelogd' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const adminClient = createClient(supabaseUrl, serviceKey)
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (callerProfile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'Geen admin-rechten' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { invoice_id } = await req.json()
    if (!invoice_id || typeof invoice_id !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'invoice_id ontbreekt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: invoice, error: invoiceErr } = await adminClient
      .from('invoices')
      .select('*, project:projects(name), client:clients(name, email)')
      .eq('id', invoice_id)
      .single()

    if (invoiceErr || !invoice) {
      throw new Error(`Factuur niet gevonden: ${invoiceErr?.message || invoice_id}`)
    }

    type InvoiceJoined = {
      number: string
      amount: number
      due_date: string | null
      project: { name: string } | null
      client: { name: string; email: string } | null
      client_name: string | null
      client_email: string | null
    }
    const inv = invoice as unknown as InvoiceJoined

    // Snapshot op de factuur wint van het live klant-adres: één klant kan per
    // domein een ander factuuradres hebben (projects.invoice_email).
    const recipientEmail = inv.client_email || inv.client?.email
    const recipientName = inv.client_name || inv.client?.name || 'klant'
    const projectName = inv.project?.name || 'je domein'

    if (!recipientEmail) {
      throw new Error('Klant heeft geen e-mailadres — kan geen mail sturen')
    }

    const invoiceUrl = `${PORTAL_URL}/factuur/${invoice_id}`
    const amountFormatted = `€${inv.amount.toFixed(2).replace('.', ',')}`
    const dueDateText = formatDateNL(inv.due_date)

    const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vriendelijke herinnering</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#222;font-size:15px;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 24px;font-size:14px;color:#888;">DesignPixels</p>
<p style="margin:0 0 16px;">Hoi ${recipientName},</p>
<p style="margin:0 0 16px;">Een kleine vriendelijke herinnering: voor je domein <strong>${projectName}</strong> staat nog een factuur open.</p>
<p style="margin:0 0 16px;"><strong>${inv.number}</strong> — ${amountFormatted}${dueDateText ? `<br><span style=\"color:#666;font-size:14px;\">Vervaldatum: ${dueDateText}</span>` : ''}</p>
<p style="margin:0 0 24px;">Bekijk de factuur en betalingsgegevens via je portaal:</p>
<p style="margin:0 0 24px;"><a href="${invoiceUrl}" style="color:#6b46c1;">${invoiceUrl}</a></p>
<p style="margin:0 0 24px;color:#666;font-size:14px;">Heb je de betaling inmiddels al gedaan? Dan kun je dit bericht gerust negeren — onze administratie en jouw betaling kruisen elkaar soms even.</p>
<p style="margin:32px 0 0;font-size:14px;color:#888;">Met vriendelijke groet,<br>DesignPixels</p>
</div>
</body>
</html>`

    const text = `Hoi ${recipientName},\n\nEen kleine vriendelijke herinnering: voor je domein ${projectName} staat nog een factuur open.\n\n${inv.number} — ${amountFormatted}${dueDateText ? `\nVervaldatum: ${dueDateText}` : ''}\n\nBekijk de factuur en betalingsgegevens via je portaal:\n${invoiceUrl}\n\nHeb je de betaling inmiddels al gedaan? Dan kun je dit bericht gerust negeren — onze administratie en jouw betaling kruisen elkaar soms even.\n\nMet vriendelijke groet,\nDesignPixels`

    const emailResponse = await fetch('https://api.emailit.com/v2/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EMAILIT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAILIT_FROM,
        to: recipientEmail,
        subject: `Herinnering: openstaande factuur voor ${projectName}`,
        html,
        text,
      }),
    })

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text()
      throw new Error(`EmailIt API error: ${emailResponse.status} ${errorText}`)
    }

    // Leg vast wanneer de klant voor het laatst een herinnering kreeg.
    await adminClient
      .from('invoices')
      .update({ client_reminder_sent_at: new Date().toISOString() })
      .eq('id', invoice_id)

    return new Response(
      JSON.stringify({ success: true, sent_to: recipientEmail }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-invoice-reminder error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
