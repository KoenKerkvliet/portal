import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, X, Send, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'

/**
 * ChatWidget — context-bewuste assistent voor de onderhoudsfase.
 *
 * De antwoorden komen van Claude via de Supabase Edge Function `chat`. Die
 * functie bepaalt server-side (veilig, met service role) de context van de
 * klant — strippensaldo, project en open tickets — en stuurt die mee aan het
 * model. De browser stuurt alleen de gespreksgeschiedenis.
 *
 * Valt de aanroep om wat voor reden dan ook weg, dan vangen we dat netjes op
 * met lokale dummy-logica (`generatePocReply`) zodat de klant nooit met een
 * lege chat blijft zitten.
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
          `Wil je er meer? Dan kun je eenvoudig een nieuwe strippenkaart aanschaffen.`,
        cta: { label: 'Strippenkaart kopen', to: '/strippenkaart' },
      }
    }
    return {
      role: 'assistant',
      content:
        `Je hebt op dit moment geen actieve strippenkaart, dus je strippensaldo is 0. ` +
        `Zonder strippen kan ik helaas geen onderhoud of aanpassingen uitvoeren. ` +
        `Je kunt eenvoudig een nieuwe strippenkaart aanschaffen om weer gebruik te maken van mijn ondersteuning.`,
      cta: { label: 'Strippenkaart kopen', to: '/strippenkaart' },
    }
  }

  // Ticket / iets melden
  if (mentions('ticket', 'melden', 'probleem', 'kapot', 'werkt niet', 'fout', 'bug', 'aanpassing', 'wijziging', 'aanvraag')) {
    return {
      role: 'assistant',
      content:
        `Dat regel ik graag voor je! Voor een concrete aanvraag of een melding ` +
        `maak je het beste een ticket aan. Zo kan ik er gericht mee aan de slag ` +
        `en houd je zelf overzicht over de status.`,
      cta: { label: 'Ga naar tickets', to: '/support' },
    }
  }

  // Wat is onderhoud / strippenkaart-uitleg
  if (mentions('onderhoud', 'wat kan', 'waarvoor', 'hoe werkt', 'uitleg')) {
    return {
      role: 'assistant',
      content:
        `In de onderhoudsfase zorg ik dat je website up-to-date en veilig blijft. ` +
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
      `Maak hiervoor het beste een ticket aan, dan pak ik het persoonlijk voor je op.`,
    cta: { label: 'Maak een ticket aan', to: '/support' },
  }
}

// ---------------------------------------------------------------------------
// Parse het antwoord van het model: haal eventuele [[CTA:label|/pad]]-markers
// eruit en zet ze om in een knop onder het bericht.
// ---------------------------------------------------------------------------
function parseReply(raw: string): ChatMessage {
  const ctaRegex = /\[\[CTA:([^|\]]+)\|([^\]]+)\]\]/
  const match = raw.match(ctaRegex)
  const content = raw
    .replace(/\[\[CTA:[^\]]+\]\]/g, '') // verwijder de CTA-marker(s)
    .replace(/[ \t]+\n/g, '\n')          // trailing spaties per regel weg
    .replace(/\n{3,}/g, '\n\n')          // meerdere lege regels -> max één
    .trim()
  if (match) {
    return {
      role: 'assistant',
      content,
      cta: { label: match[1].trim(), to: match[2].trim() },
    }
  }
  return { role: 'assistant', content }
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

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInput('')
    setThinking(true)

    try {
      // Stuur alleen de gespreksgeschiedenis mee; de server bepaalt de context
      // (strippensaldo, project, tickets) veilig op basis van het JWT.
      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        },
      })
      if (error) throw error
      const replyText = (data?.reply || '').trim()
      if (!replyText) throw new Error('Leeg antwoord')
      setMessages((prev) => [...prev, parseReply(replyText)])
    } catch (err) {
      console.error('Chat error:', err)
      // Nette terugval op lokale logica zodat de klant nooit zonder antwoord zit.
      setMessages((prev) => [...prev, generatePocReply(trimmed, props)])
    } finally {
      setThinking(false)
    }
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

          {/* Disclaimer */}
          <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 text-center">
              AI-assistent — kan af en toe iets missen. Bij twijfel maak je een ticket aan.
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
