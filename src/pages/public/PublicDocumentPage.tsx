import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import ClientQuotePage from '../client/QuotePage'
import ClientInvoicePage from '../client/InvoicePage'
import ClientAssignmentPage from '../client/AssignmentPage'
import PublicDesignPage from './PublicDesignPage'
import PublicFormPage from './PublicFormPage'
import PublicBoardPage from './PublicBoardPage'
import PublicRedesignPage from './PublicRedesignPage'
import AbsenceBanner from '../../components/AbsenceBanner'
import type { PublicDocType } from '../../lib/publicDocument'

// Zet een <meta> zolang deze pagina open is en herstelt daarna de oude waarde
function useMeta(name: string, content: string) {
  useEffect(() => {
    let tag = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
    const created = !tag
    const previous = tag?.content
    if (!tag) {
      tag = document.createElement('meta')
      tag.name = name
      document.head.appendChild(tag)
    }
    tag.content = content
    return () => {
      if (created) tag?.remove()
      else if (tag && previous !== undefined) tag.content = previous
    }
  }, [name, content])
}

// Offerte, factuur, opdracht, designs, vragenlijst, planning of een redesign voor een lead via de link in de mail — zonder inloggen
export default function PublicDocumentPage({ type }: { type: PublicDocType }) {
  const { token } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()

  // De geheime code staat in de URL: niet doorgeven aan andere sites en niet laten indexeren
  useMeta('referrer', 'no-referrer')
  useMeta('robots', 'noindex, nofollow')

  const wide = type === 'design' || type === 'redesign'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 shadow-sm">
        {/* Bij ontwerpen even breed als de (brede) ontwerpweergave eronder */}
        <div className={`${wide ? 'max-w-[1920px] px-4' : 'max-w-5xl px-4 sm:px-6 lg:px-8'} mx-auto h-14 sm:h-16 flex items-center`}>
          <span className="text-lg font-bold tracking-tight flex items-center gap-2.5">
            <img src="/logo-mark.png" alt="" className="w-8 h-8 rounded-lg flex-shrink-0" />
            <span>
              <span className="text-primary">Design</span>
              <span className="text-gray-900">Pixels</span>
            </span>
          </span>
        </div>
      </header>
      {/* Een lead hoeft niet te weten dat ik op vakantie ben */}
      {type !== 'redesign' && <AbsenceBanner width={wide ? 'max-w-[1920px]' : 'max-w-5xl'} />}

      {type === 'assignment' ? (
        <ClientAssignmentPage key={token} publicToken={token || ''} />
      ) : type === 'design' ? (
        <div className="py-8 px-4">
          <PublicDesignPage key={token} token={token || ''} focusType={searchParams.get('type')} />
        </div>
      ) : type === 'redesign' ? (
        <div className="py-8 px-4">
          <PublicRedesignPage key={token} token={token || ''} />
        </div>
      ) : type === 'board' ? (
        <div className="py-8 px-4 sm:px-6 lg:px-8">
          <PublicBoardPage key={token} token={token || ''} />
        </div>
      ) : type === 'form' ? (
        <div className="py-8 px-4 sm:px-6 lg:px-8">
          <PublicFormPage key={token} token={token || ''} />
        </div>
      ) : (
        <div className="py-8 px-4 sm:px-6 lg:px-8">
          {type === 'quote'
            ? <ClientQuotePage key={token} publicToken={token || ''} />
            : <ClientInvoicePage key={token} publicToken={token || ''} />}
        </div>
      )}
    </div>
  )
}
