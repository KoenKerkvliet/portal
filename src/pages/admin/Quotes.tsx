import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Quote, QuoteStatus } from '../../types'
import { Plus, FileCheck, Trash2 } from 'lucide-react'

const statusLabels: Record<QuoteStatus, string> = { draft: 'Concept', sent: 'Verzonden', accepted: 'Geaccepteerd', declined: 'Afgewezen' }
const statusColors: Record<QuoteStatus, string> = { draft: 'bg-gray-100 text-gray-700', sent: 'bg-yellow-100 text-yellow-700', accepted: 'bg-green-100 text-green-700', declined: 'bg-red-100 text-red-700' }

export default function Quotes() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [formData, setFormData] = useState({ number: '', amount: '', client_id: '', project_id: '', valid_until: '' })

  const fetchQuotes = async () => {
    const { data } = await supabase.from('quotes').select('*, client:clients(name), project:projects(name)').order('created_at', { ascending: false })
    setQuotes(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchQuotes()
    supabase.from('clients').select('id, name').then(({ data }) => setClients(data || []))
    supabase.from('projects').select('id, name').then(({ data }) => setProjects(data || []))
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('quotes').insert({ ...formData, amount: parseFloat(formData.amount), status: 'draft' })
    setShowForm(false)
    setFormData({ number: '', amount: '', client_id: '', project_id: '', valid_until: '' })
    fetchQuotes()
  }

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

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Offertes</h1>
          <p className="text-gray-500 mt-1">Beheer je offertes</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors">
          <Plus className="w-4 h-4" />
          Nieuwe offerte
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Offertenummer</label>
              <input type="text" value={formData.number} onChange={(e) => setFormData({ ...formData, number: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bedrag</label>
              <input type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Klant</label>
              <select value={formData.client_id} onChange={(e) => setFormData({ ...formData, client_id: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" required>
                <option value="">Selecteer</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
              <select value={formData.project_id} onChange={(e) => setFormData({ ...formData, project_id: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" required>
                <option value="">Selecteer</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Geldig tot</label>
              <input type="date" value={formData.valid_until} onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" required />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="bg-primary hover:bg-primary-600 text-white px-4 py-2 rounded-lg font-medium transition-colors">Aanmaken</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">Annuleren</button>
          </div>
        </form>
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
            <div key={quote.id} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{quote.number}</h3>
                <p className="text-sm text-gray-500">{(quote.client as unknown as { name: string })?.name} — {(quote.project as unknown as { name: string })?.name}</p>
                <p className="text-sm text-gray-400 mt-0.5">Geldig tot: {new Date(quote.valid_until).toLocaleDateString('nl-NL')}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold text-gray-900">&euro;{quote.amount.toFixed(2)}</span>
                <button onClick={() => cycleStatus(quote)} className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer ${statusColors[quote.status]}`}>
                  {statusLabels[quote.status]}
                </button>
                <button onClick={() => handleDelete(quote.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
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
