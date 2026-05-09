// Geeft een handmatig aangemaakte klant portaaltoegang: maakt een auth-user aan,
// koppelt clients.profile_id, en stuurt een welkomstmail met een wachtwoord-instel-link
// (recovery-flow → /wachtwoord-reset).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Genereer een recovery-link → klant landt op /wachtwoord-reset om wachtwoord te kiezen.
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: 'https://portal.designpixels.nl/wachtwoord-reset' },
    })
    if (linkErr || !linkData?.properties?.action_link) {
      throw new Error(`Wachtwoord-link genereren mislukt: ${linkErr?.message || 'geen link'}`)
    }

    const setupUrl = linkData.properties.action_link

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
<p style="margin:0 0 16px;color:#666;font-size:14px;">De link blijft 1 uur geldig. Lukt het niet op tijd? Vraag dan via de inlogpagina een nieuwe wachtwoord-link aan.</p>
<p style="margin:32px 0 0;font-size:14px;color:#888;">Met vriendelijke groet,<br>DesignPixels</p>
</div>
</body>
</html>`

    const text = `Hoi ${fullName},

Je portaal staat voor je klaar. Kies via onderstaande link een wachtwoord, daarna kun je direct inloggen op je klantportaal:

${setupUrl}

De link blijft 1 uur geldig. Lukt het niet op tijd? Vraag dan via de inlogpagina een nieuwe wachtwoord-link aan.

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
