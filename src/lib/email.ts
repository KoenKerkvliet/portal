const EMAILIT_API_KEY = import.meta.env.VITE_EMAILIT_API_KEY
const EMAILIT_FROM = import.meta.env.VITE_EMAILIT_FROM || 'DesignPixels <noreply@designpixels.nl>'
const BASE_URL = import.meta.env.PROD
  ? 'https://koenkerkvliet.github.io/portal'
  : 'http://localhost:5173/portal'

export async function sendVerificationEmail(email: string, fullName: string, token: string) {
  const verifyUrl = `${BASE_URL}/bevestig?token=${token}`

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
          <h1 style="color:white;margin:0;font-size:22px;font-weight:700;">
            DesignPixels
          </h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#1f2937;margin:0 0 8px;font-size:20px;">
            Welkom, ${fullName}!
          </h2>
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
          <p style="color:#9ca3af;font-size:11px;margin:0;">
            &copy; ${new Date().getFullYear()} DesignPixels
          </p>
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
      to: email,
      subject: 'Bevestig je e-mailadres — DesignPixels',
      html,
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to send verification email')
  }

  return response.json()
}
