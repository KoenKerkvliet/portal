import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const EMAILIT_API_KEY = Deno.env.get('EMAILIT_API_KEY')
    if (!EMAILIT_API_KEY) {
      throw new Error('EMAILIT_API_KEY not configured')
    }

    const EMAILIT_FROM = Deno.env.get('EMAILIT_FROM') || 'DesignPixels <noreply@designpixels.nl>'

    const { email, password, fullName } = await req.json()
    if (!email || !password || !fullName) {
      throw new Error('Missing email, password, or fullName')
    }

    // Use Supabase Admin API to create user AND generate verification link
    // generateLink with type 'signup' + password creates the user without sending Supabase's default email
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: 'client',
        },
        redirectTo: 'https://portal.designpixels.nl/bevestig',
      },
    })

    if (linkError) {
      throw new Error(`Failed to generate verification link: ${linkError.message}`)
    }

    // Use the Supabase action_link directly — Supabase verifies the token server-side
    // and redirects to the app with access_token & refresh_token in the URL hash.
    // This avoids GitHub Pages SPA routing issues with query parameters.
    const verifyUrl = linkData.properties.action_link

    const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bevestig je e-mailadres</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#222;font-size:15px;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 24px;font-size:14px;color:#888;">DesignPixels</p>
<p style="margin:0 0 16px;">Hoi ${fullName},</p>
<p style="margin:0 0 16px;">Welkom bij DesignPixels. Bevestig je e-mailadres via onderstaande link om toegang te krijgen tot je portaal:</p>
<p style="margin:0 0 24px;"><a href="${verifyUrl}" style="color:#6b46c1;">${verifyUrl}</a></p>
<p style="margin:0 0 16px;color:#666;font-size:14px;">Heb je je niet aangemeld? Negeer deze mail.</p>
<p style="margin:32px 0 0;font-size:14px;color:#888;">Met vriendelijke groet,<br>DesignPixels</p>
</div>
</body>
</html>`

    const text = `Hoi ${fullName},

Welkom bij DesignPixels. Bevestig je e-mailadres via onderstaande link om toegang te krijgen tot je portaal:

${verifyUrl}

Heb je je niet aangemeld? Negeer deze mail.

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
        subject: 'Bevestig je e-mailadres',
        html,
        text,
      }),
    })

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text()
      throw new Error(`EmailIt API error: ${emailResponse.status} ${errorText}`)
    }

    const data = await emailResponse.json()

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
