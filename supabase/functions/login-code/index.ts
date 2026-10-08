// Inloggen met een 6-cijferige code uit de mail, naast inloggen met wachtwoord.
//
//   { action: 'request', email }       — stuurt een code (als er een account is)
//   { action: 'verify', email, code }  — controleert de code en geeft een eenmalige
//                                         token_hash terug; de inlogpagina maakt daarmee
//                                         via supabase.auth.verifyOtp een sessie aan
//
// Beveiliging:
//   - code 10 minuten geldig, eenmalig, max 5 pogingen; een nieuwe aanvraag maakt
//     eerdere codes ongeldig
//   - alleen een gesalte SHA-256-hash wordt bewaard (tabel login_codes, alleen service_role)
//   - max 3 aanvragen per e-mailadres en 10 per IP per kwartier
//   - altijd hetzelfde antwoord op een aanvraag, of er nu een account is of niet
//   - maakt nooit een account aan
// verify_jwt = false (zie supabase/config.toml): de bezoeker is nog niet ingelogd.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { escapeHtml, mailLayout, sendMail } from '../_shared/projectMail.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CODE_TTL_MINUTES = 10
const MAX_ATTEMPTS = 5
const WINDOW_MINUTES = 15
const MAX_REQUESTS_PER_EMAIL = 3
const MAX_REQUESTS_PER_IP = 10
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const toHex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

async function hashCode(code: string, salt: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${code}`))
  return toHex(new Uint8Array(digest))
}

// Vergelijking in constante tijd, zodat de responstijd niets over de code verraadt
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Gelijkmatig verdeelde 6-cijferige code (rejection sampling, geen modulo-bias)
function newCode() {
  const limit = Math.floor(0xffffffff / 1_000_000) * 1_000_000
  const buf = new Uint32Array(1)
  do { crypto.getRandomValues(buf) } while (buf[0] >= limit)
  return String(buf[0] % 1_000_000).padStart(6, '0')
}

const clientIp = (req: Request) =>
  (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'onbekend'

async function handleRequest(db: SupabaseClient, email: string, ip: string) {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString()

  // Opruimen: oude aanvragen zijn niet meer nodig
  await db.from('login_codes').delete().lt('created_at', new Date(Date.now() - 24 * 3600_000).toISOString())

  const [{ count: perEmail }, { count: perIp }] = await Promise.all([
    db.from('login_codes').select('id', { count: 'exact', head: true }).eq('email', email).gte('created_at', since),
    db.from('login_codes').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', since),
  ])
  if ((perEmail || 0) >= MAX_REQUESTS_PER_EMAIL || (perIp || 0) >= MAX_REQUESTS_PER_IP) {
    return json({ success: false, error: 'Te veel aanvragen. Probeer het over een kwartier opnieuw.' }, 429)
  }

  // Bestaat er een account? (profielen worden met een kleine-letter-e-mailadres bewaard)
  const { data: profiles } = await db.from('profiles').select('id, email, full_name').ilike('email', email).limit(5)
  const profile = (profiles || []).find(p => (p.email as string | null)?.toLowerCase() === email)

  // Eerdere, nog niet gebruikte codes voor dit adres vervallen
  await db.from('login_codes').update({ used_at: new Date().toISOString() }).eq('email', email).is('used_at', null)

  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString()
  if (!profile) {
    // Geen account: alleen vastleggen voor de limiet, verder hetzelfde antwoord
    await db.from('login_codes').insert({ email, ip, expires_at: expiresAt })
    return json({ success: true })
  }

  const code = newCode()
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)))
  const { error } = await db.from('login_codes').insert({ email, ip, salt, code_hash: await hashCode(code, salt), expires_at: expiresAt })
  if (error) throw new Error(`Code opslaan mislukt: ${error.message}`)

  const name = (profile.full_name as string | null)?.trim()
  const subject = `Je inlogcode: ${code}`
  const html = mailLayout(subject, `<p style="margin:0 0 16px;">Hoi${name ? ` ${escapeHtml(name)}` : ''},</p>
<p style="margin:0 0 16px;">Gebruik deze code om in te loggen op je DesignPixels-portaal:</p>
<p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:8px;color:#4c1d95;font-family:Menlo,Consolas,monospace;">${code}</p>
<p style="margin:0 0 16px;color:#666;font-size:14px;">De code is ${CODE_TTL_MINUTES} minuten geldig en werkt één keer. Heb je dit niet aangevraagd? Negeer deze mail dan; zonder de code kan niemand inloggen.</p>`)
  const text = `Hoi${name ? ` ${name}` : ''},

Gebruik deze code om in te loggen op je DesignPixels-portaal:

${code}

De code is ${CODE_TTL_MINUTES} minuten geldig en werkt één keer. Heb je dit niet aangevraagd? Negeer deze mail dan; zonder de code kan niemand inloggen.

Met vriendelijke groet,
DesignPixels`

  if (!(await sendMail(email, subject, html, text))) throw new Error('Mail versturen mislukt')
  return json({ success: true })
}

async function handleVerify(db: SupabaseClient, email: string, code: string) {
  const invalid = () => json({ success: false, error: 'De code is ongeldig of verlopen. Vraag een nieuwe code aan.' }, 400)
  if (!/^\d{6}$/.test(code)) return json({ success: false, error: 'Vul de 6 cijfers uit de mail in.' }, 400)

  const { data: row } = await db
    .from('login_codes')
    .select('id, code_hash, salt, attempts')
    .eq('email', email)
    .is('used_at', null)
    .not('code_hash', 'is', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!row) return invalid()

  if (row.attempts >= MAX_ATTEMPTS) {
    await db.from('login_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id)
    return invalid()
  }

  if (!safeEqual(await hashCode(code, row.salt as string), row.code_hash as string)) {
    const attempts = row.attempts + 1
    await db.from('login_codes').update({
      attempts,
      ...(attempts >= MAX_ATTEMPTS ? { used_at: new Date().toISOString() } : {}),
    }).eq('id', row.id)
    return attempts >= MAX_ATTEMPTS
      ? json({ success: false, error: 'Te vaak een verkeerde code. Vraag een nieuwe code aan.' }, 400)
      : json({ success: false, error: 'Deze code klopt niet. Controleer de cijfers en probeer het opnieuw.' }, 400)
  }

  // Code klopt: eenmalig maken en een Supabase-inlogsleutel aanmaken (verstuurt zelf niets)
  const { data: used } = await db
    .from('login_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('used_at', null)
    .select('id')
  if (!used || used.length === 0) return invalid()

  const { data: link, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = link?.properties?.hashed_token
  if (error || !tokenHash) throw new Error(`Inlogsleutel maken mislukt: ${error?.message || 'geen token'}`)

  return json({ success: true, token_hash: tokenHash })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ success: false, error: 'Methode niet toegestaan' }, 405)

  try {
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return json({ success: false, error: 'Ongeldig verzoek.' }, 400)
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!EMAIL_PATTERN.test(email) || email.length > 254) return json({ success: false, error: 'Vul een geldig e-mailadres in.' }, 400)

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    if (body.action === 'request') return await handleRequest(db, email, clientIp(req))
    if (body.action === 'verify') return await handleVerify(db, email, typeof body.code === 'string' ? body.code.trim() : '')
    return json({ success: false, error: 'Onbekende actie.' }, 400)
  } catch (err) {
    console.error('login-code error:', err instanceof Error ? err.message : String(err))
    return json({ success: false, error: 'Er ging iets mis. Probeer het later opnieuw.' }, 500)
  }
})
