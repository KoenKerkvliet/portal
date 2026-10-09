// Geeft een handmatig aangemaakte klant portaaltoegang: maakt een auth-user aan,
// koppelt clients.profile_id, en stuurt een welkomstmail. Daarin staat hoe de klant
// zonder wachtwoord inlogt (code per mail, zie login-code), met als optie een link om
// toch een vast wachtwoord in te stellen.
// Met { send_email: false } wordt alleen het account aangemaakt, zonder mail: de klant
// kan dan meteen met een code per mail inloggen als hij zelf naar het portaal gaat.
//
// I.p.v. een Supabase recovery-link (max 1 uur geldig) gebruiken we een eigen invite-token
// dat INVITE_EXPIRY_DAYS geldig blijft. De klant landt op /account-instellen?token=… en kiest
// daar een wachtwoord; de complete-invite function valideert het token en zet het wachtwoord.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Hoe lang de wachtwoord-instel-link geldig blijft. Bewuste trade-off: een lang geldige
// setup-link is iets minder veilig, maar voorkomt dat klanten de link binnen een uur moeten
// gebruiken. Pas dit getal aan om de geldigheidsduur te wijzigen.
const INVITE_EXPIRY_DAYS = 30

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
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

    // Identificeer de aanroeper via diens JWT.
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
      .from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'Geen admin-rechten' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { client_id, send_email } = await req.json()
    const sendEmail = send_email !== false
    if (!client_id || typeof client_id !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'client_id ontbreekt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Haal de klantgegevens server-side — vertrouw geen email/naam uit de body.
    const { data: client, error: clientErr } = await adminClient
      .from('clients').select('id, name, email, profile_id').eq('id', client_id).single()
    if (clientErr || !client) {
      return new Response(
        JSON.stringify({ success: false, error: 'Klant niet gevonden' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    if (client.profile_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Deze klant heeft al portaaltoegang' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    if (!client.email) {
      return new Response(
        JSON.stringify({ success: false, error: 'Klant heeft geen e-mailadres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const email = client.email.trim().toLowerCase()
    const fullName = client.name || email

    // Check of er al een auth-user met dit e-mailadres bestaat (zou normaal niet moeten,
    // maar voorkomt een onbruikbare 422 'already registered' verderop).
    const { data: existingProfiles } = await adminClient
      .from('profiles').select('id, email').eq('email', email).limit(1)
    if (existingProfiles && existingProfiles.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Er bestaat al een account met dit e-mailadres. Koppel die in plaats daarvan.',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Maak auth-user aan, e-mail meteen bevestigd. Random wachtwoord — klant zet z'n eigen
    // via de recovery-link.
    const tempPassword = crypto.randomUUID() + crypto.randomUUID()
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: 'client' },
    })
    if (createErr || !created.user) {
      throw new Error(`Auth-user aanmaken mislukt: ${createErr?.message || 'onbekende fout'}`)
    }

    // Koppel de nieuwe profile aan de bestaande client.
    const { error: updErr } = await adminClient
      .from('clients').update({ profile_id: created.user.id }).eq('id', client_id)
    if (updErr) {
      // Rollback: verwijder de zojuist aangemaakte auth-user, anders blijft 'ie hangen.
      await adminClient.auth.admin.deleteUser(created.user.id)
      throw new Error(`Klant koppelen mislukt: ${updErr.message}`)
    }

    // Zonder uitnodiging: klaar. Geen invite-token nodig (inloggen gaat met een code).
    if (!sendEmail) {
      return new Response(
        JSON.stringify({ success: true, email_sent: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Genereer een eigen invite-token (los van Supabase' recovery-token, dat max 1 uur leeft)
    // en sla de hash op. De klant gebruikt het op /account-instellen om een wachtwoord te kiezen.
    const rawToken = toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
    const tokenHash = await sha256Hex(rawToken)
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { error: inviteErr } = await adminClient.from('client_invites').insert({
      token_hash: tokenHash,
      client_id: client_id,
      profile_id: created.user.id,
      email,
      expires_at: expiresAt,
    })
    if (inviteErr) {
      // Rollback: user + koppeling ongedaan maken zodat 'Geef toegang' opnieuw te proberen is.
      await adminClient.from('clients').update({ profile_id: null }).eq('id', client_id)
      await adminClient.auth.admin.deleteUser(created.user.id)
      throw new Error(`Invite-token opslaan mislukt: ${inviteErr.message}`)
    }

    const setupUrl = `https://portal.designpixels.nl/account-instellen?token=${rawToken}`
    const portalUrl = 'https://portal.designpixels.nl'

    // Inloggen gaat standaard met een code per mail (login-code); het account bestaat al,
    // dus dat werkt meteen. Een vast wachtwoord instellen blijft mogelijk via de setup-link.
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const step = (n: number, html: string) =>
      `<tr><td style="vertical-align:top;padding:0 12px 10px 0;"><span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:12px;background:#f5f3ff;color:#6b46c1;font-weight:700;font-size:13px;">${n}</span></td><td style="padding:2px 0 10px;">${html}</td></tr>`

    const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Je klantportaal staat klaar</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#222;font-size:15px;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 24px;font-size:14px;color:#888;">DesignPixels</p>
<p style="margin:0 0 16px;">Hoi ${esc(fullName)},</p>
<p style="margin:0 0 16px;">Je klantportaal staat voor je klaar. Daar vind je je strippenkaart, kun je nieuwe strippen kopen en zie je welke werkzaamheden ik voor je uitvoer.</p>
<p style="margin:0 0 12px;"><strong>Inloggen gaat zonder wachtwoord:</strong></p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
${step(1, 'Ga naar je portaal via de knop hieronder.')}
${step(2, `Vul je e-mailadres in: <strong>${esc(email)}</strong>`)}
${step(3, 'Kies <strong>Inloggen met een code per mail</strong> en vul de code van 6 cijfers in die je dan ontvangt.')}
</table>
<p style="margin:0 0 24px;"><a href="${portalUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;">Naar je portaal</a></p>
<p style="margin:0 0 16px;color:#666;font-size:14px;">Liever een vast wachtwoord? <a href="${setupUrl}" style="color:#6b46c1;">Stel het hier in</a>. Deze link is ${INVITE_EXPIRY_DAYS} dagen geldig; daarna kun je altijd nog met een code inloggen.</p>
<p style="margin:32px 0 0;font-size:14px;color:#888;">Met vriendelijke groet,<br>DesignPixels</p>
</div>
</body>
</html>`

    const text = `Hoi ${fullName},

Je klantportaal staat voor je klaar. Daar vind je je strippenkaart, kun je nieuwe strippen kopen en zie je welke werkzaamheden ik voor je uitvoer.

Inloggen gaat zonder wachtwoord:
1. Ga naar je portaal: ${portalUrl}
2. Vul je e-mailadres in: ${email}
3. Kies "Inloggen met een code per mail" en vul de code van 6 cijfers in die je dan ontvangt.

Liever een vast wachtwoord? Stel het hier in (${INVITE_EXPIRY_DAYS} dagen geldig; daarna kun je altijd nog met een code inloggen):
${setupUrl}

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
        subject: 'Je klantportaal bij DesignPixels staat klaar',
        html,
        text,
      }),
    })

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text()
      throw new Error(`EmailIt API error: ${emailResponse.status} ${errorText}`)
    }

    return new Response(
      JSON.stringify({ success: true, email_sent: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('invite-client error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
