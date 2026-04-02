import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Quote, QuoteStatus } from '../../types'
import { Plus, FileCheck, Trash2, Pencil, FlaskConical, X } from 'lucide-react'

const statusLabels: Record<QuoteStatus, string> = { draft: 'Concept', sent: 'Verzonden', accepted: 'Geaccepteerd', declined: 'Afgewezen' }
const statusColors: Record<QuoteStatus, string> = { draft: 'bg-gray-100 text-gray-700', sent: 'bg-yellow-100 text-yellow-700', accepted: 'bg-green-100 text-green-700', declined: 'bg-red-100 text-red-700' }

export default function Quotes() {
  const navigate = useNavigate()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [isTest, setIsTest] = useState(false)

  const fetchQuotes = async () => {
    const { data } = await supabase.from('quotes').select('*, client:clients(name), project:projects(name)').order('created_at', { ascending: false })
    setQuotes(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchQuotes()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze offerte wilt verwijderen?')) return
    await supabase.from('quotes').delete().eq('id', id)
    fetchQuotes()
  }

  const cycleStatus = async (quote: Quote) => {
    const order: QuoteStatus[] = ['draft', 'sent', 'accepted', 'declined']
    const nextIndex = (order.indexOf(quote.status) + 1) % order.length
    await supabase.from('quotes').update({ status: order[nextIndex] }).eq('id', quote.id)
    fetchQuotes()
  }

  const handleCreate = () => {
    const params = isTest ? '?test=1' : ''
    setShowNewModal(false)
    setIsTest(false)
    navigate(`/admin/offertes/nieuw${params}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Offertes</h1>
          <p className="text-gray-500 mt-1">Beheer je offertes</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nieuwe offerte
        </button>
      </div>

      {/* New quote modal */}
      {showNewModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setShowNewModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Nieuwe offerte</h2>
                <button
                  onClick={() => { setShowNewModal(false); setIsTest(false) }}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <label className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTest}
                  onChange={(e) => setIsTest(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 border-gray-300 focus:ring-amber-400 mt-0.5"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <FlaskConical className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-medium text-gray-800">Dit is een testofferte</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Er wordt geen offertenummer uit de reeks gebruikt.
                  </p>
                </div>
              </label>

              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleCreate}
                  className="flex-1 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors"
                >
                  Offerte aanmaken
                </button>
                <button
                  onClick={() => { setShowNewModal(false); setIsTest(false) }}
                  className="px-4 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Annuleren
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {loading ? (
        <div className="space-y-4">{[...Array(3)].map((_, i) => (<div key={i} className="bg-white rounded-xl p-6 shadow-sm animate-pulse"><div className="h-16" /></div>))}</div>
      ) : quotes.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <FileCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nog geen offertes</h3>
          <p className="text-gray-500 mt-1">Maak je eerste offerte aan.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {quotes.map((quote) => (
            <div key={quote.id} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex items-center justify-between group">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{quote.number}</h3>
                  {quote.is_test && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">Test</span>
                  )}
                </div>
                <p className="text-sm text-gray-500">{(quote.client as unknown as { name: string })?.name} — {(quote.project as unknown as { name: string })?.name}</p>
                <p className="text-sm text-gray-400 mt-0.5">Geldig tot: {new Date(quote.valid_until).toLocaleDateString('nl-NL')}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold text-gray-900">&euro;{quote.amount.toFixed(2)}</span>
                <button onClick={() => cycleStatus(quote)} className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer ${statusColors[quote.status]}`}>
                  {statusLabels[quote.status]}
                </button>
                <button
                  onClick={() => navigate(`/admin/offertes/${quote.id}`)}
                  className="p-2 text-gray-400 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                  title="Bewerken"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(quote.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
