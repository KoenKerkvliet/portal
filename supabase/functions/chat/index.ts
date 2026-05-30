import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ---------------------------------------------------------------------------
// chat — context-bewuste support-assistent voor de onderhoudsfase.
//
// Werkwijze:
//  1. Verifieer het JWT van de ingelogde klant (Authorization-header).
//  2. Haal server-side (service role) de context op: actief project,
//     strippensaldo en open tickets. We vertrouwen NOOIT op context die de
//     browser meestuurt — alles wordt hier opnieuw en veilig bepaald.
//  3. Bouw een gecachte system-prompt en roep de Anthropic Messages API aan.
//  4. Geef het antwoord terug.
//
// De assistent is read-only: hij kan vragen beantwoorden en doorverwijzen,
// maar voert geen acties uit (geen mutaties op de database).
// ---------------------------------------------------------------------------

const ANTHROPIC_MODEL = 'claude-haiku-4-5'

interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

    // --- 1. Verifieer de ingelogde gebruiker -------------------------------
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) {
      return new Response(JSON.stringify({ error: 'Niet ingelogd' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await authClient.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Sessie ongeldig' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- 2. Lees de gespreksgeschiedenis uit de body -----------------------
    const body = await req.json().catch(() => ({}))
    const history: ChatTurn[] = Array.isArray(body.messages) ? body.messages : []
    const cleaned = history
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-12) // hou het gesprek behapbaar
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))

    if (cleaned.length === 0 || cleaned[cleaned.length - 1].role !== 'user') {
      return new Response(JSON.stringify({ error: 'Geen geldige vraag ontvangen' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- 3. Haal context op met service role -------------------------------
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // De Anthropic-key staat veilig in Supabase Vault. We lezen hem op via een
    // locked-down RPC (alleen uitvoerbaar door service_role). Als er toch een
    // env-secret is ingesteld, gebruiken we die als voorkeur.
    let ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
    if (!ANTHROPIC_API_KEY) {
      const { data: keyData, error: keyError } = await admin.rpc('get_anthropic_key')
      if (keyError) {
        console.error('Kon Anthropic-key niet uit Vault lezen:', keyError)
      }
      ANTHROPIC_API_KEY = (keyData as string | null) || ''
    }
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    // Beheerbare kennis/instructies uit het admin-dashboard.
    const { data: settings } = await admin
      .from('assistant_settings')
      .select('enabled, knowledge')
      .limit(1)
      .single()

    // Assistent uitgeschakeld door de beheerder? Geef een nette melding terug.
    if (settings && settings.enabled === false) {
      return new Response(
        JSON.stringify({
          reply:
            'De chat-assistent is op dit moment uitgeschakeld. Maak gerust een ticket aan, dan helpen we je persoonlijk verder.\n[[CTA:Ga naar support|/support]]',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    const extraKnowledge = (settings?.knowledge || '').trim()

    const { data: client } = await admin
      .from('clients')
      .select('id, name')
      .eq('profile_id', user.id)
      .single()

    let projectName = ''
    let projectUrl = ''
    let remainingStrips = 0
    let hasActiveCard = false
    let openTickets: { number: number; title: string; status: string }[] = []
    const clientFirstName = (client?.name || user.user_metadata?.full_name || '').split(' ')[0] || 'daar'

    if (client) {
      // Gekoppelde projecten (project_clients + projects.client_id)
      const [{ data: pcRows }, { data: primaryRows }] = await Promise.all([
        admin.from('project_clients').select('project_id').eq('client_id', client.id),
        admin.from('projects').select('id').eq('client_id', client.id),
      ])
      const projectIds = Array.from(new Set([
        ...(pcRows || []).map((r) => r.project_id as string),
        ...(primaryRows || []).map((r) => r.id as string),
      ]))

      if (projectIds.length > 0) {
        const { data: project } = await admin
          .from('projects')
          .select('id, name, url, current_phase')
          .in('id', projectIds)
          .eq('status', 'active')
          .limit(1)
          .single()

        if (project) {
          projectName = project.name || ''
          projectUrl = project.url || ''

          const { data: cards } = await admin
            .from('punch_cards')
            .select('total_punches, used_punches, status')
            .eq('project_id', project.id)
          const active = (cards || []).filter((c) => c.status === 'active')
          hasActiveCard = active.length > 0
          remainingStrips = active.reduce((sum, c) => sum + (c.total_punches - c.used_punches), 0)

          const { data: tickets } = await admin
            .from('tickets')
            .select('number, title, status')
            .eq('project_id', project.id)
            .neq('status', 'resolved')
            .order('updated_at', { ascending: false })
            .limit(10)
          openTickets = (tickets || []).map((t) => ({
            number: t.number,
            title: t.title,
            status: t.status,
          }))
        }
      }
    }

    // --- 4. Bouw de system-prompt ------------------------------------------
    // Stabiele instructies eerst (gecached), daarna de dynamische context.
    const instructions = `Je bent de digitale assistent van DesignPixels in het klantportaal, beschikbaar tijdens de onderhoudsfase van een website.

Je rol:
- Beantwoord vragen van klanten over onderhoud, strippenkaarten, hun strippensaldo en het aanvragen van werk.
- Je bent vriendelijk én professioneel. Schrijf in het Nederlands, je-vorm, bondig en warm.
- Je voert zelf GEEN acties uit (je kunt niets wijzigen, kopen of aanmaken). Je verwijst de klant door.

Belangrijke kennis over hoe het werkt:
- Onderhoud wordt afgerekend met "strippen". Eén strip staat voor 5 minuten service.
- Strippenkaarten koop je vooraf en zijn 2 jaar geldig. Ze zijn bedoeld voor onderhoud en aanpassingen aan een bestaande website — NIET voor het bouwen van een geheel nieuwe website.
- Strippenkaarten koopt de klant op de pagina "Strippen kopen" (/strippenkaart).
- Concrete aanvragen, wijzigingen of problemen meldt de klant via een ticket op de support-pagina (/support).

Doorverwijzen (zet zo'n verwijzing op een eigen regel, exact in dit formaat zodat de app er een knop van maakt):
- Naar strippenkaarten: [[CTA:Strippenkaart kopen|/strippenkaart]]
- Naar tickets/support: [[CTA:Ga naar support|/support]]

Gouden regel: weet je iets niet zeker, of vraagt de klant om een concrete aanpassing/melding? Geef dan eerlijk aan dat je het niet zeker weet en verwijs naar een ticket. Verzin nooit antwoorden of toezeggingen. Voor inhoudelijke beslissingen, prijsafspraken buiten de standaardpakketten, of technische uitvoering: altijd doorverwijzen naar support.

Houd antwoorden kort (max ~4 zinnen) tenzij de klant om uitleg vraagt.`

    const ticketLines = openTickets.length > 0
      ? openTickets.map((t) => `  - #${String(t.number).padStart(3, '0')} "${t.title}" (status: ${t.status})`).join('\n')
      : '  (geen open tickets)'

    const context = `Actuele gegevens van deze klant (gebruik dit om concrete, kloppende antwoorden te geven):
- Voornaam klant: ${clientFirstName}
- Project: ${projectName || 'onbekend'}${projectUrl ? ` (${projectUrl})` : ''}
- Actieve strippenkaart: ${hasActiveCard ? 'ja' : 'nee'}
- Strippensaldo (resterende strippen): ${remainingStrips}
- Open tickets:
${ticketLines}`

    // --- 5. Roep Anthropic aan ---------------------------------------------
    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: [
          // Vaste basisinstructies (gecached).
          { type: 'text', text: instructions, cache_control: { type: 'ephemeral' } },
          // Door de beheerder ingestelde kennis/FAQ (bewerkbaar in het admin-dashboard).
          ...(extraKnowledge
            ? [{
                type: 'text',
                text:
                  `Aanvullende kennis en richtlijnen (ingesteld door DesignPixels — volg deze nauwkeurig en laat ze voorgaan bij twijfel):\n\n${extraKnowledge}`,
              }]
            : []),
          // Dynamische klantcontext (verandert per gesprek).
          { type: 'text', text: context },
        ],
        messages: cleaned,
      }),
    })

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text()
      console.error('Anthropic API error:', anthropicResp.status, errText)
      throw new Error(`Anthropic API error: ${anthropicResp.status}`)
    }

    const data = await anthropicResp.json()
    const reply = (data.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n')
      .trim()

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('chat function error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Er ging iets mis' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
