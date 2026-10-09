import { useEffect, useState, type CSSProperties } from 'react'
import { ArrowDown, CalendarClock, Check, ChevronDown, Loader2, MessageSquare, Palette, RefreshCw, XCircle, ZoomIn } from 'lucide-react'
import { callPublicDocument, type PublicDocumentResult } from '../../lib/publicDocument'
import { todayDate } from '../../components/domain/domainShared'

interface DesignApproval {
  status?: string
  accepted_at?: string
  accepted_name?: string
  declined_at?: string
  declined_name?: string
  declined_reason?: string
}

interface PublicDesign {
  type: string
  title: string
  image_url: string
  approval: DesignApproval | null
  feedback_deadline?: string | null
}

type DesignResult = PublicDocumentResult<{ designs: PublicDesign[] }>

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function DesignCard({ design, token, highlighted, onUpdated }: {
  design: PublicDesign
  token: string
  highlighted: boolean
  onUpdated: (res: DesignResult) => void
}) {
  const [name, setName] = useState('')
  const [showFeedback, setShowFeedback] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const status = design.approval?.status
  const isOpen = !status || status === 'new_version'
  // Alleen tonen zolang de datum nog niet voorbij is
  const deadline = design.feedback_deadline && design.feedback_deadline >= todayDate()
    ? new Date(`${design.feedback_deadline}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
    : null

  const respond = async (accepted: boolean) => {
    setBusy(true)
    setError('')
    try {
      onUpdated(await callPublicDocument<DesignResult>({
        action: accepted ? 'accept' : 'decline', type: 'design', token, design_type: design.type,
        name: name.trim(), reason: reason.trim(),
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er ging iets mis.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id={`design-${design.type}`}
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden scroll-mt-20 ${highlighted ? 'border-primary/40 ring-2 ring-primary/10' : 'border-gray-100'}`}>
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Palette className="w-4 h-4 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 truncate">{design.title}</h2>
        </div>
        {status === 'new_version' && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 flex-shrink-0">
            <RefreshCw className="w-3 h-3" /> Nieuwe versie
          </span>
        )}
      </div>

      <a href={design.image_url} target="_blank" rel="noopener noreferrer" className="block relative group bg-gray-50" title="Open op ware grootte">
        <img src={design.image_url} alt={design.title} className="w-full h-auto" />
        <span className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/90 text-xs font-medium text-gray-700 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
          <ZoomIn className="w-3.5 h-3.5" /> Ware grootte
        </span>
      </a>

      {status === 'accepted' && design.approval?.accepted_at && (
        <div className="flex items-center justify-center gap-3 px-6 py-5 bg-green-50 border-t border-green-100">
          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <Check className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-green-900">Goedgekeurd</p>
            <p className="text-sm text-green-700">door {design.approval.accepted_name} op {formatDateTime(design.approval.accepted_at)}</p>
          </div>
        </div>
      )}

      {status === 'declined' && (
        <div className="px-6 py-5 bg-amber-50 border-t border-amber-100">
          <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-amber-900">Feedback ontvangen</p>
              <p className="text-sm text-amber-700">We passen het ontwerp aan en laten je weten wanneer de nieuwe versie klaarstaat.</p>
            </div>
          </div>
          {design.approval?.declined_reason && (
            <p className="mt-3 text-sm text-gray-700 bg-white/70 rounded-xl px-4 py-3 whitespace-pre-wrap">{design.approval.declined_reason}</p>
          )}
          </div>
        </div>
      )}

      {isOpen && (
        <div className="border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-6 py-5 space-y-4">
          {!showFeedback ? (
            <>
              <p className="text-sm text-gray-600">Ben je tevreden met dit ontwerp? Keur het dan goed. Wil je iets anders zien, vraag dan een aanpassing aan.</p>
              {deadline && (
                <div className="flex items-start gap-2.5 text-sm text-gray-700 bg-primary/5 border border-primary/10 rounded-xl px-4 py-3">
                  <CalendarClock className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <p>
                    Graag je reactie uiterlijk <strong>{deadline}</strong>. Hebben we vóór die datum niets van je gehoord,
                    dan gaan we ervan uit dat het ontwerp akkoord is en gaan we verder met de volgende stap.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Je naam</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vul je naam in"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all" />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}
              <div className="flex flex-col sm:flex-row gap-3">
                <button type="button" onClick={() => respond(true)} disabled={busy || !name.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Ontwerp goedkeuren
                </button>
                <button type="button" onClick={() => { setShowFeedback(true); setError('') }}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
                  <MessageSquare className="w-4 h-4" />
                  Aanpassing vragen
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Wat moet er anders?</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4}
                  placeholder="Beschrijf zo concreet mogelijk wat je anders wilt zien..."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Je naam <span className="text-gray-400 font-normal">(optioneel)</span></label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vul je naam in"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all" />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowFeedback(false); setError('') }}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  Annuleren
                </button>
                <button type="button" onClick={() => respond(false)} disabled={busy || !reason.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                  Feedback versturen
                </button>
              </div>
            </>
          )}
        </div>
        </div>
      )}
    </section>
  )
}

// Positie van het scherm in /mockups/monitor.webp (in procenten van de afbeelding);
// het ontwerp ligt onder de monitor en is zichtbaar door het uitgespaarde scherm.
// Rondom 0,25-0,3% ruimer dan het gat (valt weg onder de zwarte rand), zodat door
// afronding nergens een kier langs het ontwerp ontstaat.
const MONITOR_SCREEN = { left: '3.788%', top: '4.971%', width: '92.295%', height: '63.313%' }

// Het bovenste stuk van het ontwerp (16:9, de hero) in een monitor, als op een laptop:
// van het 1920px brede ontwerp alleen het middelste stuk van 1440px (breedte 133,3%,
// links en rechts 16,7% buiten beeld), zodat de content het scherm vult. Op apparaten met
// een muis scrolt het scherm bij hover langzaam door het hele ontwerp; op een telefoon
// niet (Tailwind past hover: alleen toe op apparaten die kunnen hoveren).
function MonitorPreview({ imageUrl, title }: { imageUrl: string; title: string }) {
  const [scrollMs, setScrollMs] = useState(8000)
  return (
    <div className="group relative w-full max-w-[760px] mx-auto">
      <div className="absolute overflow-hidden bg-black" style={MONITOR_SCREEN}>
        <img src={imageUrl} alt={`${title} in een monitor`}
          onLoad={(e) => {
            // Langer ontwerp = langzamer scrollen: ongeveer 2,5 seconde per schermhoogte
            const { naturalWidth, naturalHeight } = e.currentTarget
            // Zichtbaar stuk is 1440 breed, dus één schermhoogte = 1440 × 9/16 van het ontwerp
            const screens = naturalWidth ? (naturalHeight / (naturalWidth * 0.75)) / (9 / 16) - 1 : 0
            setScrollMs(Math.min(20000, Math.max(2500, Math.round(screens * 2500))))
          }}
          style={{ '--scroll-ms': `${scrollMs}ms` } as CSSProperties}
          className="max-w-none w-[133.333%] -ml-[16.667%] h-full object-cover object-top transition-[object-position] duration-700 ease-out group-hover:object-bottom group-hover:duration-(--scroll-ms) group-hover:ease-in-out" />
      </div>
      <img src="/mockups/monitor.webp" alt="" aria-hidden="true" className="relative w-full h-auto pointer-events-none select-none" />
    </div>
  )
}

// Designs van een domein beoordelen via de link in de mail, zonder inloggen
export default function PublicDesignPage({ token, focusType }: { token: string; focusType: string | null }) {
  const [result, setResult] = useState<DesignResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [mainTypes, setMainTypes] = useState<string[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        const res = await callPublicDocument<DesignResult>({ action: 'get', type: 'design', token })
        setResult(res)
        setMainTypes(pickMainTypes(res.document.designs, focusType))
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : '')
      }
      setLoading(false)
    }
    load()
  }, [token, focusType])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!result) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <XCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-lg font-medium text-gray-900">Ontwerp niet gevonden</h2>
        <p className="mt-2 text-sm text-gray-500">{loadError || 'Deze link is ongeldig of niet meer actief.'}</p>
      </div>
    )
  }

  // Het design uit de mail eerst, daarna de rest in vaste volgorde
  const designs = [...result.document.designs].sort((a, b) => Number(b.type === focusType) - Number(a.type === focusType))
  // Groot: wat nu aandacht vraagt (vastgelegd bij het openen, zodat een design niet
  // wegspringt zodra de klant het goedkeurt). De rest compact onderaan als naslag.
  const mainDesigns = designs.filter(d => mainTypes.includes(d.type))
  const earlierDesigns = designs.filter(d => !mainTypes.includes(d.type))
  // In de monitor een pagina, geen styleguide: liefst het design uit de mail, anders de homepage
  const monitorDesign = designs.find(d => d.type === focusType && d.type !== 'styleguide')
    || designs.find(d => d.type === 'homepage')
    || designs.find(d => d.type !== 'styleguide')
    || designs[0]

  return (
    // Breed: ontwerpen zijn 1920px breed en moeten zo groot mogelijk getoond worden,
    // anders wordt de contentbreedte van het ontworpen site onnatuurlijk smal
    <div className="max-w-[1920px] mx-auto space-y-6">
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[5fr_7fr] items-center gap-10 px-6 sm:px-10 py-10 lg:py-14">
          <div>
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">Ontwerp ter beoordeling</p>
            <h1 className="mt-3 text-3xl lg:text-4xl font-bold text-gray-900 leading-tight">
              Welkom! Je ontwerp{mainDesigns.length > 1 ? 'en' : ''} voor {result.project_name} {mainDesigns.length > 1 ? 'staan' : 'staat'} klaar
            </h1>
            <p className="mt-4 text-gray-600 leading-relaxed">
              Hieronder zie je het ontwerp op ware grootte, precies zoals je website eruit gaat zien. Bekijk het rustig
              en keur het goed, of laat weten wat er anders moet. Inloggen is niet nodig.
            </p>
            {mainDesigns.length > 0 && (
              <button type="button"
                onClick={() => document.getElementById(`design-${mainDesigns[0].type}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors">
                Bekijk het ontwerp
                <ArrowDown className="w-4 h-4" />
              </button>
            )}
          </div>
          {monitorDesign && (
            <div>
              <MonitorPreview imageUrl={monitorDesign.image_url} title={monitorDesign.title} />
              <p className="hidden pointer-fine:block mt-3 text-center text-xs text-gray-400">
                Ga met je muis over het scherm om door het ontwerp te scrollen
              </p>
            </div>
          )}
        </div>
      </section>
      {designs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-500">
          Er staan op dit moment geen ontwerpen klaar.
        </div>
      ) : mainDesigns.map((design) => (
        <DesignCard key={design.type} design={design} token={token} highlighted={design.type === focusType && mainDesigns.length > 1}
          onUpdated={setResult} />
      ))}
      {earlierDesigns.length > 0 && (
        <EarlierDesigns designs={earlierDesigns} token={token} onUpdated={setResult} />
      )}
    </div>
  )
}

const isAwaitingReply = (d: PublicDesign) => !d.approval?.status || d.approval.status === 'new_version'

// Welke designs groot getoond worden: het design uit de mail plus alles waar nog een
// reactie op nodig is. Staat er niets open, dan alles (als overzicht).
function pickMainTypes(designs: PublicDesign[], focusType: string | null) {
  const main = designs.filter(d => d.type === focusType || isAwaitingReply(d)).map(d => d.type)
  return main.length > 0 ? main : designs.map(d => d.type)
}

// Strook onderaan met eerder beoordeelde designs; openklikken toont het design groot
function EarlierDesigns({ designs, token, onUpdated }: {
  designs: PublicDesign[]
  token: string
  onUpdated: (res: DesignResult) => void
}) {
  const [openType, setOpenType] = useState<string | null>(null)
  const allApproved = designs.every(d => d.approval?.status === 'accepted')
  return (
    <>
    <section className="max-w-3xl mx-auto pt-4 space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          {allApproved ? 'Eerder goedgekeurd' : 'Eerder beoordeeld'}
        </span>
        <span className="flex-1 h-px bg-gray-200" />
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
        {designs.map((d) => {
          const accepted = d.approval?.status === 'accepted'
          const date = accepted ? d.approval?.accepted_at : d.approval?.declined_at
          const isOpen = openType === d.type
          return (
            <div key={d.type} className="flex items-center gap-4 p-3">
              <img src={d.image_url} alt="" className="w-20 h-12 flex-shrink-0 rounded-md border border-gray-200 object-cover object-top" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{d.title}</p>
                <p className={`text-xs ${accepted ? 'text-green-700' : 'text-amber-700'}`}>
                  {accepted ? 'Goedgekeurd' : 'Feedback gegeven'}
                  {date ? ` op ${new Date(date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setOpenType(isOpen ? null : d.type)} aria-expanded={isOpen}
                className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                {isOpen ? 'Verbergen' : 'Bekijken'}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )
        })}
      </div>
    </section>
    {/* Openklikken toont het design op volle breedte, net als hierboven */}
    {openType && designs.some(d => d.type === openType) && (
      <DesignCard design={designs.find(d => d.type === openType)!} token={token} highlighted={false} onUpdated={onUpdated} />
    )}
    </>
  )
}
