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
    const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || 'koen.kerkvliet@designpixels.nl'

    const body = await req.json()
    const { action, quoteNumber, clientName, projectName, remarks, declineReason } = body

    if (!action || !quoteNumber) {
      throw new Error('Missing required fields')
    }

    const isAccepted = action === 'accepted'
    const statusLabel = isAccepted ? 'geaccepteerd' : 'afgekeurd'
    const statusColor = isAccepted ? '#16a34a' : '#dc2626'
    const statusBg = isAccepted ? '#f0fdf4' : '#fef2f2'
    const statusBorder = isAccepted ? '#bbf7d0' : '#fecaca'
    const statusEmoji = isAccepted ? '✅' : '❌'

    let detailsHtml = ''
    if (remarks) {
      detailsHtml += `
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-top:16px;">
          <p style="color:#6b7280;font-size:12px;font-weight:600;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.05em;">Opmerking van klant</p>
          <p style="color:#374151;font-size:14px;line-height:1.6;margin:0;">${remarks}</p>
        </div>
      `
    }
    if (declineReason) {
      detailsHtml += `
        <div style="background:${statusBg};border:1px solid ${statusBorder};border-radius:12px;padding:16px;margin-top:16px;">
          <p style="color:#6b7280;font-size:12px;font-weight:600;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.05em;">Reden van afwijzing</p>
          <p style="color:#374151;font-size:14px;line-height:1.6;margin:0;">${declineReason}</p>
        </div>
      `
    }

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
            <h2 style="color:#1f2937;margin:0 0 8px;font-size:20px;">${statusEmoji} Offerte ${statusLabel}</h2>
            <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
              De offerte <strong>${quoteNumber}</strong> is ${statusLabel} door <strong>${clientName || 'de klant'}</strong>.
            </p>
            <div style="background:${statusBg};border:1px solid ${statusBorder};border-radius:12px;padding:16px;">
              <table style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="color:#6b7280;font-size:13px;padding:4px 0;">Offerte</td>
                  <td style="color:#1f2937;font-size:13px;font-weight:600;text-align:right;padding:4px 0;">${quoteNumber}</td>
                </tr>
                <tr>
                  <td style="color:#6b7280;font-size:13px;padding:4px 0;">Klant</td>
                  <td style="color:#1f2937;font-size:13px;font-weight:600;text-align:right;padding:4px 0;">${clientName || '-'}</td>
                </tr>
                <tr>
                  <td style="color:#6b7280;font-size:13px;padding:4px 0;">Domein</td>
                  <td style="color:#1f2937;font-size:13px;font-weight:600;text-align:right;padding:4px 0;">${projectName || '-'}</td>
                </tr>
                <tr>
                  <td style="color:#6b7280;font-size:13px;padding:4px 0;">Status</td>
                  <td style="color:${statusColor};font-size:13px;font-weight:700;text-align:right;padding:4px 0;">${statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)}</td>
                </tr>
              </table>
            </div>
            ${detailsHtml}
            <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:24px 0 0;">
              ${new Date().toLocaleString('nl-NL', { dateStyle: 'full', timeStyle: 'short' })}
            </p>
          </div>
          <div style="padding:16px 32px;background:#f9fafb;text-align:center;">
            <p style="color:#9ca3af;font-size:11px;margin:0;">&copy; ${new Date().getFullYear()} DesignPixels</p>
          </div>
        </div>
      </body>
      </html>
    `

    const subject = isAccepted
      ? `Offerte ${quoteNumber} is geaccepteerd door ${clientName || 'klant'}`
      : `Offerte ${quoteNumber} is afgekeurd door ${clientName || 'klant'}`

    const response = await fetch('https://api.emailit.com/v2/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EMAILIT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAILIT_FROM,
        to: ADMIN_EMAIL,
        subject,
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
