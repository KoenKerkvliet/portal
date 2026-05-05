// Verwijdert een gebruiker definitief uit Supabase Auth (en daarmee profiles via CASCADE).
// Alleen aanroepbaar door admins. Doel: e-mailadres weer vrijmaken zodat opnieuw
// geregistreerd kan worden.

import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    // Service-role client voor admin-acties.
    const adminClient = createClient(supabaseUrl, serviceKey)

    // Check of de aanroeper admin is.
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

    const { user_id } = await req.json()
    if (!user_id || typeof user_id !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'user_id ontbreekt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Veiligheid: voorkom dat een admin zichzelf wegtikt.
    if (user_id === user.id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Je kunt jezelf niet verwijderen' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Profiles-rij expliciet weg, voor het geval er geen ON DELETE CASCADE op de FK staat.
    await adminClient.from('profiles').delete().eq('id', user_id)

    // Daarna de auth-user. Dit maakt het e-mailadres weer vrij voor registratie.
    const { error: delErr } = await adminClient.auth.admin.deleteUser(user_id)
    if (delErr) {
      throw new Error(`Auth-user verwijderen mislukt: ${delErr.message}`)
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('delete-user error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
