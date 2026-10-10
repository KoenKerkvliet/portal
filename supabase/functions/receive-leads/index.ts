// Neemt scanresultaten aan van de lead-scanner (GitHub Actions) en schrijft ze
// weg in public.leads.
//
// Waarom een eigen functie en niet rechtstreeks de service_role-sleutel in
// GitHub: die sleutel omzeilt alle RLS en geeft toegang tot facturen, klanten
// en banktransacties. Deze functie kan alleen leads wegschrijven, dus een
// uitgelekt token kost hooguit een vervuilde leadlijst.
//
// Auth: header `x-leads-token`. We bewaren alleen de SHA-256 daarvan in
// integration_config, dus de sleutel zelf staat nergens in de database.
// Daarom staat verify_jwt uit: de functie regelt zijn eigen authenticatie.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const MAX_LEADS = 500

// Velden die een scan mag overschrijven. Alles wat hier niet in staat —
// status, note, last_contact_at, follow_up_at — is van de gebruiker.
const SCAN_FIELDS = [
  'place_id', 'name', 'address', 'phone', 'website', 'website_kind',
  'score', 'priority', 'issues', 'cms', 'has_ssl', 'mobile_friendly',
  'load_time_seconds', 'google_rating', 'google_reviews',
  'search_query', 'region', 'lead_type', 'scanned_at',
] as const

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Vergelijking zonder timingverschil tussen een bijna-goed en een fout token. */
const equals = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { ...corsHeaders, 'Access-Control-Allow-Headers': `${corsHeaders['Access-Control-Allow-Headers']}, x-leads-token` },
    })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Alleen POST' }, 405)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // --- Authenticatie ------------------------------------------------------
  const token = req.headers.get('x-leads-token') ?? ''
  if (!token) return json({ error: 'Geen token' }, 401)

  const { data: config } = await supabase
    .from('integration_config')
    .select('value')
    .eq('key', 'leads_ingest_token_sha256')
    .maybeSingle()

  if (!config?.value) return json({ error: 'Ingest niet geconfigureerd' }, 503)
  if (!equals(await sha256(token), config.value)) return json({ error: 'Ongeldig token' }, 401)

  // --- Invoer -------------------------------------------------------------
  const body = await req.json().catch(() => null)
  const incoming = Array.isArray(body?.leads) ? body.leads : null
  if (!incoming) return json({ error: 'Verwacht { leads: [...] }' }, 400)
  if (incoming.length > MAX_LEADS) return json({ error: `Maximaal ${MAX_LEADS} leads per keer` }, 413)

  // --- Bestaande leads ophalen om op te matchen ---------------------------
  const { data: existing, error: readError } = await supabase
    .from('leads')
    .select('id, place_id, name')

  if (readError) return json({ error: `Lezen mislukt: ${readError.message}` }, 500)

  const byPlaceId = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const row of existing ?? []) {
    if (row.place_id) byPlaceId.set(row.place_id, row.id)
    // Leads die uit Notion zijn overgezet hebben geen place_id; die matchen
    // we op naam, zodat ze bij een scan worden bijgewerkt in plaats van
    // gedupliceerd. Ze krijgen dan meteen hun place_id mee.
    if (!byName.has(row.name.toLowerCase())) byName.set(row.name.toLowerCase(), row.id)
  }

  const now = new Date().toISOString()
  const queuedNames = new Set<string>()
  const toInsert: Record<string, unknown>[] = []
  let updated = 0
  const problems: string[] = []

  for (const lead of incoming) {
    if (!lead?.name || typeof lead.name !== 'string') {
      problems.push('Lead zonder naam overgeslagen')
      continue
    }

    const fields: Record<string, unknown> = { updated_at: now }
    for (const field of SCAN_FIELDS) {
      if (lead[field] !== undefined) fields[field] = lead[field]
    }

    const key = lead.name.toLowerCase()
    const id = (lead.place_id && byPlaceId.get(lead.place_id)) || byName.get(key)

    if (id) {
      const { error } = await supabase.from('leads').update(fields).eq('id', id)
      if (error) problems.push(`${lead.name}: ${error.message}`)
      else updated++
    } else if (!queuedNames.has(key)) {
      // Binnen dezelfde batch niet twee keer hetzelfde bedrijf invoegen.
      queuedNames.add(key)
      toInsert.push({ ...fields, first_seen_at: now })
    }
  }

  let inserted = 0
  if (toInsert.length) {
    const { error, count } = await supabase
      .from('leads')
      .insert(toInsert, { count: 'exact' })
    if (error) problems.push(`Invoegen mislukt: ${error.message}`)
    else inserted = count ?? toInsert.length
  }

  return json({
    ontvangen: incoming.length,
    nieuw: inserted,
    bijgewerkt: updated,
    problemen: problems,
  })
})
