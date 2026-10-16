import { useEffect, useState } from 'react'
import { ArrowDown, Loader2, Mail, Palette, XCircle, ZoomIn } from 'lucide-react'
import { callPublicDocument, type PublicDocumentResult } from '../../lib/publicDocument'
import { REDESIGN_DEFAULT_INTRO } from '../../lib/leads'
import MonitorPreview from '../../components/MonitorPreview'

interface PublicRedesign {
  title: string
  intro: string
  image_url: string
  contact_email: string
}

type RedesignResult = PublicDocumentResult<PublicRedesign>

// Redesign voor een lead via de link in de mail: titel, intro, het ontwerp in een
// monitor en daaronder het volledige ontwerp. Geen goedkeuring, alleen een contactknop.
export default function PublicRedesignPage({ token }: { token: string }) {
  const [result, setResult] = useState<RedesignResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setResult(await callPublicDocument<RedesignResult>({ action: 'get', type: 'redesign', token }))
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : '')
      }
      setLoading(false)
    }
    load()
  }, [token])

  useEffect(() => {
    if (!result) return
    const previous = document.title
    document.title = `${result.document.title} | DesignPixels`
    return () => { document.title = previous }
  }, [result])

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

  const redesign = result.document
  const mailto = `mailto:${redesign.contact_email}?subject=${encodeURIComponent(`Het ontwerp voor ${result.project_name}`)}`

  return (
    // Breed: ontwerpen zijn 1920px breed en moeten zo groot mogelijk getoond worden
    <div className="max-w-[1920px] mx-auto space-y-6">
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[5fr_7fr] items-center gap-10 px-6 sm:px-10 py-10 lg:py-14">
          <div>
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">Een idee voor je nieuwe website</p>
            <h1 className="mt-3 text-3xl lg:text-4xl font-bold text-gray-900 leading-tight">{redesign.title}</h1>
            <p className="mt-4 text-gray-600 leading-relaxed whitespace-pre-line">{redesign.intro || REDESIGN_DEFAULT_INTRO}</p>
            <button type="button"
              onClick={() => document.getElementById('redesign-full')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors">
              Bekijk het hele ontwerp
              <ArrowDown className="w-4 h-4" />
            </button>
          </div>
          <div>
            <MonitorPreview imageUrl={redesign.image_url} title={redesign.title} />
            <p className="hidden pointer-fine:block mt-3 text-center text-xs text-gray-400">
              Ga met je muis over het scherm om door het ontwerp te scrollen
            </p>
          </div>
        </div>
      </section>

      <section id="redesign-full" className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden scroll-mt-20">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Palette className="w-4 h-4 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 truncate">Het volledige ontwerp</h2>
        </div>
        <a href={redesign.image_url} target="_blank" rel="noopener noreferrer" className="block relative group bg-gray-50" title="Open op ware grootte">
          <img src={redesign.image_url} alt={redesign.title} className="w-full h-auto" />
          <span className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/90 text-xs font-medium text-gray-700 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
            <ZoomIn className="w-3.5 h-3.5" /> Ware grootte
          </span>
        </a>
      </section>

      {/* Rustig afsluiten: geen goedkeuring, alleen de mogelijkheid om te reageren */}
      <section className="max-w-3xl mx-auto px-6 py-10 text-center">
        <h2 className="text-xl font-bold text-gray-900">Benieuwd wat dit voor je kan betekenen?</h2>
        <p className="mt-2 text-gray-600 leading-relaxed">
          Laat gerust weten wat je ervan vindt of stel je vragen. Ik denk graag vrijblijvend met je mee.
        </p>
        <a href={mailto}
          className="mt-5 inline-flex items-center gap-2 px-6 py-3 border border-gray-200 bg-white text-gray-700 text-sm font-medium rounded-xl hover:border-primary/40 hover:text-primary transition-colors">
          <Mail className="w-4 h-4" />
          Stuur me een bericht
        </a>
        <p className="mt-3 text-xs text-gray-400">{redesign.contact_email}</p>
      </section>
    </div>
  )
}
