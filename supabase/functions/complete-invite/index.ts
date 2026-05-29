// Voltooit een klant-uitnodiging: valideert een invite-token (uit client_invites) en zet
// op verzoek het wachtwoord van de gekoppelde auth-user. Publiek aanroepbaar (de klant is nog
// niet ingelogd) — de beveiliging zit in het 32-byte random token zelf + expiry + used_at.
//
// Twee modi, beide POST:
//   { token }            → valideer alleen; antwoordt { success, valid, email }
//   { token, password }  → valideer + zet wachtwoord; antwoordt { success }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceKey)

    const { token, password } = await req.json().catch(() => ({}))
    if (!token || typeof token !== 'string') {
      return json({ success: false, error: 'Token ontbreekt' }, 400)
    }

    const tokenHash = await sha256Hex(token)
    const { data: invite } = await adminClient
      .from('client_invites')
      .select('id, profile_id, email, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .single()

    if (!invite) {
      return json({ success: false, error: 'Deze link is ongeldig.' }, 404)
    }
    if (invite.used_at) {
      return json({ success: false, error: 'Deze link is al gebruikt.' }, 410)
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return json({ success: false, error: 'Deze link is verlopen.' }, 410)
    }

    // Alleen valideren (pagina-load): geef het e-mailadres terug zodat de klant ziet
    // voor welk account 'ie een wachtwoord instelt.
    if (password === undefined || password === null) {
      return json({ success: true, valid: true, email: invite.email })
    }

    if (typeof password !== 'string' || password.length < 6) {
      return json({ success: false, error: 'Wachtwoord moet minimaal 6 tekens bevatten.' }, 400)
    }

    const { error: updErr } = await adminClient.auth.admin.updateUserById(invite.profile_id, {
      password,
      email_confirm: true,
    })
    if (updErr) {
      throw new Error(`Wachtwoord instellen mislukt: ${updErr.message}`)
    }

    // Markeer het token als gebruikt (eenmalig bruikbaar).
    await adminClient.from('client_invites').update({ used_at: new Date().toISOString() }).eq('id', invite.id)

    return json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('complete-invite error:', message)
    return json({ success: false, error: message }, 500)
  }
})
