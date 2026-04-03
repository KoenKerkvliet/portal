import { corsHeaders } from '../_shared/cors.ts'

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

    // Read recipient from request body
    const body = await req.json().catch(() => ({}))
    const to = body.to
    if (!to || typeof to !== 'string' || !to.includes('@')) {
      throw new Error('Geen geldig e-mailadres opgegeven')
    }

    const now = new Date().toLocaleString('nl-NL', { dateStyle: 'full', timeStyle: 'short' })

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
            <h2 style="color:#1f2937;margin:0 0 8px;font-size:20px;">Testmail</h2>
            <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
              Dit is een testmail vanuit het klantportaal. Als je deze e-mail ontvangt, werkt de EmailIt v2 integratie correct!
            </p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;text-align:center;">
              <p style="color:#166534;font-size:14px;font-weight:600;margin:0;">EmailIt v2 integratie werkt!</p>
            </div>
            <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:24px 0 0;">Verzonden op: ${now}</p>
          </div>
          <div style="padding:16px 32px;background:#f9fafb;text-align:center;">
            <p style="color:#9ca3af;font-size:11px;margin:0;">&copy; ${new Date().getFullYear()} DesignPixels</p>
          </div>
        </div>
      </body>
      </html>
    `

    const response = await fetch('https://api.emailit.com/v2/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EMAILIT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAILIT_FROM,
        to,
        subject: 'Testmail — DesignPixels Klantportaal',
        html,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`EmailIt API error: ${response.status} ${errorText}`)
    }

    const data = await response.json()

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
