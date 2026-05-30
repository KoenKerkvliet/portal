import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ---------------------------------------------------------------------------
// chat-digest — wekelijkse samenvatting van de chat-assistent.
//
// Wordt één keer per week aangeroepen door een pg_cron-job (via pg_net). De
// job stuurt het cron-secret mee in de header `x-cron-secret`; alleen aanroepen
// met het juiste secret worden geaccepteerd (verify_jwt staat uit voor deze
// functie).
//
// Werkwijze:
//  1. Verifieer het cron-secret.
//  2. Lees de digest-instellingen (aan/uit + e-mailadres).
//  3. Verzamel de chatberichten van de afgelopen 7 dagen.
//  4. Laat Claude een korte samenvatting maken (meestgestelde + onbeantwoorde
//     vragen). Faalt dat, dan sturen we een eenvoudige opsomming.
//  5. Verstuur de mail via EmailIt.
// ---------------------------------------------------------------------------

const ANTHROPIC_MODEL = 'claude-haiku-4-5'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // --- 1. Verifieer het cron-secret --------------------------------------
    const provided = req.headers.get('x-cron-secret') || ''
    const { data: expected } = await admin.rpc('get_cron_secret')
    if (!expected || provided !== expected) {
      return new Response(JSON.stringify({ error: 'Niet geautoriseerd' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- 2. Lees de digest-instellingen ------------------------------------
    const { data: settings } = await admin
      .from('assistant_settings')
      .select('digest_enabled, digest_email')
      .limit(1)
      .single()

    if (!settings?.digest_enabled || !settings?.digest_email) {
      return new Response(JSON.stringify({ skipped: 'digest uitgeschakeld of geen e-mailadres' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- 3. Verzamel de berichten van de afgelopen 7 dagen -----------------
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: messages } = await admin
      .from('chat_messages')
      .select('role, content, is_unresolved, created_at, conversation_id')
      .gte('created_at', since)
      .order('created_at', { ascending: true })

    const all = messages || []
    const userMessages = all.filter((m) => m.role === 'user')
    const conversationIds = new Set(all.map((m) => m.conversation_id))

    // Onbeantwoorde momenten: de user-vraag die direct vóór een UNRESOLVED
    // assistent-antwoord in hetzelfde gesprek kwam.
    const unresolvedQuestions: string[] = []
    for (let i = 0; i < all.length; i++) {
      const m = all[i]
      if (m.role === 'assistant' && m.is_unresolved) {
        // Zoek de laatste user-vraag ervoor in hetzelfde gesprek.
        for (let j = i - 1; j >= 0; j--) {
          if (all[j].conversation_id === m.conversation_id && all[j].role === 'user') {
            unresolvedQuestions.push(all[j].content)
            break
          }
        }
      }
    }

    // Niets gebeurd? Geen mail sturen.
    if (userMessages.length === 0) {
      return new Response(JSON.stringify({ skipped: 'geen gesprekken deze week' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- 4. Laat Claude een samenvatting maken -----------------------------
    let summaryHtml = ''
    try {
      let ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
      if (!ANTHROPIC_API_KEY) {
        const { data: keyData } = await admin.rpc('get_anthropic_key')
        ANTHROPIC_API_KEY = (keyData as string | null) || ''
      }
      if (ANTHROPIC_API_KEY) {
        const questionList = userMessages.map((m) => `- ${m.content.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')
        const unresolvedList = unresolvedQuestions.length > 0
          ? unresolvedQuestions.map((q) => `- ${q.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')
          : '(geen)'

        const prompt = `Hieronder staan alle vragen die klanten deze week aan de chat-assistent van DesignPixels stelden, plus de vragen die de assistent NIET kon beantwoorden. Maak een korte, overzichtelijke samenvatting in het Nederlands voor de eigenaar van DesignPixels.

ALLE VRAGEN VAN KLANTEN:
${questionList}

VRAGEN DIE DE ASSISTENT NIET KON BEANTWOORDEN:
${unresolvedList}

Geef je antwoord als HTML-fragment (zonder <html>/<body>, alleen <h3>, <p>, <ul>, <li>, <strong>). Structuur:
1. Een kopje "Meestgestelde onderwerpen" met een korte bulletlijst van thema's/onderwerpen die opvielen (groepeer vergelijkbare vragen).
2. Een kopje "Vragen om je kennisbank mee aan te vullen" met de belangrijkste onbeantwoorde vragen, plus per vraag een korte suggestie wat je zou kunnen toevoegen aan de kennis van de assistent. Staat er niets onbeantwoord, schrijf dan dat alles goed beantwoord kon worden.
Houd het bondig en praktisch.`

        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }],
          }),
        })
        if (resp.ok) {
          const data = await resp.json()
          summaryHtml = (data.content || [])
            .filter((b: { type: string }) => b.type === 'text')
            .map((b: { text: string }) => b.text)
            .join('\n')
            .trim()
        }
      }
    } catch (err) {
      console.error('Kon AI-samenvatting niet maken:', err)
    }

    // Terugval: eenvoudige opsomming als de AI-samenvatting niet lukte.
    if (!summaryHtml) {
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const unresolvedHtml = unresolvedQuestions.length > 0
        ? `<ul>${unresolvedQuestions.map((q) => `<li>${esc(q.slice(0, 300))}</li>`).join('')}</ul>`
        : '<p>Alle vragen konden beantwoord worden. 🎉</p>'
      summaryHtml = `
        <h3>Vragen die de assistent niet kon beantwoorden</h3>
        ${unresolvedHtml}
        <h3>Alle gestelde vragen</h3>
        <ul>${userMessages.map((m) => `<li>${esc(m.content.slice(0, 300))}</li>`).join('')}</ul>`
    }

    // --- 5. Verstuur de mail via EmailIt -----------------------------------
    const EMAILIT_API_KEY = Deno.env.get('EMAILIT_API_KEY')!
    const EMAILIT_FROM = Deno.env.get('EMAILIT_FROM') || 'DesignPixels <noreply@designpixels.nl>'

    const periodLabel = `${new Date(since).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })} – ${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}`

    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#f8f7fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
          <div style="background:linear-gradient(135deg,#9e86ff,#7c3aed);padding:32px;text-align:center;">
            <h1 style="color:white;margin:0;font-size:22px;font-weight:700;">DesignPixels</h1>
            <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px;">Wekelijkse chat-samenvatting</p>
          </div>
          <div style="padding:32px;">
            <p style="color:#6b7280;font-size:13px;margin:0 0 4px;">${periodLabel}</p>
            <div style="display:flex;gap:16px;margin:0 0 24px;">
              <div style="flex:1;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:14px;text-align:center;">
                <div style="font-size:24px;font-weight:700;color:#7c3aed;">${conversationIds.size}</div>
                <div style="font-size:11px;color:#6b7280;">gesprekken</div>
              </div>
              <div style="flex:1;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:14px;text-align:center;">
                <div style="font-size:24px;font-weight:700;color:#7c3aed;">${userMessages.length}</div>
                <div style="font-size:11px;color:#6b7280;">vragen</div>
              </div>
              <div style="flex:1;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px;text-align:center;">
                <div style="font-size:24px;font-weight:700;color:#d97706;">${unresolvedQuestions.length}</div>
                <div style="font-size:11px;color:#6b7280;">niet beantwoord</div>
              </div>
            </div>
            <div style="color:#374151;font-size:14px;line-height:1.65;">
              ${summaryHtml}
            </div>
            <p style="color:#9ca3af;font-size:12px;margin:28px 0 0;">
              Bekijk alle gesprekken in het admin-portaal onder "Chatgesprekken". Vul de kennis van de assistent aan via Instellingen → Assistent.
            </p>
          </div>
          <div style="padding:16px 32px;background:#f9fafb;text-align:center;">
            <p style="color:#9ca3af;font-size:11px;margin:0;">&copy; ${new Date().getFullYear()} DesignPixels</p>
          </div>
        </div>
      </body></html>`

    const emailResp = await fetch('https://api.emailit.com/v2/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${EMAILIT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAILIT_FROM,
        to: settings.digest_email,
        subject: `Wekelijkse chat-samenvatting (${userMessages.length} vragen)`,
        html,
      }),
    })

    if (!emailResp.ok) {
      const errText = await emailResp.text()
      console.error('EmailIt error:', emailResp.status, errText)
      throw new Error(`EmailIt error: ${emailResp.status}`)
    }

    return new Response(JSON.stringify({
      sent: true,
      to: settings.digest_email,
      conversations: conversationIds.size,
      questions: userMessages.length,
      unresolved: unresolvedQuestions.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('chat-digest error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Er ging iets mis' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
