import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, X, Send, Sparkles } from 'lucide-react'

/**
 * ChatWidget — proof-of-concept assistent voor de onderhoudsfase.
 *
 * LET OP: dit is nog een PROOF OF CONCEPT. De antwoorden komen uit lokale
 * dummy-logica (`generatePocReply`), er is NOG GEEN taalmodel gekoppeld.
 *
 * Zodra de Anthropic API-key beschikbaar is, vervangen we `generatePocReply`
 * door een aanroep naar een Supabase Edge Function (`chat`). Zie de TODO in
 * `sendMessage()` hieronder — alleen dat stukje hoeft te veranderen, de hele
 * UI en de context-props blijven hetzelfde.
 *
 * De context-props (klantnaam, project, strippensaldo) tonen nu al hoe de bot
 * "context-bewust" wordt: straks geven we exact deze gegevens mee aan het model.
 */

interface ChatMessage {
  role: 'assistant' | 'user'
  content: string
  /** Optioneel: toon een knop naar een interne pagina onder het bericht. */
  cta?: { label: string; to: string }
}

interface ChatWidgetProps {
  clientName: string
  projectName: string
  remainingStrips: number
  hasActiveCard: boolean
}

// ---------------------------------------------------------------------------
// POC-antwoordlogica — wordt later vervangen door het echte taalmodel.
// Vriendelijk + professioneel, en valt netjes terug op "maak een ticket aan".
// ---------------------------------------------------------------------------
function generatePocReply(
  input: string,
  ctx: ChatWidgetProps,
): ChatMessage {
  const text = input.toLowerCase()

  const mentions = (...words: string[]) => words.some((w) => text.includes(w))

  // Strippensaldo
  if (mentions('strip', 'saldo', 'tegoed', 'hoeveel heb ik')) {
    if (ctx.hasActiveCard) {
      return {
        role: 'assistant',
        content:
          `Je hebt op dit moment nog ${ctx.remainingStrips} ${ctx.remainingStrips === 1 ? 'strip' : 'strippen'} ` +
          `op je actieve strippenkaart. Elke strip staat voor 5 minuten service. ` +
          `Wil je er meer? Dan kun je heel eenvoudig een nieuwe strippenkaart aanschaffen.`,
        cta: { label: 'Strippenkaart kopen', to: '/strippenkaart' },
      }
    }
    return {
      role: 'assistant',
      content:
        `Je hebt op dit moment geen actieve strippenkaart, dus je strippensaldo is 0. ` +
        `Zonder strippen kunnen wij helaas geen onderhoud of aanpassingen uitvoeren. ` +
        `Je kunt eenvoudig een nieuwe strippenkaart aanschaffen om weer gebruik te maken van onze ondersteuning.`,
      cta: { label: 'Strippenkaart kopen', to: '/strippenkaart' },
    }
  }

  // Ticket / iets melden
  if (mentions('ticket', 'melden', 'probleem', 'kapot', 'werkt niet', 'fout', 'bug', 'aanpassing', 'wijziging', 'aanvraag')) {
    return {
      role: 'assistant',
      content:
        `Dat regelen we graag voor je! Voor een concrete aanvraag of een melding ` +
        `maak je het beste een ticket aan. Zo kan ons team er gericht mee aan de slag ` +
        `en houd je zelf overzicht over de status.`,
      cta: { label: 'Ga naar tickets', to: '/support' },
    }
  }

  // Wat is onderhoud / strippenkaart-uitleg
  if (mentions('onderhoud', 'wat kan', 'waarvoor', 'hoe werkt', 'uitleg')) {
    return {
      role: 'assistant',
      content:
        `In de onderhoudsfase zorgen wij dat je website up-to-date en veilig blijft. ` +
        `Denk aan updates, kleine aanpassingen en support. Je betaalt met strippen: ` +
        `elke strip is 5 minuten service, die je inzet wanneer het jou uitkomt. ` +
        `Heb je een specifieke vraag over je website "${ctx.projectName}"? Stel hem gerust.`,
    }
  }

  // Kosten / prijs
  if (mentions('kost', 'prijs', 'tarief', 'euro', 'betalen', 'duur')) {
    return {
      role: 'assistant',
      content:
        `Onderhoud reken je af met strippen. Een strippenkaart koop je vooraf en is ` +
        `2 jaar geldig — zo betaal je alleen voor wat je daadwerkelijk gebruikt. ` +
        `Op de strippenkaart-pagina vind je de actuele pakketten en prijzen.`,
      cta: { label: 'Bekijk strippenkaarten', to: '/strippenkaart' },
    }
  }

  // Begroeting
  if (mentions('hoi', 'hallo', 'hey', 'goedemorgen', 'goedemiddag', 'goedenavond', 'dag ')) {
    return {
      role: 'assistant',
      content: `Hallo ${ctx.clientName}! Waarmee kan ik je vandaag helpen?`,
    }
  }

  // Bedankt
  if (mentions('bedankt', 'dank je', 'dankjewel', 'thanks', 'top')) {
    return {
      role: 'assistant',
      content: `Graag gedaan! Kan ik je verder nog ergens mee helpen?`,
    }
  }

  // Fallback — eerlijk zijn en doorverwijzen naar een ticket
  return {
    role: 'assistant',
    content:
      `Dat weet ik even niet zeker, en ik wil je geen onjuist antwoord geven. ` +
      `Maak hiervoor het beste een ticket aan, dan pakt een collega het persoonlijk voor je op.`,
    cta: { label: 'Maak een ticket aan', to: '/support' },
  }
}

export default function ChatWidget(props: ChatWidgetProps) {
  const { clientName } = props
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Welkomstbericht bij eerste keer openen
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content:
            `Hoi ${clientName}! Ik ben je digitale assistent voor de onderhoudsfase. ` +
            `Je kunt me bijvoorbeeld vragen naar je strippensaldo, hoe onderhoud werkt, ` +
            `of hoe je iets aanvraagt. Waarmee kan ik je helpen?`,
        },
      ])
    }
  }, [open, messages.length, clientName])

  // Scroll mee naar onderen bij nieuwe berichten
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  // Focus de input wanneer het venster opent
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  const sendMessage = async () => {
    const trimmed = input.trim()
    if (!trimmed || thinking) return

    setMessages((prev) => [...prev, { role: 'user', content: trimmed }])
    setInput('')
    setThinking(true)

    // -----------------------------------------------------------------------
    // TODO (na aanleveren Anthropic API-key):
    // Vervang dit blok door een fetch naar de Supabase Edge Function `chat`,
    // die de gesprekgeschiedenis + context-props doorstuurt naar Claude en het
    // antwoord (bij voorkeur streaming) teruggeeft. De rest van dit component
    // hoeft niet te veranderen.
    // -----------------------------------------------------------------------
    const reply = generatePocReply(trimmed, props)
    // Kleine kunstmatige vertraging zodat het natuurlijk aanvoelt.
    await new Promise((r) => setTimeout(r, 600))

    setMessages((prev) => [...prev, reply])
    setThinking(false)
  }

  return (
    <>
      {/* Zwevende open-knop */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open chat-assistent"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-primary hover:bg-primary-600 text-white shadow-lg shadow-primary/30 transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm font-medium hidden sm:inline">Hulp nodig?</span>
        </button>
      )}

      {/* Chatvenster */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2.5rem)] sm:w-96 max-w-96 h-[32rem] max-h-[calc(100vh-2.5rem)] flex flex-col rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-white">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold">Assistent</p>
                <p className="text-[11px] text-white/80">Onderhoud &amp; support</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Sluit chat"
              className="p-1.5 rounded-lg hover:bg-white/15 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Berichten */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#f8f7fc]">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-white rounded-br-sm'
                      : 'bg-white text-gray-700 border border-gray-100 rounded-bl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.cta && (
                    <Link
                      to={msg.cta.to}
                      onClick={() => setOpen(false)}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-600 text-white text-xs font-medium transition-colors"
                    >
                      {msg.cta.label}
                    </Link>
                  )}
                </div>
              </div>
            ))}

            {thinking && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-3.5 py-3">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" />
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* POC-melding */}
          <div className="px-4 py-1.5 bg-amber-50 border-t border-amber-100">
            <p className="text-[10px] text-amber-700 text-center">
              Proof of concept — voorbeeldantwoorden, nog geen live AI
            </p>
          </div>

          {/* Invoer */}
          <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-100 bg-white">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Typ je vraag..."
              className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!input.trim() || thinking}
              aria-label="Verstuur"
              className="p-2.5 rounded-xl bg-primary hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
