// Klantportaal als connector in Claude: een MCP-server (Streamable HTTP,
// alleen POST) waarmee Claude het admin-deel kan inzien en bijwerken.
//
// Toegang gaat met één geheime sleutel (secret MCP_TOKEN), als
// "Authorization: Bearer <sleutel>". Er is één eigenaar en de data is globaal,
// dus meer dan die sleutel is er niet nodig; de functie gebruikt de
// service_role en gaat daarmee langs RLS heen.
//
// verify_jwt staat uit in supabase/config.toml: Claude stuurt zijn eigen
// sleutel mee, geen Supabase-JWT.
//
// Wat de tools doen staat in gereedschap.ts. Geen enkele tool mailt een klant:
// dat blijft een handeling in de admin-UI.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GEREEDSCHAPPEN, voerUit } from './gereedschap.ts'

const TOKEN = Deno.env.get('MCP_TOKEN') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, mcp-protocol-version, mcp-session-id',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

interface Verzoek {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (!TOKEN) {
    return new Response('MCP_TOKEN ontbreekt op de server (Edge Functions → Secrets).', {
      status: 500,
      headers: CORS,
    })
  }

  const meegegeven = req.headers.get('authorization')?.replace(/^Bearer\s+/iu, '') ?? ''
  if (!veiligGelijk(meegegeven, TOKEN)) {
    return new Response('Geen toegang.', { status: 401, headers: CORS })
  }

  // Streamable HTTP mag een GET proberen voor een eventstroom; die bieden we
  // niet, en 405 is het antwoord dat de specificatie daarvoor noemt.
  if (req.method !== 'POST') {
    return new Response('Stuur een JSON-RPC-bericht met POST.', { status: 405, headers: CORS })
  }

  let binnen: Verzoek | Verzoek[]
  try {
    binnen = await req.json()
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Geen geldige JSON.' } })
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const berichten = Array.isArray(binnen) ? binnen : [binnen]
  const antwoorden = []
  for (const bericht of berichten) {
    const antwoord = await behandel(bericht, db)
    if (antwoord) antwoorden.push(antwoord)
  }

  if (antwoorden.length === 0) return new Response(null, { status: 202, headers: CORS })
  return json(Array.isArray(binnen) ? antwoorden : antwoorden[0])
})

// deno-lint-ignore no-explicit-any
async function behandel(verzoek: Verzoek, db: any) {
  const id = verzoek.id ?? null
  if (verzoek.method?.startsWith('notifications/')) return null

  switch (verzoek.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: (verzoek.params?.protocolVersion as string | undefined) ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'klantportaal', version: '1.0.0' },
          instructions:
            'Admin-toegang tot het klantportaal van Design Pixels: klanten, domeinen (projecten), ' +
            'facturen, offertes, werkzaamheden, strippenkaarten, meldingen, chats, tickets en ' +
            'financiën (banktransacties en kosten). Bedragen zijn euro’s. Datums als JJJJ-MM-DD. ' +
            'Geen enkele tool mailt een klant; versturen gebeurt in de admin-UI. ' +
            'Vraag bij wijzigingen eerst bevestiging als het om geld of status gaat.',
        },
      }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} }
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: GEREEDSCHAPPEN } }
    case 'tools/call': {
      const naam = String(verzoek.params?.name ?? '')
      const invoer = (verzoek.params?.arguments ?? {}) as Record<string, unknown>
      try {
        const uitkomst = await voerUit(db, naam, invoer)
        const tekst = typeof uitkomst === 'string' ? uitkomst : JSON.stringify(uitkomst, null, 1)
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: tekst }] } }
      } catch (fout) {
        // Een fout in een tool is een antwoord voor Claude, geen protocolfout:
        // zo kan hij het zelf lezen en het opnieuw proberen.
        return {
          jsonrpc: '2.0',
          id,
          result: { isError: true, content: [{ type: 'text', text: uitleg(fout) }] },
        }
      }
    }
    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Onbekende methode: ${verzoek.method}` },
      }
  }
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function uitleg(fout: unknown): string {
  if (fout instanceof Error) return fout.message
  if (fout && typeof fout === 'object' && 'message' in fout) return String(fout.message)
  return String(fout)
}

/** Vergelijken zonder bij de eerste verkeerde letter te stoppen: anders
 *  verraadt de tijd die het kost hoeveel tekens er al klopten. */
function veiligGelijk(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let verschil = 0
  for (let i = 0; i < a.length; i++) verschil |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return verschil === 0
}
