// Verstuurt een mail naar de klant zodra de admin een offerte aan een domeinkaart
// koppelt. Klant krijgt linkje naar /offerte/:id in het portaal. Alleen aanroepbaar
// door admins (op basis van de aanroepende JWT + role-check op profiles).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PORTAL_URL = 'https://portal.designpixels.nl'

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

    const { quote_id } = await req.json()
    if (!quote_id || typeof quote_id !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'quote_id ontbreekt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Haal offerte + klant + project op (denormalized fields zijn primary; join als fallback)
    const { data: quote, error: quoteErr } = await adminClient
      .from('quotes')
      .select('*, project:projects(name), client:clients(name, email)')
      .eq('id', quote_id)
      .single()

    if (quoteErr || !quote) {
      throw new Error(`Offerte niet gevonden: ${quoteErr?.message || quote_id}`)
    }

    type QuoteJoined = {
      number: string
      amount: number
      project: { name: string } | null
      client: { name: string; email: string } | null
      client_name: string | null
      client_email: string | null
    }
    const q = quote as unknown as QuoteJoined

    const recipientEmail = q.client?.email || q.client_email
    const recipientName = q.client?.name || q.client_name || 'klant'
    const projectName = q.project?.name || 'je project'

    if (!recipientEmail) {
      throw new Error('Klant heeft geen e-mailadres — kan geen mail sturen')
    }

    const quoteUrl = `${PORTAL_URL}/offerte/${quote_id}`
    const amountFormatted = `€${q.amount.toFixed(2).replace('.', ',')}`

    const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nieuwe offerte beschikbaar</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#222;font-size:15px;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 24px;font-size:14px;color:#888;">DesignPixels</p>
<p style="margin:0 0 16px;">Hoi ${recipientName},</p>
<p style="margin:0 0 16px;">Voor je project <strong>${projectName}</strong> staat een nieuwe offerte voor je klaar:</p>
<p style="margin:0 0 16px;"><strong>${q.number}</strong> — ${amountFormatted}</p>
<p style="margin:0 0 24px;">Bekijk en accordeer de offerte via je portaal:</p>
<p style="margin:0 0 24px;"><a href="${quoteUrl}" style="color:#6b46c1;">${quoteUrl}</a></p>
<p style="margin:0 0 16px;color:#666;font-size:14px;">Inloggen is nodig — als je nog geen account hebt, registreer je dan eerst via het portaal.</p>
<p style="margin:32px 0 0;font-size:14px;color:#888;">Met vriendelijke groet,<br>DesignPixels</p>
</div>
</body>
</html>`

    const text = `Hoi ${recipientName},

Voor je project ${projectName} staat een nieuwe offerte voor je klaar:

${q.number} — ${amountFormatted}

Bekijk en accordeer de offerte via je portaal:
${quoteUrl}

Inloggen is nodig — als je nog geen account hebt, registreer je dan eerst via het portaal.

Met vriendelijke groet,
DesignPixels`

    const emailResponse = await fetch('https://api.emailit.com/v2/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EMAILIT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAILIT_FROM,
        to: recipientEmail,
        subject: `Nieuwe offerte voor ${projectName}`,
        html,
        text,
      }),
    })

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text()
      throw new Error(`EmailIt API error: ${emailResponse.status} ${errorText}`)
    }

    return new Response(
      JSON.stringify({ success: true, sent_to: recipientEmail }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-quote-email error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
