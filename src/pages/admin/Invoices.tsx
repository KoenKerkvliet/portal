import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Invoice, InvoiceStatus, InvoiceSettings, YearFormat } from '../../types'
import { Plus, FileText, Trash2, Clock, CheckCircle, Repeat, Loader2 } from 'lucide-react'

const statusLabels: Record<InvoiceStatus, string> = { draft: 'Concept', sent: 'Verzonden', paid: 'Betaald' }
const statusColors: Record<InvoiceStatus, string> = { draft: 'bg-gray-100 text-gray-700', sent: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700' }

function generateInvoiceNumber(
  prefix: string,
  yearFormat: YearFormat,
  startNumber: number,
  existingNumbers: string[]
): string {
  const currentYear = new Date().getFullYear()
  const yearStr = yearFormat === 'YY' ? String(currentYear).slice(-2) : String(currentYear)
  const basePrefix = `${prefix}${yearStr}`

  let maxNum = startNumber - 1
  for (const num of existingNumbers) {
    if (num.startsWith(basePrefix)) {
      const suffix = num.slice(basePrefix.length)
      const parsed = parseInt(suffix, 10)
      if (!isNaN(parsed) && parsed > maxNum) {
        maxNum = parsed
      }
    }
  }

  return `${basePrefix}${maxNum + 1}`
}

function InvoiceCard({ invoice, onStatusChange, onDelete }: {
  invoice: Invoice
  onStatusChange: (invoice: Invoice, status: InvoiceStatus) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex items-center justify-between">
      <div>
        <h3 className="font-semibold text-gray-900">{invoice.number}</h3>
        <p className="text-sm text-gray-500">
          {(invoice.client as unknown as { name: string })?.name} — {(invoice.project as unknown as { name: string })?.name}
        </p>
        <p className="text-sm text-gray-400 mt-0.5">
          Vervalt: {new Date(invoice.due_date).toLocaleDateString('nl-NL')}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-lg font-semibold text-gray-900">&euro;{invoice.amount.toFixed(2)}</span>
        <select
          value={invoice.status}
          onChange={(e) => onStatusChange(invoice, e.target.value as InvoiceStatus)}
          className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer border-0 appearance-none ${statusColors[invoice.status]}`}
        >
          <option value="draft">{statusLabels.draft}</option>
          <option value="sent">{statusLabels.sent}</option>
          <option value="paid">{statusLabels.paid}</option>
        </select>
        <button onClick={() => onDelete(invoice.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [formData, setFormData] = useState({ number: '', amount: '', client_id: '', project_id: '', due_date: '' })
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings | null>(null)

  const fetchInvoices = async () => {
    const { data } = await supabase.from('invoices').select('*, client:clients(name), project:projects(name)').order('created_at', { ascending: false })
    setInvoices(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchInvoices()
    supabase.from('clients').select('id, name').then(({ data }) => setClients(data || []))
    supabase.from('projects').select('id, name').then(({ data }) => setProjects(data || []))
    supabase.from('invoice_settings').select('*').limit(1).single().then(({ data }) => {
      if (data) setInvoiceSettings(data)
    })
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('invoices').insert({ ...formData, amount: parseFloat(formData.amount), status: 'draft' })
    setShowForm(false)
    setFormData({ number: '', amount: '', client_id: '', project_id: '', due_date: '' })
    fetchInvoices()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze factuur wilt verwijderen?')) return
    await supabase.from('invoices').delete().eq('id', id)
    fetchInvoices()
  }

  const handleStatusChange = async (invoice: Invoice, status: InvoiceStatus) => {
    await supabase.from('invoices').update({ status }).eq('id', invoice.id)
    fetchInvoices()
  }

  // Split invoices into sections
  const openInvoices = invoices.filter(i => i.status === 'sent')
  const paidInvoices = invoices.filter(i => i.status === 'paid')
  const draftInvoices = invoices.filter(i => i.status === 'draft')
  // Recurring invoices placeholder — future: filter by is_recurring flag
  const recurringInvoices: Invoice[] = []

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturen</h1>
          <p className="text-gray-500 mt-1">Beheer je facturen</p>
        </div>
        <button onClick={() => {
          if (!showForm && invoiceSettings) {
            const nextNumber = generateInvoiceNumber(
              invoiceSettings.invoice_prefix,
              invoiceSettings.year_format as YearFormat,
              invoiceSettings.start_number,
              invoices.map(i => i.number)
            )
            setFormData({ number: nextNumber, amount: '', client_id: '', project_id: '', due_date: '' })
          }
          setShowForm(!showForm)
        }} className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors">
          <Plus className="w-4 h-4" />
          Nieuwe factuur
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Factuurnummer</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Vervaldatum</label>
              <input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" required />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="bg-primary hover:bg-primary-600 text-white px-4 py-2 rounded-lg font-medium transition-colors">Aanmaken</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">Annuleren</button>
          </div>
        </form>
      )}

      {invoices.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nog geen facturen</h3>
          <p className="text-gray-500 mt-1">Maak je eerste factuur aan.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Concept facturen */}
          {draftInvoices.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900">Concept</h2>
                <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">{draftInvoices.length}</span>
              </div>
              <div className="space-y-3">
                {draftInvoices.map((invoice) => (
                  <InvoiceCard key={invoice.id} invoice={invoice} onStatusChange={handleStatusChange} onDelete={handleDelete} />
                ))}
              </div>
            </section>
          )}

          {/* Openstaande facturen */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-yellow-500" />
              <h2 className="text-lg font-semibold text-gray-900">Openstaand</h2>
              <span className="bg-yellow-100 text-yellow-700 text-xs font-medium px-2 py-0.5 rounded-full">{openInvoices.length}</span>
            </div>
            {openInvoices.length === 0 ? (
              <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
                <p className="text-sm text-gray-400">Geen openstaande facturen</p>
              </div>
            ) : (
              <div className="space-y-3">
                {openInvoices.map((invoice) => (
                  <InvoiceCard key={invoice.id} invoice={invoice} onStatusChange={handleStatusChange} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </section>

          {/* Betaalde facturen */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <h2 className="text-lg font-semibold text-gray-900">Betaald</h2>
              <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">{paidInvoices.length}</span>
            </div>
            {paidInvoices.length === 0 ? (
              <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
                <p className="text-sm text-gray-400">Nog geen betaalde facturen</p>
              </div>
            ) : (
              <div className="space-y-3">
                {paidInvoices.map((invoice) => (
                  <InvoiceCard key={invoice.id} invoice={invoice} onStatusChange={handleStatusChange} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </section>

          {/* Terugkerende facturen */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Repeat className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-900">Terugkerend</h2>
              <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">{recurringInvoices.length}</span>
            </div>
            {recurringInvoices.length === 0 ? (
              <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
                <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Repeat className="w-6 h-6 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-700 mb-1">Binnenkort beschikbaar</p>
                <p className="text-xs text-gray-400">Hier kun je straks terugkerende facturen instellen die automatisch worden aangemaakt.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recurringInvoices.map((invoice) => (
                  <InvoiceCard key={invoice.id} invoice={invoice} onStatusChange={handleStatusChange} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
