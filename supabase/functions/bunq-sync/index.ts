// Bunq sync — read-only.
// Haalt nieuwe payments (transacties) op uit Bunq en schrijft ze in
// public.bank_transactions. Beheer van keypair, installation, device en
// session gebeurt automatisch in public.bunq_state (single-row).
//
// Aanroepbaar:
//   - Handmatig vanuit het admin-portaal ("Verversen"-knop)
//   - Via pg_cron (zie supabase/add-bunq-tables.sql onderaan)
//
// Vereiste secrets (Project Settings → Edge Functions → Secrets):
//   BUNQ_API_KEY        — productie API-key uit de Bunq-app
//   SUPABASE_URL        — automatisch aanwezig
//   SUPABASE_SERVICE_ROLE_KEY — automatisch aanwezig
//
// Optioneel:
//   BUNQ_API_BASE       — default 'https://api.bunq.com' (productie).
//                         Zet op 'https://public-api.sandbox.bunq.com' voor sandbox.
//   BUNQ_DEVICE_DESCRIPTION — default 'DesignPixels Klantportaal'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateKeypair, signBody } from './crypto.ts'

// Inline (geen import uit ../_shared) zodat de dashboard-editor de function
// kan bundelen zonder het _shared-pad te kennen.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type BunqState = {
  id: number
  private_key_pem: string | null
  public_key_pem: string | null
  installation_token: string | null
  server_public_key_pem: string | null
  device_server_id: number | null
  session_token: string | null
  session_expires_at: string | null
  user_id: number | null
  monetary_account_ids: number[] | null
  last_sync_at: string | null
  last_payment_id: number | null
}

const BUNQ_BASE = Deno.env.get('BUNQ_API_BASE') || 'https://api.bunq.com'
const DEVICE_DESC = Deno.env.get('BUNQ_DEVICE_DESCRIPTION') || 'DesignPixels Klantportaal'

function uuid(): string {
  return crypto.randomUUID()
}

function commonHeaders(extra: Record<string, string> = {}) {
  return {
    'Cache-Control': 'no-cache',
    'User-Agent': 'DesignPixelsKlantportaal/1.0',
    'X-Bunq-Language': 'nl_NL',
    'X-Bunq-Region': 'nl_NL',
    'X-Bunq-Client-Request-Id': uuid(),
    'X-Bunq-Geolocation': '0 0 0 0 NL',
    ...extra,
  }
}

async function bunqRequest(opts: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: unknown
  privateKeyPem?: string         // signed requests
  authToken?: string             // installation OR session token
}): Promise<any> {
  const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : ''
  const headers: Record<string, string> = commonHeaders()
  headers['Content-Type'] = 'application/json'
  if (opts.authToken) headers['X-Bunq-Client-Authentication'] = opts.authToken
  if (opts.privateKeyPem) headers['X-Bunq-Client-Signature'] = await signBody(opts.privateKeyPem, bodyStr)

  const res = await fetch(`${BUNQ_BASE}${opts.path}`, {
    method: opts.method,
    headers,
    body: opts.method === 'GET' ? undefined : bodyStr,
  })

  const text = await res.text()
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch { /* keep text */ }

  if (!res.ok) {
    const errs = json?.Error?.map((e: any) => e.error_description).filter(Boolean).join('; ') || text
    throw new Error(`Bunq ${opts.method} ${opts.path} → ${res.status}: ${errs}`)
  }
  return json
}

// Bunq API responses zien er uit als:
//   { Response: [ { TypeName: { ...fields } }, ... ] }
// Deze helper haalt platte items uit de eerste laag.
function unwrap(resp: any): any[] {
  return (resp?.Response ?? []) as any[]
}
function pickByType(items: any[], typeName: string): any | null {
  for (const it of items) if (it && typeof it === 'object' && it[typeName]) return it[typeName]
  return null
}

// ---- Bunq lifecycle helpers --------------------------------------------------

async function ensureKeypair(state: BunqState, db: ReturnType<typeof createClient>): Promise<{ privatePem: string; publicPem: string }> {
  if (state.private_key_pem && state.public_key_pem) {
    return { privatePem: state.private_key_pem, publicPem: state.public_key_pem }
  }
  const { privatePem, publicPem } = await generateKeypair()
  const { error } = await db.from('bunq_state').update({
    private_key_pem: privatePem,
    public_key_pem: publicPem,
    updated_at: new Date().toISOString(),
  }).eq('id', 1)
  if (error) throw new Error(`Kon keypair niet opslaan: ${error.message}`)
  return { privatePem, publicPem }
}

async function ensureInstallation(state: BunqState, publicPem: string, db: ReturnType<typeof createClient>): Promise<{ token: string; serverPublicKey: string }> {
  if (state.installation_token && state.server_public_key_pem) {
    return { token: state.installation_token, serverPublicKey: state.server_public_key_pem }
  }
  const resp = await bunqRequest({
    method: 'POST',
    path: '/v1/installation',
    body: { client_public_key: publicPem },
  })
  const items = unwrap(resp)
  const tokenObj = pickByType(items, 'Token')
  const serverKeyObj = pickByType(items, 'ServerPublicKey')
  if (!tokenObj?.token || !serverKeyObj?.server_public_key) {
    throw new Error('Onverwacht antwoord op /v1/installation')
  }
  const token: string = tokenObj.token
  const serverPub: string = serverKeyObj.server_public_key

  await db.from('bunq_state').update({
    installation_token: token,
    server_public_key_pem: serverPub,
    updated_at: new Date().toISOString(),
  }).eq('id', 1)
  return { token, serverPublicKey: serverPub }
}

async function ensureDevice(state: BunqState, privatePem: string, installationToken: string, apiKey: string, db: ReturnType<typeof createClient>): Promise<number> {
  if (state.device_server_id) return state.device_server_id
  const resp = await bunqRequest({
    method: 'POST',
    path: '/v1/device-server',
    body: {
      description: DEVICE_DESC,
      secret: apiKey,
      permitted_ips: ['*'],   // Edge Functions hebben dynamische IPs
    },
    privateKeyPem: privatePem,
    authToken: installationToken,
  })
  const items = unwrap(resp)
  const idObj = pickByType(items, 'Id')
  const deviceId: number | undefined = idObj?.id
  if (!deviceId) throw new Error('Onverwacht antwoord op /v1/device-server')

  await db.from('bunq_state').update({
    device_server_id: deviceId,
    updated_at: new Date().toISOString(),
  }).eq('id', 1)
  return deviceId
}

async function ensureSession(state: BunqState, privatePem: string, installationToken: string, apiKey: string, db: ReturnType<typeof createClient>): Promise<{ sessionToken: string; userId: number }> {
  // Session geldig? (met 5min marge)
  if (state.session_token && state.session_expires_at && state.user_id) {
    const expires = new Date(state.session_expires_at).getTime()
    if (expires - 5 * 60_000 > Date.now()) {
      return { sessionToken: state.session_token, userId: state.user_id }
    }
  }

  const resp = await bunqRequest({
    method: 'POST',
    path: '/v1/session-server',
    body: { secret: apiKey },
    privateKeyPem: privatePem,
    authToken: installationToken,
  })
  const items = unwrap(resp)
  const tokenObj = pickByType(items, 'Token')
  const userPerson = pickByType(items, 'UserPerson')
  const userCompany = pickByType(items, 'UserCompany')
  const userApiKey = pickByType(items, 'UserApiKey')
  const user = userPerson || userCompany || userApiKey?.requested_by_user?.UserPerson || userApiKey?.requested_by_user?.UserCompany
  const sessionToken: string | undefined = tokenObj?.token
  const userId: number | undefined = user?.id
  // Sessie-timeout in seconden — staat soms op user, soms op het Token-object
  const timeoutSec: number = user?.session_timeout || 3600

  if (!sessionToken || !userId) throw new Error('Onverwacht antwoord op /v1/session-server')

  const expiresAt = new Date(Date.now() + timeoutSec * 1000).toISOString()
  await db.from('bunq_state').update({
    session_token: sessionToken,
    session_expires_at: expiresAt,
    user_id: userId,
    updated_at: new Date().toISOString(),
  }).eq('id', 1)

  return { sessionToken, userId }
}

async function listMonetaryAccounts(privatePem: string, sessionToken: string, userId: number): Promise<number[]> {
  const resp = await bunqRequest({
    method: 'GET',
    path: `/v1/user/${userId}/monetary-account?count=100`,
    privateKeyPem: privatePem,
    authToken: sessionToken,
  })
  const ids: number[] = []
  for (const item of unwrap(resp)) {
    // Items kunnen MonetaryAccountBank, MonetaryAccountSavings, MonetaryAccountJoint, etc. zijn
    for (const key of Object.keys(item)) {
      const acc = item[key]
      if (acc?.id && acc?.status === 'ACTIVE') ids.push(acc.id)
    }
  }
  return ids
}

async function fetchPaymentsForAccount(
  privatePem: string,
  sessionToken: string,
  userId: number,
  accountId: number,
  newerThanId: number | null,
): Promise<any[]> {
  // Bunq paginatie: response.Pagination.older_url voor volgende (oudere) pagina.
  // We willen alles dat NIEUWER is dan newerThanId. Bunq levert payments
  // standaard van nieuw → oud. We loopen tot we een payment zien <= newerThanId.
  const collected: any[] = []
  let nextPath: string | null = `/v1/user/${userId}/monetary-account/${accountId}/payment?count=200`
  // First-run cap: zonder cursor halen we max ~600 transacties op (3 pages),
  // anders loopt een nieuwe koppeling het risico uren te draaien.
  const maxPagesFirstRun = newerThanId == null ? 3 : 50

  let page = 0
  while (nextPath && page < maxPagesFirstRun) {
    const resp = await bunqRequest({
      method: 'GET',
      path: nextPath,
      privateKeyPem: privatePem,
      authToken: sessionToken,
    })
    let stop = false
    for (const item of unwrap(resp)) {
      const p = item?.Payment
      if (!p?.id) continue
      if (newerThanId != null && p.id <= newerThanId) { stop = true; break }
      collected.push(p)
    }
    if (stop) break

    const older: string | null = resp?.Pagination?.older_url ?? null
    nextPath = older
    page++
  }
  return collected
}

// ---- Sync orchestratie -------------------------------------------------------

async function runSync(): Promise<{ inserted: number; accounts: number; lastPaymentId: number | null }> {
  const apiKey = Deno.env.get('BUNQ_API_KEY')
  if (!apiKey) throw new Error('BUNQ_API_KEY niet geconfigureerd')

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: stateRow, error: stateErr } = await db.from('bunq_state').select('*').eq('id', 1).single()
  if (stateErr || !stateRow) throw new Error(`Kon bunq_state niet laden: ${stateErr?.message ?? 'geen rij'}`)
  const state = stateRow as BunqState

  const { privatePem, publicPem } = await ensureKeypair(state, db)
  const refreshedState = (await db.from('bunq_state').select('*').eq('id', 1).single()).data as BunqState

  const { token: installationToken } = await ensureInstallation(refreshedState, publicPem, db)
  const refreshedState2 = (await db.from('bunq_state').select('*').eq('id', 1).single()).data as BunqState

  await ensureDevice(refreshedState2, privatePem, installationToken, apiKey, db)
  const refreshedState3 = (await db.from('bunq_state').select('*').eq('id', 1).single()).data as BunqState

  const { sessionToken, userId } = await ensureSession(refreshedState3, privatePem, installationToken, apiKey, db)

  const accountIds = await listMonetaryAccounts(privatePem, sessionToken, userId)
  await db.from('bunq_state').update({
    monetary_account_ids: accountIds,
    updated_at: new Date().toISOString(),
  }).eq('id', 1)

  let highest = state.last_payment_id ?? null
  let inserted = 0

  for (const accId of accountIds) {
    const payments = await fetchPaymentsForAccount(privatePem, sessionToken, userId, accId, state.last_payment_id)
    if (payments.length === 0) continue

    const rows = payments.map((p) => ({
      bunq_payment_id: p.id,
      bunq_account_id: accId,
      booked_at: p.created,
      amount: Number(p.amount?.value ?? 0),
      currency: p.amount?.currency ?? 'EUR',
      description: p.description ?? '',
      counterparty_name: p.counterparty_alias?.display_name ?? p.counterparty_alias?.label_user?.display_name ?? null,
      counterparty_iban: p.counterparty_alias?.iban ?? null,
      payment_type: p.type ?? null,
      raw: p,
    }))

    // Upsert op unique key bunq_payment_id voorkomt duplicaten als runs overlappen.
    const { error: upErr } = await db.from('bank_transactions').upsert(rows, { onConflict: 'bunq_payment_id' })
    if (upErr) throw new Error(`Kon transacties niet opslaan: ${upErr.message}`)

    inserted += rows.length
    for (const p of payments) if (highest == null || p.id > highest) highest = p.id
  }

  await db.from('bunq_state').update({
    last_sync_at: new Date().toISOString(),
    last_payment_id: highest,
    updated_at: new Date().toISOString(),
  }).eq('id', 1)

  return { inserted, accounts: accountIds.length, lastPaymentId: highest }
}

// ---- HTTP entrypoint ---------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const result = await runSync()
    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('bunq-sync error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
