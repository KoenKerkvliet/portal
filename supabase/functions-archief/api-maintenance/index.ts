import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-integration-key, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function normalizeUrl(u: string): string {
  if (!u) return ''
  let s = String(u).trim().toLowerCase()
  s = s.replace(/^https?:\/\//, '')
  s = s.replace(/^www\./, '')
  s = s.replace(/\/+$/, '')
  return s
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    // --- Auth: gedeelde integratiesleutel uit integration_config ---
    const provided = req.headers.get('x-integration-key') || ''
    const { data: cfg } = await supabase
      .from('integration_config')
      .select('value')
      .eq('key', 'dashboard_integration_key')
      .single()
    const expected = cfg?.value || ''
    if (!expected || provided.length !== expected.length || provided !== expected) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const reqUrl = new URL(req.url)

    // --- Mode: lijst van strippenkaart-site-URLs (genormaliseerd) ---
    if (reqUrl.searchParams.get('list') === '1') {
      const { data: cards } = await supabase
        .from('punch_cards')
        .select('project_id')
        .eq('status', 'active')
      const pids = [...new Set((cards || []).map((c) => c.project_id))]
      if (!pids.length) return json({ strippenkaart_urls: [] })
      const { data: projects } = await supabase
        .from('projects')
        .select('url, status')
        .in('id', pids)
        .eq('status', 'active')
      const urls = [...new Set((projects || []).map((p) => normalizeUrl(p.url)).filter(Boolean))]
      return json({ strippenkaart_urls: urls })
    }

    // --- Mode: saldo + afboekingen voor één site ---
    const siteUrl = reqUrl.searchParams.get('url') || ''
    if (!siteUrl) return json({ error: 'Missing url parameter' }, 400)
    const target = normalizeUrl(siteUrl)

    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, url, status')
      .eq('status', 'active')
    const project = (projects || []).find((p) => normalizeUrl(p.url) === target)
    if (!project) return json({ matched: false })

    const { data: cards } = await supabase
      .from('punch_cards')
      .select('id, total_punches, used_punches')
      .eq('project_id', project.id)
      .eq('status', 'active')
    const activeCards = cards || []
    const cardIds = activeCards.map((c) => c.id)
    const stripsTotal = activeCards.reduce((s, c) => s + (c.total_punches || 0), 0)
    const stripsUsed = activeCards.reduce((s, c) => s + (c.used_punches || 0), 0)
    const stripsRemaining = stripsTotal - stripsUsed

    let uses: unknown[] = []
    if (cardIds.length) {
      let q = supabase
        .from('punch_card_uses')
        .select('description, duration_minutes, used_at, punch_index')
        .in('punch_card_id', cardIds)
        .order('used_at', { ascending: true })
      const from = reqUrl.searchParams.get('from')
      const to = reqUrl.searchParams.get('to')
      if (from) q = q.gte('used_at', from)
      if (to) q = q.lte('used_at', to)
      const { data: u } = await q
      uses = u || []
    }

    return json({
      matched: true,
      project: project.name,
      url: project.url,
      strips_total: stripsTotal,
      strips_used: stripsUsed,
      strips_remaining: stripsRemaining,
      minutes_remaining: stripsRemaining * 5,
      uses,
    })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
