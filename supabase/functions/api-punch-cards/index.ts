import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Get API key from header
    const apiKey = req.headers.get('x-api-key')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing x-api-key header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Find project by API key
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, url')
      .eq('api_key', apiKey)
      .single()

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Get active punch cards for this project
    const { data: cards } = await supabase
      .from('punch_cards')
      .select('total_punches, used_punches, status')
      .eq('project_id', project.id)
      .eq('status', 'active')

    const activeCards = cards || []
    const totaal = activeCards.reduce((sum, c) => sum + c.total_punches, 0)
    const gebruikt = activeCards.reduce((sum, c) => sum + c.used_punches, 0)
    const resterend = totaal - gebruikt
    const totalMinutes = resterend * 5
    const activeCardCount = activeCards.length

    return new Response(
      JSON.stringify({
        project: project.name,
        domain: project.url,
        // Engelse veldnamen — wat DP Toolbox dashboard-widget consumeert
        strips_total: totaal,
        strips_used: gebruikt,
        strips_remaining: resterend,
        minutes_remaining: totalMinutes,
        active_cards: activeCardCount,
        // Nederlandse aliases — backwards-compat voor eventuele oudere consumers
        totaal,
        gebruikt,
        resterend,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
