// Geeft een handmatig aangemaakte klant portaaltoegang: maakt een auth-user aan,
// koppelt clients.profile_id, en stuurt een welkomstmail met een wachtwoord-instel-link.
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

    const { client_id } = await req.json()
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

    const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welkom bij DesignPixels</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#222;font-size:15px;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 24px;font-size:14px;color:#888;">DesignPixels</p>
<p style="margin:0 0 16px;">Hoi ${fullName},</p>
<p style="margin:0 0 16px;">Je portaal staat voor je klaar. Kies via onderstaande link een wachtwoord, daarna kun je direct inloggen op je klantportaal:</p>
<p style="margin:0 0 24px;"><a href="${setupUrl}" style="color:#6b46c1;">${setupUrl}</a></p>
<p style="margin:0 0 16px;">Log straks in met het e-mailadres waarop je deze mail hebt ontvangen (<strong>${email}</strong>) — daarmee is je account aan je klantgegevens gekoppeld.</p>
<p style="margin:0 0 16px;color:#666;font-size:14px;">De link blijft ${INVITE_EXPIRY_DAYS} dagen geldig. Lukt het niet op tijd? Vraag dan via de inlogpagina een nieuwe wachtwoord-link aan.</p>
<p style="margin:32px 0 0;font-size:14px;color:#888;">Met vriendelijke groet,<br>DesignPixels</p>
</div>
</body>
</html>`

    const text = `Hoi ${fullName},

Je portaal staat voor je klaar. Kies via onderstaande link een wachtwoord, daarna kun je direct inloggen op je klantportaal:

${setupUrl}

Log straks in met het e-mailadres waarop je deze mail hebt ontvangen (${email}) — daarmee is je account aan je klantgegevens gekoppeld.

De link blijft ${INVITE_EXPIRY_DAYS} dagen geldig. Lukt het niet op tijd? Vraag dan via de inlogpagina een nieuwe wachtwoord-link aan.

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
        subject: 'Welkom bij DesignPixels — kies je wachtwoord',
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
    console.error('invite-client error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
