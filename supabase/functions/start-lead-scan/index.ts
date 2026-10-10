// Start de lead-scan op GitHub Actions vanuit het portaal.
//
// De GitHub-token staat in integration_config en komt nooit in de browser:
// de pagina vraagt deze functie om te starten, de functie praat met GitHub.
// Alleen een ingelogde admin mag dat, dus verify_jwt staat aan én we checken
// daarna nog of het profiel echt admin is.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const REPO = 'KoenKerkvliet/lead-scanner'
const WORKFLOW = 'scan.yml'
const BRANCH = 'main'
const TOKEN_KEY = 'github_pat'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Alleen POST' }, 405)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // --- Alleen een ingelogde admin ----------------------------------------
  const authHeader = req.headers.get('Authorization') ?? ''
  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return json({ error: 'Niet ingelogd' }, 401)

  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return json({ error: 'Alleen voor beheerders' }, 403)

  const body = await req.json().catch(() => ({}))
  const action = body?.action ?? 'start'

  const readToken = async () => {
    const { data } = await admin
      .from('integration_config').select('value').eq('key', TOKEN_KEY).maybeSingle()
    return data?.value ?? ''
  }

  // --- Is er al een token? -----------------------------------------------
  if (action === 'status') {
    return json({ tokenConfigured: !!(await readToken()) })
  }

  // --- Token opslaan of vervangen ----------------------------------------
  if (action === 'save-token') {
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!token) return json({ error: 'Geen token opgegeven' }, 400)

    // Meteen uitproberen, zodat een typefout nu opvalt en niet pas bij de
    // eerste scan.
    const check = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    })
    if (!check.ok) {
      return json({
        error: check.status === 401
          ? 'GitHub weigert dit token. Klopt hij, en is hij nog geldig?'
          : `GitHub geeft ${check.status} op ${REPO}. Heeft het token toegang tot die repo?`,
      }, 400)
    }

    const { error } = await admin.from('integration_config')
      .upsert({ key: TOKEN_KEY, value: token, updated_at: new Date().toISOString() })
    if (error) return json({ error: `Opslaan mislukt: ${error.message}` }, 500)
    return json({ tokenConfigured: true })
  }

  // --- Scan starten -------------------------------------------------------
  if (action !== 'start') return json({ error: 'Onbekende actie' }, 400)

  const token = await readToken()
  if (!token) return json({ error: 'Nog geen GitHub-token ingesteld', needsToken: true }, 409)

  const zoekterm = typeof body.zoekterm === 'string' ? body.zoekterm.trim() : ''
  if (!zoekterm) return json({ error: 'Vul een zoekterm in' }, 400)

  const regio = body.regio === 'zuid-limburg' ? 'zuid-limburg' : 'parkstad'
  const max = Math.min(Math.max(parseInt(body.max, 10) || 20, 1), 60)

  // GitHub verwacht alle workflow-inputs als tekst, ook de vinkjes.
  const resp = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: BRANCH,
        inputs: {
          zoekterm,
          regio,
          max_per_zoekterm: String(max),
          type_label: typeof body.type_label === 'string' ? body.type_label.trim() : '',
          naar_portaal: 'true',
          naar_notion: 'false',
        },
      }),
    },
  )

  // Een geslaagde dispatch geeft 204 zonder inhoud.
  if (resp.status !== 204) {
    const detail = await resp.text()
    return json({
      error: `GitHub startte de scan niet (${resp.status})`,
      detail: detail.slice(0, 300),
    }, 502)
  }

  return json({
    gestart: true,
    runsUrl: `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`,
  })
})
