import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Invoice, InvoiceStatus } from '../../types'
import { Plus, FileText, Trash2, Clock, CheckCircle, Repeat, Loader2, Search, Filter, ArrowUpDown, MoreVertical, X, FlaskConical, Pencil, Eye } from 'lucide-react'

const statusLabels: Record<InvoiceStatus, string> = { draft: 'Concept', sent: 'Verzonden', paid: 'Betaald' }
const statusColors: Record<InvoiceStatus, string> = { draft: 'bg-gray-100 text-gray-700', sent: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700' }

function InvoiceRow({ invoice, onStatusChange, onDelete, onEdit }: {
  invoice: Invoice
  onStatusChange: (invoice: Invoice, status: InvoiceStatus) => void
  onDelete: (id: string) => void
  onEdit: (id: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; openUp: boolean }>({ top: 0, left: 0, openUp: false })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const toggleMenu = () => {
    if (!menuOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const menuHeight = 132
      const spaceBelow = window.innerHeight - rect.bottom
      const openUp = spaceBelow < menuHeight + 16
      setMenuPos({
        top: openUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
        left: rect.right - 140,
        openUp,
      })
    }
    setMenuOpen((v) => !v)
  }

  const clientName = (invoice.client as unknown as { name: string })?.name || '—'

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50/50 transition-colors">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-gray-900">{invoice.number}</span>
          {invoice.is_test && (
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-medium rounded-full">Test</span>
          )}
        </div>
      </td>
      <td className="px-5 py-3.5 text-sm text-gray-700">{clientName}</td>
      <td className="px-5 py-3.5">
        <select
          value={invoice.status}
          onChange={(e) => onStatusChange(invoice, e.target.value as InvoiceStatus)}
          className={`px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer border-0 appearance-none ${statusColors[invoice.status]}`}
        >
          <option value="draft">{statusLabels.draft}</option>
          <option value="sent">{statusLabels.sent}</option>
          <option value="paid">{statusLabels.paid}</option>
        </select>
      </td>
      <td className="px-5 py-3.5 text-sm text-gray-500">
        {new Date(invoice.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
      </td>
      <td className="px-5 py-3.5 text-sm text-gray-500">
        {new Date(invoice.due_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
      </td>
      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 text-right">
        &euro;&nbsp;{invoice.amount.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td className="px-5 py-3.5 text-right">
        <button ref={buttonRef} onClick={toggleMenu} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
          <MoreVertical className="w-4 h-4" />
        </button>
        {menuOpen && createPortal(
          <div
            ref={menuRef}
            className="fixed bg-white rounded-xl shadow-xl shadow-gray-200/50 border border-gray-100 py-1 z-[9999] min-w-[140px]"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <button
              onClick={() => { setMenuOpen(false); window.open(`/portal/factuur/${invoice.id}`, '_blank') }}
              className="flex items-center gap-2 w-full px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Eye className="w-4 h-4" />
              Bekijken
            </button>
            <button
              onClick={() => { setMenuOpen(false); onEdit(invoice.id) }}
              className="flex items-center gap-2 w-full px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Bewerken
            </button>
            <button
              onClick={() => { setMenuOpen(false); onDelete(invoice.id) }}
              className="flex items-center gap-2 w-full px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Verwijderen
            </button>
          </div>,
          document.body
        )}
      </td>
    </tr>
  )
}

function InvoiceTable({ invoices, onStatusChange, onDelete, onEdit, dateLabel }: {
  invoices: Invoice[]
  onStatusChange: (invoice: Invoice, status: InvoiceStatus) => void
  onDelete: (id: string) => void
  onEdit: (id: string) => void
  dateLabel: 'due' | 'paid'
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-left">
            <th className="px-5 py-3 text-xs font-semibold text-primary uppercase tracking-wider">Factuurnummer</th>
            <th className="px-5 py-3 text-xs font-semibold text-primary uppercase tracking-wider">Klant</th>
            <th className="px-5 py-3 text-xs font-semibold text-primary uppercase tracking-wider">Status</th>
            <th className="px-5 py-3 text-xs font-semibold text-primary uppercase tracking-wider">Aangemaakt</th>
            <th className="px-5 py-3 text-xs font-semibold text-primary uppercase tracking-wider">{dateLabel === 'paid' ? 'Betaald op' : 'Vervaldatum'}</th>
            <th className="px-5 py-3 text-xs font-semibold text-primary uppercase tracking-wider text-right">Totaal</th>
            <th className="px-5 py-3 text-xs font-semibold text-primary uppercase tracking-wider text-right">Acties</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <InvoiceRow key={invoice.id} invoice={invoice} onStatusChange={onStatusChange} onDelete={onDelete} onEdit={onEdit} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Invoices() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [isTest, setIsTest] = useState(false)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | 'all'>('all')
  const [filterProject, setFilterProject] = useState('all')
  const [sortField, setSortField] = useState<'date' | 'amount'>('date')
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc')
  const [paidYear, setPaidYear] = useState(new Date().getFullYear())

  const fetchInvoices = async () => {
    const { data } = await supabase.from('invoices').select('*, client:clients(name), project:projects(name)').order('created_at', { ascending: false })
    setInvoices(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchInvoices()
    supabase.from('projects').select('id, name').then(({ data }) => setProjects(data || []))
  }, [])

  const handleCreate = () => {
    const params = isTest ? '?test=1' : ''
    setShowNewModal(false)
    setIsTest(false)
    navigate(`/admin/facturen/nieuw${params}`)
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

  const handleEdit = (id: string) => {
    navigate(`/admin/facturen/${id}`)
  }

  // Apply filters
  const filtered = invoices.filter((i) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const clientName = ((i.client as unknown as { name: string })?.name || '').toLowerCase()
      const projectName = ((i.project as unknown as { name: string })?.name || '').toLowerCase()
      if (!i.number.toLowerCase().includes(q) && !clientName.includes(q) && !projectName.includes(q)) return false
    }
    if (filterStatus !== 'all' && i.status !== filterStatus) return false
    if (filterProject !== 'all' && i.project_id !== filterProject) return false
    return true
  })

  // Sort
  const sortInvoices = (list: Invoice[]) => {
    return [...list].sort((a, b) => {
      let cmp = 0
      if (sortField === 'date') {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      } else {
        cmp = a.amount - b.amount
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
  }

  // Split into sections
  const openInvoices = sortInvoices(filtered.filter(i => i.status === 'draft' || i.status === 'sent'))
  const allPaidInvoices = filtered.filter(i => i.status === 'paid')
  const paidInvoicesFiltered = sortInvoices(allPaidInvoices.filter(i => new Date(i.created_at).getFullYear() === paidYear))
  const recurringInvoices: Invoice[] = []

  // Get unique years from paid invoices
  const paidYears = [...new Set(allPaidInvoices.map(i => new Date(i.created_at).getFullYear()))].sort((a, b) => b - a)
  if (paidYears.length === 0) paidYears.push(new Date().getFullYear())

  const totalFiltered = filtered.length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturen</h1>
          <p className="text-gray-500 mt-1">Beheer je facturen</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nieuwe factuur
        </button>
      </div>

      {/* New invoice modal */}
      {showNewModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setShowNewModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Nieuwe factuur</h2>
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
                    <span className="text-sm font-medium text-amber-800">Testfactuur</span>
                  </div>
                  <p className="text-xs text-amber-600 mt-0.5">De factuurnummerreeks wordt niet verstoord.</p>
                </div>
              </label>

              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleCreate}
                  className="flex-1 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors"
                >
                  Factuur aanmaken
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

      {/* Filter bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Zoeken op factuurnummer, domein of e-mail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as InvoiceStatus | 'all')}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white cursor-pointer"
          >
            <option value="all">Alle statussen</option>
            <option value="draft">Concept</option>
            <option value="sent">Verzonden</option>
            <option value="paid">Betaald</option>
          </select>
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white cursor-pointer"
          >
            <option value="all">Alle domeinen</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-gray-400" />
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as 'date' | 'amount')}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white cursor-pointer"
          >
            <option value="date">Datum</option>
            <option value="amount">Bedrag</option>
          </select>
          <button
            onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1"
          >
            {sortDirection === 'desc' ? '↓ Aflopend' : '↑ Oplopend'}
          </button>
        </div>
        <span className="text-xs text-gray-400">{totalFiltered} van {invoices.length} facturen</span>
      </div>

      {invoices.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nog geen facturen</h3>
          <p className="text-gray-500 mt-1">Maak je eerste factuur aan.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Openstaande facturen (draft + sent) */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-500" />
              <h2 className="text-lg font-semibold text-gray-900">Openstaande facturen</h2>
              <span className="bg-yellow-100 text-yellow-700 text-xs font-medium px-2.5 py-0.5 rounded-full">{openInvoices.length}</span>
            </div>
            {openInvoices.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-gray-400">Geen openstaande facturen</p>
              </div>
            ) : (
              <InvoiceTable invoices={openInvoices} onStatusChange={handleStatusChange} onDelete={handleDelete} onEdit={handleEdit} dateLabel="due" />
            )}
          </section>

          {/* Betaalde facturen */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <h2 className="text-lg font-semibold text-gray-900">Betaalde facturen</h2>
                <span className="bg-green-100 text-green-700 text-xs font-medium px-2.5 py-0.5 rounded-full">{paidInvoicesFiltered.length}</span>
              </div>
              <select
                value={paidYear}
                onChange={(e) => setPaidYear(Number(e.target.value))}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white cursor-pointer"
              >
                {paidYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {paidInvoicesFiltered.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-gray-400">Geen betaalde facturen in {paidYear}</p>
              </div>
            ) : (
              <InvoiceTable invoices={paidInvoicesFiltered} onStatusChange={handleStatusChange} onDelete={handleDelete} onEdit={handleEdit} dateLabel="paid" />
            )}
          </section>

          {/* Terugkerende facturen */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Repeat className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-900">Terugkerende facturen</h2>
              <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2.5 py-0.5 rounded-full">{recurringInvoices.length}</span>
            </div>
            <div className="px-5 py-8 text-center">
              <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Repeat className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">Binnenkort beschikbaar</p>
              <p className="text-xs text-gray-400">Hier kun je straks terugkerende facturen instellen die automatisch worden aangemaakt.</p>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
