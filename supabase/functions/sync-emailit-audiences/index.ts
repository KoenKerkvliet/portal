// Synchroniseert de twee Emailit-audiences met de klantenlijst:
//   - "DP – Alle klanten":    alle actieve klanten met een e-mailadres
//   - "DP – Hostingklanten":  de klanten die minstens één actief domein bij ons gehost hebben
//
// Regels:
//   - Alleen contacten die deze sync zelf heeft toegevoegd (tabel emailit_sync_members)
//     worden weer verwijderd. Handmatig toegevoegde contacten blijven staan.
//   - Afgemelde contacten worden nooit opnieuw toegevoegd.
//   - Een klant met nieuwsbrief_sync = false telt niet mee (bijv. testklanten).
//
// Aanroepbaar:
//   - Nachtelijk via pg_cron (zie supabase/sync-emailit-audiences-cron.sql), met de service-role key als Bearer
//   - Vanuit het admin-portaal ("Synchroniseer"), met de JWT van een admin
// Body: { dry_run?: boolean }. Met dry_run laat hij alleen zien wat er zou gebeuren.
//
// Vereiste secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automatisch), EMAILIT_API_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EMAILIT = 'https://api.emailit.com/v2'
// Audience-ID's uit Emailit (geen geheimen)
const AUDIENCES = {
  alle: 'aud_4L7JoCfkFXjzANF6IcQObBOw7hn', // DP – Alle klanten
  hosting: 'aud_4L7JoKSoHl0LFqusjHos41XFV5K', // DP – Hostingklanten
} as const
type AudienceKey = keyof typeof AUDIENCES

type Member = {
  email: string
  client_id: string
  first_name: string
  last_name: string | null
  hosted: boolean
}

type Subscriber = { id: string; subscribed: boolean }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EMAILIT_API_KEY = Deno.env.get('EMAILIT_API_KEY')!

const db = createClient(SUPABASE_URL, SERVICE_ROLE)
const emailitHeaders = { Authorization: `Bearer ${EMAILIT_API_KEY}`, 'Content-Type': 'application/json' }

// Alle abonnees van een audience, inclusief afgemelde (zodat we die nooit opnieuw toevoegen)
async function listSubscribers(audienceId: string): Promise<Map<string, Subscriber>> {
  const result = new Map<string, Subscriber>()
  const views = ['', '&subscribed=false']
  for (const extra of views) {
    for (let page = 1; page <= 100; page++) {
      const res = await fetch(`${EMAILIT}/audiences/${audienceId}/subscribers?page=${page}&limit=100${extra}`, {
        headers: emailitHeaders,
      })
      if (!res.ok) throw new Error(`Emailit lijst ${res.status}: ${await res.text()}`)
      const body = await res.json()
      const rows: any[] = body.data ?? []
      for (const s of rows) {
        const email = String(s.email).toLowerCase()
        const subscribed = s.subscribed !== false && extra === ''
        // Een afmelding (subscribed=false) wint altijd van een eerdere 'subscribed' vermelding
        if (!result.has(email) || !subscribed) result.set(email, { id: s.id, subscribed })
      }
      if (!body.next_page_url || rows.length === 0) break
    }
  }
  return result
}

async function loadMembers(): Promise<{ members: Member[]; klantenTotaal: number }> {
  const { data: clients, error: cErr } = await db
    .from('clients')
    .select('id, name, email')
    .eq('status', 'active')
    .eq('nieuwsbrief_sync', true)
    .not('email', 'is', null)
  if (cErr) throw cErr

  const { data: projects, error: pErr } = await db
    .from('projects')
    .select('id, client_id, hosted_by_us')
    .eq('status', 'active')
  if (pErr) throw pErr

  const { data: links, error: lErr } = await db.from('project_clients').select('client_id, project_id')
  if (lErr) throw lErr

  // Een klant host bij ons zodra één actief domein hosted_by_us heeft (via primaire of gekoppelde klant)
  const hostedProjectIds = new Set((projects ?? []).filter((p) => p.hosted_by_us).map((p) => p.id))
  const hostedClientIds = new Set<string>()
  for (const p of projects ?? []) if (p.hosted_by_us && p.client_id) hostedClientIds.add(p.client_id)
  for (const l of links ?? []) if (hostedProjectIds.has(l.project_id)) hostedClientIds.add(l.client_id)

  const seen = new Set<string>()
  const members: Member[] = []
  for (const c of clients ?? []) {
    const email = String(c.email).trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    const parts = String(c.name ?? '').trim().split(/\s+/).filter(Boolean)
    const last = parts.length > 1 ? parts.pop()! : null
    members.push({
      email,
      client_id: c.id,
      first_name: parts.join(' ') || email,
      last_name: last,
      hosted: hostedClientIds.has(c.id),
    })
  }
  return { members, klantenTotaal: clients?.length ?? 0 }
}

async function syncAudience(key: AudienceKey, desired: Member[], dryRun: boolean) {
  const audienceId = AUDIENCES[key]
  const current = await listSubscribers(audienceId)

  const { data: managedRows, error } = await db
    .from('emailit_sync_members')
    .select('email, subscriber_id')
    .eq('audience_key', key)
  if (error) throw error
  const managed = new Map((managedRows ?? []).map((r) => [r.email, r]))

  const desiredEmails = new Set(desired.map((m) => m.email))
  const toAdd: Member[] = []
  const toAdopt: Member[] = []
  const afgemeld: string[] = []
  for (const m of desired) {
    const cur = current.get(m.email)
    if (!cur) toAdd.push(m)
    else if (!cur.subscribed) afgemeld.push(m.email)
    else if (!managed.has(m.email)) toAdopt.push(m)
  }
  const toRemove = [...managed.values()].filter((r) => !desiredEmails.has(r.email))
  const handmatig = [...current.entries()].filter(
    ([email, s]) => s.subscribed && !managed.has(email) && !desiredEmails.has(email),
  ).length

  const fouten: string[] = []
  if (!dryRun) {
    for (const m of toAdd) {
      const res = await fetch(`${EMAILIT}/audiences/${audienceId}/subscribers`, {
        method: 'POST',
        headers: emailitHeaders,
        body: JSON.stringify({
          email: m.email,
          first_name: m.first_name,
          last_name: m.last_name ?? undefined,
          double_opt_in: false,
          send_confirmation_email: false,
        }),
      })
      if (res.status === 409) continue // staat er al in, wordt bij de volgende run opgepakt
      if (!res.ok) {
        fouten.push(`toevoegen ${m.email}: ${res.status} ${await res.text()}`)
        continue
      }
      const sub = await res.json().catch(() => null)
      // Een heraanmelding (200) betekent dat iemand eerder was afgemeld; dat mag nooit gebeuren
      if (res.status === 200) {
        fouten.push(`onverwacht heraangemeld: ${m.email}`)
      }
      await db.from('emailit_sync_members').upsert(
        { audience_key: key, email: m.email, client_id: m.client_id, subscriber_id: sub?.data?.id ?? sub?.id ?? null },
        { onConflict: 'audience_key,email' },
      )
    }

    for (const m of toAdopt) {
      await db.from('emailit_sync_members').upsert(
        {
          audience_key: key,
          email: m.email,
          client_id: m.client_id,
          subscriber_id: current.get(m.email)?.id ?? null,
        },
        { onConflict: 'audience_key,email' },
      )
    }

    for (const r of toRemove) {
      if (r.subscriber_id) {
        const res = await fetch(`${EMAILIT}/audiences/${audienceId}/subscribers/${r.subscriber_id}`, {
          method: 'DELETE',
          headers: emailitHeaders,
        })
        // 404: al verwijderd in Emailit, dan mag de koppeling ook weg
        if (!res.ok && res.status !== 404) {
          fouten.push(`verwijderen ${r.email}: ${res.status}`)
          continue
        }
      }
      await db.from('emailit_sync_members').delete().eq('audience_key', key).eq('email', r.email)
    }
  }

  return {
    toevoegen: toAdd.map((m) => m.email),
    al_beheerd_door_sync: toAdopt.map((m) => m.email),
    verwijderen: toRemove.map((r) => r.email),
    afgemeld_overgeslagen: afgemeld,
    handmatig_niet_aangeraakt: handmatig,
    fouten,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Auth: cron via de service-role key, of een ingelogde admin uit het portaal
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (token !== SERVICE_ROLE) {
    const { data: userData, error: userErr } = await db.auth.getUser(token)
    if (userErr || !userData.user) return json({ error: 'Niet ingelogd' }, 401)
    const { data: profile } = await db.from('profiles').select('role').eq('id', userData.user.id).single()
    if (profile?.role !== 'admin') return json({ error: 'Alleen voor admins' }, 403)
  }

  const body = await req.json().catch(() => ({}))
  const dryRun = body?.dry_run === true

  try {
    const { members, klantenTotaal } = await loadMembers()
    const hostingMembers = members.filter((m) => m.hosted)

    const alle = await syncAudience('alle', members, dryRun)
    const hosting = await syncAudience('hosting', hostingMembers, dryRun)

    return json({
      dry_run: dryRun,
      klanten_met_email: klantenTotaal,
      hostingklanten: hostingMembers.length,
      audiences: { alle, hosting },
    })
  } catch (err) {
    // Supabase-fouten zijn geen Error-instanties; zorg dat de melding altijd leesbaar is
    const e = err as { message?: string; details?: string; hint?: string }
    return json({ error: e?.message || e?.details || JSON.stringify(err) }, 500)
  }
})
