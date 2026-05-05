// Verstuurt een wachtwoord-reset-mail via EmailIt met een door Supabase Admin API
// gegenereerde recovery-link. Zelfde patroon als send-verification-email.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const EMAILIT_API_KEY = Deno.env.get('EMAILIT_API_KEY')
    if (!EMAILIT_API_KEY) throw new Error('EMAILIT_API_KEY not configured')

    const EMAILIT_FROM = Deno.env.get('EMAILIT_FROM') || 'DesignPixels <noreply@designpixels.nl>'

    const { email } = await req.json()
    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'E-mailadres ontbreekt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: 'https://portal.designpixels.nl/wachtwoord-reset',
      },
    })

    // Bestaat het account niet? Stil success retourneren — geen account-existence leak.
    if (linkError || !linkData?.properties?.action_link) {
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const resetUrl = linkData.properties.action_link

    const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Wachtwoord opnieuw instellen</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#222;font-size:15px;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 24px;font-size:14px;color:#888;">DesignPixels</p>
<p style="margin:0 0 16px;">Hoi,</p>
<p style="margin:0 0 16px;">Je hebt een wachtwoord-reset aangevraagd voor je DesignPixels-account. Klik op onderstaande link om een nieuw wachtwoord in te stellen:</p>
<p style="margin:0 0 24px;"><a href="${resetUrl}" style="color:#6b46c1;">${resetUrl}</a></p>
<p style="margin:0 0 16px;color:#666;font-size:14px;">De link blijft 1 uur geldig. Heb je dit niet aangevraagd? Negeer deze mail dan.</p>
<p style="margin:32px 0 0;font-size:14px;color:#888;">Met vriendelijke groet,<br>DesignPixels</p>
</div>
</body>
</html>`

    const text = `Hoi,

Je hebt een wachtwoord-reset aangevraagd voor je DesignPixels-account. Klik op onderstaande link om een nieuw wachtwoord in te stellen:

${resetUrl}

De link blijft 1 uur geldig. Heb je dit niet aangevraagd? Negeer deze mail dan.

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
        to: email,
        subject: 'Wachtwoord opnieuw instellen',
        html,
        text,
      }),
    })

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text()
      throw new Error(`EmailIt API error: ${emailResponse.status} ${errorText}`)
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-password-reset-email error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
