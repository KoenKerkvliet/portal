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

    const { email, fullName } = await req.json()
    if (!email || !fullName) {
      throw new Error('Missing email or fullName')
    }

    // Use Supabase Admin API to generate a proper verification link
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email,
      options: {
        redirectTo: 'https://koenkerkvliet.github.io/portal/bevestig',
      },
    })

    if (linkError) {
      throw new Error(`Failed to generate verification link: ${linkError.message}`)
    }

    // Extract the token_hash and type from the generated link
    const actionLink = linkData.properties.action_link
    const url = new URL(actionLink)
    const tokenHash = url.searchParams.get('token')
    const type = url.searchParams.get('type')

    // Build the verification URL pointing to the app
    const verifyUrl = `https://koenkerkvliet.github.io/portal/bevestig?token_hash=${tokenHash}&type=${type}`

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;background-color:#f8f7fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:480px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
          <div style="background:linear-gradient(135deg,#9e86ff,#7c3aed);padding:32px;text-align:center;">
            <h1 style="color:white;margin:0;font-size:22px;font-weight:700;">DesignPixels</h1>
          </div>
          <div style="padding:32px;">
            <h2 style="color:#1f2937;margin:0 0 8px;font-size:20px;">Welkom, ${fullName}!</h2>
            <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
              Bedankt voor je registratie. Klik op de knop hieronder om je e-mailadres te bevestigen en toegang te krijgen tot je portaal.
            </p>
            <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(135deg,#9e86ff,#7c3aed);color:white;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:600;font-size:14px;">
              E-mail bevestigen
            </a>
            <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:24px 0 0;">
              Werkt de knop niet? Kopieer dan deze link:<br>
              <a href="${verifyUrl}" style="color:#9e86ff;word-break:break-all;">${verifyUrl}</a>
            </p>
          </div>
          <div style="padding:16px 32px;background:#f9fafb;text-align:center;">
            <p style="color:#9ca3af;font-size:11px;margin:0;">&copy; ${new Date().getFullYear()} DesignPixels</p>
          </div>
        </div>
      </body>
      </html>
    `

    const emailResponse = await fetch('https://api.emailit.com/v2/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EMAILIT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAILIT_FROM,
        to: email,
        subject: 'Bevestig je e-mailadres — DesignPixels',
        html,
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
