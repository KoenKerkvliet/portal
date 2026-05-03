import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { parseCsv, parseAmount, parseDate, mapHeaders } from '../../lib/csv'
import type { Expense, ExpenseAttachment } from '../../types'
import {
  Plus,
  Receipt,
  Trash2,
  Pencil,
  Loader2,
  Search,
  Filter,
  MoreVertical,
  X,
  Upload,
  Save,
  AlertCircle,
  CheckCircle2,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Download,
  Eye,
} from 'lucide-react'

// --- Helpers ---
function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function currencySymbol(cur: string): string {
  switch (cur) {
    case 'EUR': return '€'
    case 'USD': return '$'
    case 'GBP': return '£'
    default: return cur
  }
}

function formatMoney(amount: number, currency: string): string {
  return `${currencySymbol(currency)} ${Number(amount).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Title is a separate column from description because some CSV exports use "Titel"
// for the main name and "Omschrijving" for additional notes.
type CsvField = keyof ExpenseInput | 'title'

const HEADER_ALIASES: Record<CsvField, string[]> = {
  expense_date: ['datum', 'date', 'boekdatum', 'factuurdatum'],
  vendor: ['leverancier', 'vendor', 'supplier', 'crediteur', 'naam'],
  title: ['titel', 'title', 'naam transactie'],
  description: ['omschrijving', 'beschrijving', 'description', 'omschr'],
  category: ['categorie', 'category', 'rubriek'],
  amount_excl_btw: ['bedrag excl btw', 'bedrag ex btw', 'netto', 'excl btw', 'amount excl btw', 'subtotaal', 'bedrag exclusief'],
  btw_percent: ['btw%', 'btw percentage', 'vat%', 'btw tarief', 'tarief'],
  btw_amount: ['btw bedrag', 'btw', 'vat', 'vat amount'],
  amount_incl_btw: ['totaal', 'bruto', 'total', 'amount incl btw', 'bedrag incl btw', 'bedrag', 'amount'],
  invoice_number: ['factuurnummer', 'invoice number', 'factuurnr', 'nummer'],
  notes: ['notities', 'notes', 'opmerkingen', 'opmerking'],
  currency: ['valuta', 'currency', 'munteenheid'],
}

interface ExpenseInput {
  expense_date: string
  vendor: string
  description: string
  category: string
  amount_excl_btw: number
  btw_percent: number
  btw_amount: number
  amount_incl_btw: number
  invoice_number: string
  notes: string
  currency: string
}

const emptyInput = (): ExpenseInput => ({
  expense_date: todayStr(),
  vendor: '',
  description: '',
  category: '',
  amount_excl_btw: 0,
  btw_percent: 21,
  btw_amount: 0,
  amount_incl_btw: 0,
  invoice_number: '',
  notes: '',
  currency: 'EUR',
})

function normalizeCurrency(raw: string): string {
  const s = raw.trim().toUpperCase()
  if (!s) return 'EUR'
  if (s === '€' || s.startsWith('EUR')) return 'EUR'
  if (s === '$' || s.startsWith('USD')) return 'USD'
  if (s === '£' || s.startsWith('GBP')) return 'GBP'
  // Use first 3 letters as ISO code if reasonable
  if (/^[A-Z]{3}$/.test(s)) return s
  return 'EUR'
}

function rowToInput(row: string[], colMap: Record<CsvField, number | undefined>): ExpenseInput {
  const get = (k: CsvField) => {
    const idx = colMap[k]
    return idx != null ? (row[idx] ?? '') : ''
  }

  const inp = emptyInput()
  inp.expense_date = parseDate(get('expense_date'))
  inp.vendor = String(get('vendor')).trim()
  inp.category = String(get('category')).trim()
  inp.invoice_number = String(get('invoice_number')).trim()
  inp.currency = normalizeCurrency(String(get('currency')))

  // Combine title + description: title is the primary description, description column
  // (when both exist) goes into notes as additional info.
  const title = String(get('title')).trim()
  const desc = String(get('description')).trim()
  const explicitNotes = String(get('notes')).trim()

  if (title && desc) {
    inp.description = title
    inp.notes = [desc, explicitNotes].filter(Boolean).join('\n')
  } else {
    inp.description = title || desc || inp.vendor || 'Onbekend'
    inp.notes = explicitNotes
  }

  // Detect whether the CSV has any BTW info at all. If not, treat amount as final
  // (no auto-split) — common for foreign software invoices, payment receipts, etc.
  const hasBtwInfo = colMap.btw_percent != null || colMap.btw_amount != null
  inp.btw_percent = hasBtwInfo ? (parseAmount(get('btw_percent')) || 21) : 0

  const ex = parseAmount(get('amount_excl_btw'))
  const btw = parseAmount(get('btw_amount'))
  const incl = parseAmount(get('amount_incl_btw'))

  if (ex && incl) {
    inp.amount_excl_btw = ex
    inp.amount_incl_btw = incl
    inp.btw_amount = btw || Math.round((incl - ex) * 100) / 100
  } else if (ex) {
    inp.amount_excl_btw = ex
    inp.btw_amount = btw || Math.round(ex * inp.btw_percent / 100 * 100) / 100
    inp.amount_incl_btw = Math.round((ex + inp.btw_amount) * 100) / 100
  } else if (incl) {
    inp.amount_incl_btw = incl
    if (inp.btw_percent > 0) {
      inp.amount_excl_btw = Math.round(incl / (1 + inp.btw_percent / 100) * 100) / 100
      inp.btw_amount = Math.round((incl - inp.amount_excl_btw) * 100) / 100
    } else {
      inp.amount_excl_btw = incl
      inp.btw_amount = 0
    }
  } else if (btw) {
    inp.btw_amount = btw
    inp.amount_excl_btw = Math.round(btw / (inp.btw_percent / 100) * 100) / 100
    inp.amount_incl_btw = Math.round((inp.amount_excl_btw + btw) * 100) / 100
  }

  return inp
}

// --- Page ---

export default function Kosten({ highlightId }: { highlightId?: string | null } = {}) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterYear, setFilterYear] = useState<number | 'all'>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')

  // Modals
  const [editing, setEditing] = useState<Expense | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)

  // Exchange rates: { USD: 0.92, ... } — value is rate to convert FROM that currency TO EUR
  const [rates, setRates] = useState<Record<string, number>>({ EUR: 1 })
  const [rateDate, setRateDate] = useState<string | null>(null)
  const [rateError, setRateError] = useState<string | null>(null)

  const fetchExpenses = async () => {
    const [{ data, error }, { data: atts }] = await Promise.all([
      // Sortering binnen dezelfde datum:
      //   1. source_booked_at desc — kosten gekoppeld aan een banktransactie
      //      volgen exact dezelfde volgorde als de banktransactie-tab.
      //   2. created_at asc — handmatig aangemaakte kosten (zonder bron-tx)
      //      vallen onderaan terug op aanmaakvolgorde, oudste eerst.
      supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false })
        .order('source_booked_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabase.from('expense_attachments').select('expense_id'),
    ])
    if (error) console.error('Kon kosten niet laden:', error)
    setExpenses(data || [])
    const counts: Record<string, number> = {}
    for (const a of (atts as { expense_id: string }[] | null) ?? []) {
      counts[a.expense_id] = (counts[a.expense_id] ?? 0) + 1
    }
    setAttachmentCounts(counts)
    setLoading(false)
  }

  useEffect(() => {
    fetchExpenses()
  }, [])

  // Fetch ECB rates for non-EUR currencies present in the data
  useEffect(() => {
    const nonEur = [...new Set(expenses.map((e) => e.currency || 'EUR'))].filter((c) => c !== 'EUR')
    if (nonEur.length === 0) return
    const missing = nonEur.filter((c) => rates[c] == null)
    if (missing.length === 0) return

    const fetchRates = async () => {
      try {
        const res = await fetch(`https://api.frankfurter.dev/v1/latest?from=EUR&to=${missing.join(',')}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        // Frankfurter returns rates FROM EUR. We want rate FROM <currency> TO EUR, so invert.
        const newRates: Record<string, number> = {}
        for (const cur of missing) {
          const rateFromEur = data.rates?.[cur]
          if (rateFromEur) newRates[cur] = 1 / rateFromEur
        }
        setRates((prev) => ({ ...prev, ...newRates }))
        setRateDate(data.date || null)
        setRateError(null)
      } catch (err) {
        setRateError('Kon wisselkoersen niet ophalen — bedragen in andere valuta worden niet meegeteld in het EUR-totaal.')
        console.error('Wisselkoers ophalen mislukt:', err)
      }
    }
    fetchRates()
  }, [expenses, rates])

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze kostenpost wilt verwijderen?')) return
    await supabase.from('expenses').delete().eq('id', id)
    fetchExpenses()
  }

  const openNew = () => {
    setEditing(null)
    setShowForm(true)
  }

  const openEdit = (expense: Expense) => {
    setEditing(expense)
    setShowForm(true)
  }

  // Derived data
  const years = [...new Set(expenses.map((e) => new Date(e.expense_date).getFullYear()))].sort((a, b) => b - a)
  if (years.length === 0) years.push(new Date().getFullYear())

  const categories = [...new Set(expenses.map((e) => e.category).filter((c): c is string => Boolean(c)))].sort()

  const filtered = expenses.filter((e) => {
    if (filterYear !== 'all' && new Date(e.expense_date).getFullYear() !== filterYear) return false
    if (filterCategory !== 'all' && e.category !== filterCategory) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const blob = [e.vendor, e.description, e.category, e.invoice_number, e.notes].filter(Boolean).join(' ').toLowerCase()
      if (!blob.includes(q)) return false
    }
    return true
  })

  const totalsByCurrency: Record<string, number> = {}
  for (const e of filtered) {
    const cur = e.currency || 'EUR'
    totalsByCurrency[cur] = (totalsByCurrency[cur] || 0) + Number(e.amount_incl_btw)
  }
  const totalCurrencies = Object.keys(totalsByCurrency).sort((a, b) => {
    if (a === 'EUR') return -1
    if (b === 'EUR') return 1
    return a.localeCompare(b)
  })

  // Combined EUR total via current ECB rate
  let combinedEur = 0
  let hasUnconvertedAmount = false
  for (const cur of totalCurrencies) {
    if (cur === 'EUR') {
      combinedEur += totalsByCurrency[cur]
    } else if (rates[cur] != null) {
      combinedEur += totalsByCurrency[cur] * rates[cur]
    } else {
      hasUnconvertedAmount = true
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div>
      {/* Actie-knoppen (page-header zit in Financien-tab-container) */}
      <div className="flex items-center justify-end mb-4 gap-2 flex-wrap">
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-lg font-medium transition-colors"
        >
          <Upload className="w-4 h-4" />
          Importeer CSV
        </button>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nieuwe kost
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Zoeken op leverancier, omschrijving, factuurnummer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={String(filterYear)}
            onChange={(e) => setFilterYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white cursor-pointer"
          >
            <option value="all">Alle jaren</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white cursor-pointer"
          >
            <option value="all">Alle categorieen</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-gray-400">{filtered.length} van {expenses.length} kosten</span>
      </div>

      {/* Totaal — alles omgerekend naar EUR via actuele ECB-koers */}
      {totalCurrencies.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
          <div className="flex items-baseline justify-between flex-wrap gap-3">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Totaal</p>
              <p className="text-3xl font-bold text-primary mt-1">
                &euro; {combinedEur.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            {rateDate && (
              <p className="text-xs text-gray-400">
                Wisselkoers ECB d.d. {new Date(rateDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
          </div>

          {totalCurrencies.length > 1 && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {totalCurrencies.map((cur) => {
                const orig = totalsByCurrency[cur]
                const rate = rates[cur]
                return (
                  <div key={cur} className="flex items-baseline gap-2">
                    <span className="text-gray-500">{cur}</span>
                    <span className="font-medium text-gray-900">{formatMoney(orig, cur)}</span>
                    {cur !== 'EUR' && rate != null && (
                      <span className="text-xs text-gray-400">
                        &rarr; &euro; {(orig * rate).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="ml-1 text-gray-300">(koers {rate.toFixed(4)})</span>
                      </span>
                    )}
                    {cur !== 'EUR' && rate == null && !rateError && (
                      <span className="text-xs text-gray-400">
                        <Loader2 className="w-3 h-3 inline animate-spin" /> koers ophalen...
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {rateError && hasUnconvertedAmount && (
            <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {rateError}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {expenses.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nog geen kosten</h3>
          <p className="text-gray-500 mt-1">Voeg je eerste kostenpost toe of importeer een CSV-bestand.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className="px-5 py-3 text-xs font-semibold text-primary uppercase tracking-wider">Datum</th>
                  <th className="px-5 py-3 text-xs font-semibold text-primary uppercase tracking-wider">Leverancier</th>
                  <th className="px-5 py-3 text-xs font-semibold text-primary uppercase tracking-wider">Omschrijving</th>
                  <th className="px-5 py-3 text-xs font-semibold text-primary uppercase tracking-wider">Categorie</th>
                  <th className="px-5 py-3 text-xs font-semibold text-primary uppercase tracking-wider text-right">Excl. BTW</th>
                  <th className="px-5 py-3 text-xs font-semibold text-primary uppercase tracking-wider text-right">BTW</th>
                  <th className="px-5 py-3 text-xs font-semibold text-primary uppercase tracking-wider text-right">Totaal</th>
                  <th className="px-5 py-3 text-xs font-semibold text-primary uppercase tracking-wider text-right">Acties</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((expense) => (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    highlight={highlightId === expense.id}
                    attachmentCount={attachmentCounts[expense.id] ?? 0}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-gray-400">Geen kosten gevonden met de huidige filters</p>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <ExpenseFormModal
          expense={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetchExpenses() }}
        />
      )}
      {showImport && (
        <ImportCsvModal
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); fetchExpenses() }}
        />
      )}
    </div>
  )
}

// --- Row with action menu ---

function ExpenseRow({ expense, onEdit, onDelete, highlight, attachmentCount }: {
  expense: Expense
  onEdit: (e: Expense) => void
  onDelete: (id: string) => void
  highlight?: boolean
  attachmentCount?: number
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLTableRowElement>(null)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (!highlight) return
    rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 2500)
    return () => clearTimeout(t)
  }, [highlight])

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
      const menuHeight = 88
      const spaceBelow = window.innerHeight - rect.bottom
      const openUp = spaceBelow < menuHeight + 16
      setMenuPos({
        top: openUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
        left: rect.right - 140,
      })
    }
    setMenuOpen((v) => !v)
  }

  return (
    <tr
      ref={rowRef}
      className={`border-t border-gray-100 transition-colors ${flash ? 'bg-amber-100' : 'hover:bg-gray-50/50'}`}
    >
      <td className="px-5 py-3.5 text-sm text-gray-700 whitespace-nowrap">{formatDate(expense.expense_date)}</td>
      <td className="px-5 py-3.5 text-sm text-gray-700">{expense.vendor || '—'}</td>
      <td className="px-5 py-3.5 text-sm text-gray-900">
        <p className="font-medium flex items-center gap-1.5">
          {expense.description}
          {(attachmentCount ?? 0) > 0 && (
            <button
              onClick={async (e) => {
                e.stopPropagation()
                const { data: atts, error: queryErr } = await supabase
                  .from('expense_attachments')
                  .select('storage_path, filename')
                  .eq('expense_id', expense.id)
                  .order('uploaded_at', { ascending: true })
                  .limit(1)
                if (queryErr || !atts || atts.length === 0) {
                  alert('Geen bijlage gevonden')
                  return
                }
                const path = (atts[0] as { storage_path: string }).storage_path
                const { data, error: urlErr } = await supabase.storage
                  .from('expense-receipts')
                  .createSignedUrl(path, 300)
                if (urlErr || !data?.signedUrl) {
                  alert(`Kon bijlage niet openen: ${urlErr?.message ?? 'onbekende fout'}`)
                  return
                }
                window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
              }}
              title={
                (attachmentCount ?? 0) === 1
                  ? 'Bonnetje openen'
                  : `${attachmentCount} bijlagen — open de eerste (rest via Bewerken)`
              }
              className="inline-flex items-center gap-0.5 text-xs text-gray-500 bg-gray-100 hover:bg-primary/10 hover:text-primary rounded px-1.5 py-0.5 transition-colors"
            >
              <Eye className="w-3 h-3" />
              {attachmentCount}
            </button>
          )}
        </p>
        {expense.invoice_number && <p className="text-xs text-gray-400 mt-0.5">Factuur: {expense.invoice_number}</p>}
      </td>
      <td className="px-5 py-3.5 text-sm text-gray-500">
        {expense.category ? (
          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">{expense.category}</span>
        ) : '—'}
      </td>
      <td className="px-5 py-3.5 text-sm text-gray-700 text-right whitespace-nowrap">{formatMoney(Number(expense.amount_excl_btw), expense.currency || 'EUR')}</td>
      <td className="px-5 py-3.5 text-sm text-gray-500 text-right whitespace-nowrap">{formatMoney(Number(expense.btw_amount), expense.currency || 'EUR')}</td>
      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 text-right whitespace-nowrap">{formatMoney(Number(expense.amount_incl_btw), expense.currency || 'EUR')}</td>
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
              onClick={() => { setMenuOpen(false); onEdit(expense) }}
              className="flex items-center gap-2 w-full px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Bewerken
            </button>
            <button
              onClick={() => { setMenuOpen(false); onDelete(expense.id) }}
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

// --- Add/Edit form modal ---

export function ExpenseFormModal({ expense, prefill, sourceBookedAt, onClose, onSaved, submitLabel }: {
  expense: Expense | null
  prefill?: Partial<ExpenseInput>
  sourceBookedAt?: string | null
  onClose: () => void
  onSaved: (id?: string) => void
  submitLabel?: string
}) {
  const [form, setForm] = useState<ExpenseInput>(() => {
    if (expense) {
      return {
        expense_date: expense.expense_date,
        vendor: expense.vendor || '',
        description: expense.description,
        category: expense.category || '',
        amount_excl_btw: Number(expense.amount_excl_btw),
        btw_percent: Number(expense.btw_percent),
        btw_amount: Number(expense.btw_amount),
        amount_incl_btw: Number(expense.amount_incl_btw),
        invoice_number: expense.invoice_number || '',
        notes: expense.notes || '',
        currency: expense.currency || 'EUR',
      }
    }
    return { ...emptyInput(), ...(prefill ?? {}) }
  })
  const [saving, setSaving] = useState(false)
  const [categorySuggestions, setCategorySuggestions] = useState<string[]>([])
  // Bestanden die de user heeft toegevoegd vóór de kost is opgeslagen.
  // Worden pas naar storage geüpload na de insert van de kost.
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  // Bestaande categorieën ophalen voor autocomplete-suggesties.
  useEffect(() => {
    let cancelled = false
    supabase.from('expenses').select('category').not('category', 'is', null).then(({ data }) => {
      if (cancelled || !data) return
      const set = new Set<string>()
      for (const row of data as { category: string | null }[]) {
        const c = row.category?.trim()
        if (c) set.add(c)
      }
      setCategorySuggestions([...set].sort((a, b) => a.localeCompare(b, 'nl')))
    })
    return () => { cancelled = true }
  }, [])

  // Auto-recalc btw_amount + amount_incl_btw when excl/percent changes
  const updateExcl = (v: number) => {
    const btw = Math.round(v * form.btw_percent / 100 * 100) / 100
    setForm((f) => ({ ...f, amount_excl_btw: v, btw_amount: btw, amount_incl_btw: Math.round((v + btw) * 100) / 100 }))
  }
  const updatePct = (v: number) => {
    const btw = Math.round(form.amount_excl_btw * v / 100 * 100) / 100
    setForm((f) => ({ ...f, btw_percent: v, btw_amount: btw, amount_incl_btw: Math.round((f.amount_excl_btw + btw) * 100) / 100 }))
  }
  const updateIncl = (v: number) => {
    const excl = Math.round(v / (1 + form.btw_percent / 100) * 100) / 100
    const btw = Math.round((v - excl) * 100) / 100
    setForm((f) => ({ ...f, amount_incl_btw: v, amount_excl_btw: excl, btw_amount: btw }))
  }

  const handleSave = async () => {
    if (!form.description.trim()) { alert('Omschrijving is verplicht'); return }
    setSaving(true)
    const payload = {
      expense_date: form.expense_date,
      vendor: form.vendor || null,
      description: form.description,
      category: form.category || null,
      amount_excl_btw: form.amount_excl_btw,
      btw_percent: form.btw_percent,
      btw_amount: form.btw_amount,
      amount_incl_btw: form.amount_incl_btw,
      invoice_number: form.invoice_number || null,
      notes: form.notes,
      currency: form.currency,
    }
    let savedId: string | undefined
    if (expense) {
      await supabase.from('expenses').update(payload).eq('id', expense.id)
      savedId = expense.id
    } else {
      const insertPayload = { ...payload, source_booked_at: sourceBookedAt ?? null }
      const { data, error } = await supabase.from('expenses').insert(insertPayload).select('id').single()
      if (error) {
        alert(`Opslaan mislukt: ${error.message}`)
        setSaving(false)
        return
      }
      savedId = (data as { id: string }).id

      // Wachtrij-bestanden uploaden naar de zojuist aangemaakte kost
      if (pendingFiles.length > 0) {
        try {
          await uploadValidatedFilesToExpense(savedId, pendingFiles)
        } catch (uploadErr) {
          const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr)
          alert(`Kost is opgeslagen, maar uploaden van bijlages mislukte: ${msg}\n\nJe kunt de bestanden alsnog uploaden door de kost opnieuw te openen.`)
        }
      }
    }
    setSaving(false)
    onSaved(savedId)
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl my-8" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">
              {expense ? 'Kost bewerken' : 'Nieuwe kost'}
            </h2>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Datum</label>
                <input
                  type="date"
                  value={form.expense_date}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Leverancier</label>
                <input
                  type="text"
                  value={form.vendor}
                  onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                  placeholder="Bijv. KPN"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Omschrijving</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                placeholder="Wat is er gekocht?"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Categorie</label>
                <input
                  type="text"
                  list="expense-categories"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                  placeholder="Kies of typ een nieuwe…"
                />
                <datalist id="expense-categories">
                  {categorySuggestions.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Factuurnummer leverancier</label>
                <input
                  type="text"
                  value={form.invoice_number}
                  onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm font-mono"
                  placeholder="optioneel"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Valuta</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm cursor-pointer"
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Excl. BTW</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{currencySymbol(form.currency)}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={form.amount_excl_btw}
                    onChange={(e) => updateExcl(parseFloat(e.target.value) || 0)}
                    className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">BTW %</label>
                <input
                  type="number"
                  step="1"
                  value={form.btw_percent}
                  onChange={(e) => updatePct(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Incl. BTW</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{currencySymbol(form.currency)}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={form.amount_incl_btw}
                    onChange={(e) => updateIncl(parseFloat(e.target.value) || 0)}
                    className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm font-mono"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notities</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-y min-h-[60px]"
                rows={2}
                placeholder="Optionele notities..."
              />
            </div>

            {/* Bonnen / facturen */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Paperclip className="w-4 h-4 text-gray-400" />
                Bonnen of facturen
              </label>
              {expense ? (
                <AttachmentsSection expenseId={expense.id} />
              ) : (
                <PendingAttachmentsSection files={pendingFiles} onChange={setPendingFiles} />
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
              Annuleren
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving && pendingFiles.length > 0
                ? 'Opslaan & uploaden…'
                : submitLabel ?? 'Opslaan'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// --- Attachments section (gebruikt in ExpenseFormModal) ---

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
}

/** Valideer een batch File-objecten. Return errortekst of null wanneer alles OK is. */
function validateFiles(files: File[]): string | null {
  for (const file of files) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `'${file.name}' heeft een niet-ondersteund type (alleen JPG/PNG/WEBP/HEIC of PDF).`
    }
    if (file.size > MAX_FILE_BYTES) {
      return `'${file.name}' is groter dan 10 MB.`
    }
  }
  return null
}

/** Upload reeds-gevalideerde bestanden naar storage en koppel ze aan een Kost. */
async function uploadValidatedFilesToExpense(expenseId: string, files: File[]): Promise<void> {
  for (const file of files) {
    const path = `${expenseId}/${Date.now()}_${sanitizeFilename(file.name)}`
    const { error: upErr } = await supabase.storage
      .from('expense-receipts')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (upErr) throw upErr

    const { error: insErr } = await supabase.from('expense_attachments').insert({
      expense_id: expenseId,
      storage_path: path,
      filename: file.name,
      content_type: file.type,
      size_bytes: file.size,
    })
    if (insErr) {
      await supabase.storage.from('expense-receipts').remove([path])
      throw insErr
    }
  }
}

function AttachmentsSection({ expenseId }: { expenseId: string }) {
  const [items, setItems] = useState<ExpenseAttachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchAttachments = async () => {
    const { data, error: err } = await supabase
      .from('expense_attachments')
      .select('*')
      .eq('expense_id', expenseId)
      .order('uploaded_at', { ascending: false })
    if (err) {
      console.error('Bijlagen laden mislukt:', err)
      setError(err.message)
    }
    setItems((data as ExpenseAttachment[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchAttachments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId])

  const uploadFiles = async (files: FileList | File[]) => {
    setError(null)
    const arr = Array.from(files)
    if (arr.length === 0) return

    const validationError = validateFiles(arr)
    if (validationError) {
      setError(validationError)
      return
    }

    setUploading(true)
    try {
      await uploadValidatedFilesToExpense(expenseId, arr)
      await fetchAttachments()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Upload mislukt: ${msg}`)
    } finally {
      setUploading(false)
    }
  }

  const handleOpen = async (att: ExpenseAttachment) => {
    const { data, error: err } = await supabase.storage
      .from('expense-receipts')
      .createSignedUrl(att.storage_path, 300)
    if (err || !data?.signedUrl) {
      alert(`Kon bijlage niet openen: ${err?.message ?? 'onbekende fout'}`)
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const handleDelete = async (att: ExpenseAttachment) => {
    if (!confirm(`'${att.filename}' verwijderen?`)) return
    const { error: stErr } = await supabase.storage
      .from('expense-receipts')
      .remove([att.storage_path])
    if (stErr) {
      alert(`Verwijderen uit storage mislukt: ${stErr.message}`)
      return
    }
    await supabase.from('expense_attachments').delete().eq('id', att.id)
    await fetchAttachments()
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(',')}
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          className="hidden"
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploaden…
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            <Upload className="w-4 h-4 inline mr-1 -mt-0.5" />
            Sleep bestanden hierheen of klik — JPG, PNG, PDF (max 10 MB)
          </p>
        )}
      </div>

      {error && (
        <p className="text-xs text-rose-600 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </p>
      )}

      {loading ? (
        <div className="text-center py-2">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" />
        </div>
      ) : items.length > 0 ? (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {items.map((att) => {
            const isImage = att.content_type?.startsWith('image/')
            const Icon = isImage ? ImageIcon : FileText
            return (
              <li key={att.id} className="flex items-center gap-2 px-3 py-2">
                <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <button
                  onClick={() => handleOpen(att)}
                  className="flex-1 min-w-0 text-left text-sm text-primary hover:underline truncate"
                  title={att.filename}
                >
                  {att.filename}
                </button>
                {att.size_bytes && (
                  <span className="text-xs text-gray-400 whitespace-nowrap">{formatBytes(att.size_bytes)}</span>
                )}
                <button
                  onClick={() => handleOpen(att)}
                  className="p-1 text-gray-400 hover:text-primary"
                  title="Openen"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(att)}
                  className="p-1 text-gray-400 hover:text-rose-500"
                  title="Verwijderen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

/** Variant voor nog-niet-opgeslagen kosten: houdt de gekozen bestanden lokaal
 *  in component-state. ExpenseFormModal uploadt ze pas na insert van de kost. */
function PendingAttachmentsSection({
  files,
  onChange,
}: {
  files: File[]
  onChange: (files: File[]) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addFiles = (incoming: FileList | File[]) => {
    setError(null)
    const arr = Array.from(incoming)
    if (arr.length === 0) return
    const validationError = validateFiles(arr)
    if (validationError) {
      setError(validationError)
      return
    }
    onChange([...files, ...arr])
  }

  const removeAt = (idx: number) => {
    const next = [...files]
    next.splice(idx, 1)
    onChange(next)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(',')}
          onChange={(e) => e.target.files && addFiles(e.target.files)}
          className="hidden"
        />
        <p className="text-xs text-gray-500">
          <Upload className="w-4 h-4 inline mr-1 -mt-0.5" />
          Sleep bestanden hierheen of klik — JPG, PNG, PDF (max 10 MB)
        </p>
        <p className="text-[11px] text-gray-400 mt-1">
          Worden geüpload zodra je deze kost opslaat.
        </p>
      </div>

      {error && (
        <p className="text-xs text-rose-600 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </p>
      )}

      {files.length > 0 && (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {files.map((file, idx) => {
            const isImage = file.type.startsWith('image/')
            const Icon = isImage ? ImageIcon : FileText
            return (
              <li key={idx} className="flex items-center gap-2 px-3 py-2">
                <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="flex-1 min-w-0 text-sm text-gray-700 truncate" title={file.name}>
                  {file.name}
                </span>
                <span className="text-xs text-gray-400 whitespace-nowrap">{formatBytes(file.size)}</span>
                <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                  Wachtrij
                </span>
                <button
                  onClick={() => removeAt(idx)}
                  className="p-1 text-gray-400 hover:text-rose-500"
                  title="Verwijderen uit wachtrij"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// --- CSV Import modal ---

function ImportCsvModal({ onClose, onImported }: {
  onClose: () => void
  onImported: () => void
}) {
  const [stage, setStage] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload')
  const [rows, setRows] = useState<ExpenseInput[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [colMap, setColMap] = useState<Record<CsvField, number | undefined> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importedCount, setImportedCount] = useState(0)

  const handleFile = async (file: File) => {
    setError(null)
    try {
      const text = await file.text()
      const allRows = parseCsv(text)
      if (allRows.length < 2) {
        setError('CSV bestand bevat geen data of geen kolomkoppen')
        return
      }
      const hdrs = allRows[0]
      const dataRows = allRows.slice(1)
      const map = mapHeaders<CsvField>(hdrs, HEADER_ALIASES)

      if (map.expense_date == null) {
        setError(`Verplichte kolom Datum ontbreekt. Gebruik een van deze headers: ${HEADER_ALIASES.expense_date.join(' / ')}`)
        return
      }
      const hasOneAmount = map.amount_excl_btw != null || map.amount_incl_btw != null
      if (!hasOneAmount) {
        setError(`Kolom voor bedrag ontbreekt. Gebruik een van: ${HEADER_ALIASES.amount_excl_btw.join(' / ')} of ${HEADER_ALIASES.amount_incl_btw.join(' / ')}`)
        return
      }

      const parsed = dataRows.map((r) => rowToInput(r, map))
      setHeaders(hdrs)
      setColMap(map)
      setRows(parsed)
      setStage('preview')
    } catch (err) {
      setError('CSV inlezen mislukt: ' + (err instanceof Error ? err.message : 'onbekende fout'))
    }
  }

  const handleConfirmImport = async () => {
    setStage('importing')
    const payload = rows.map((r) => ({
      expense_date: r.expense_date,
      vendor: r.vendor || null,
      description: r.description,
      category: r.category || null,
      amount_excl_btw: r.amount_excl_btw,
      btw_percent: r.btw_percent,
      btw_amount: r.btw_amount,
      amount_incl_btw: r.amount_incl_btw,
      invoice_number: r.invoice_number || null,
      notes: r.notes,
      currency: r.currency,
    }))

    const { error: dbErr, count } = await supabase.from('expenses').insert(payload, { count: 'exact' })
    if (dbErr) {
      setError('Importeren mislukt: ' + dbErr.message)
      setStage('preview')
      return
    }
    setImportedCount(count || rows.length)
    setStage('done')
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={stage !== 'importing' ? onClose : undefined} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">CSV importeren</h2>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors" disabled={stage === 'importing'}>
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-6 py-5">
            {stage === 'upload' && (
              <div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 text-sm text-blue-900">
                  <p className="font-medium mb-1">Welke kolommen worden herkend?</p>
                  <ul className="text-xs text-blue-800 space-y-0.5 ml-1">
                    <li>• <strong>Datum</strong>: datum, date, boekdatum, factuurdatum</li>
                    <li>• <strong>Titel</strong>: titel, title (gebruikt als hoofdomschrijving)</li>
                    <li>• <strong>Omschrijving</strong>: omschrijving, beschrijving, description</li>
                    <li>• <strong>Leverancier</strong>: leverancier, vendor, supplier, crediteur</li>
                    <li>• <strong>Categorie</strong>: categorie, category, rubriek</li>
                    <li>• <strong>Valuta</strong>: valuta, currency, munteenheid (EUR / USD / GBP)</li>
                    <li>• <strong>Bedrag excl. BTW</strong>: bedrag excl btw, netto, subtotaal</li>
                    <li>• <strong>BTW%</strong>: btw%, btw percentage, btw tarief, tarief</li>
                    <li>• <strong>BTW bedrag</strong>: btw bedrag, btw, vat</li>
                    <li>• <strong>Totaal incl. BTW</strong>: totaal, bruto, bedrag, total</li>
                    <li>• <strong>Factuurnummer</strong>: factuurnummer, factuurnr, nummer</li>
                    <li>• <strong>Notities</strong>: notities, opmerkingen, notes</li>
                  </ul>
                  <p className="text-xs text-blue-800 mt-2">
                    Kolomkoppen zijn niet hoofdlettergevoelig. Komma- of puntkomma-gescheiden CSV werkt beide. Bedragen mogen het Nederlandse formaat zoals <code>1.234,56</code> hebben. Als er geen BTW-kolom is, wordt het bedrag opgeslagen zoals het is (BTW = 0).
                  </p>
                </div>

                <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl py-12 px-6 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors">
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="text-sm font-medium text-gray-700">Kies CSV-bestand</p>
                  <p className="text-xs text-gray-400 mt-0.5">.csv bestand uploaden</p>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleFile(f)
                    }}
                  />
                </label>

                {error && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
              </div>
            )}

            {stage === 'preview' && (
              <div>
                <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  <p className="text-sm text-green-800">
                    {rows.length} regels herkend uit {headers.length} kolommen. Controleer hieronder en klik op importeren om op te slaan.
                  </p>
                </div>

                {colMap && (
                  <details className="mb-3">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">Kolom-mapping</summary>
                    <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 space-y-0.5">
                      {Object.entries(colMap).map(([field, idx]) => (
                        <div key={field}>
                          <span className="font-medium">{field}</span>: {idx != null ? `kolom "${headers[idx]}"` : <span className="text-gray-400">— niet herkend</span>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-80">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Datum</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Leverancier</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Omschrijving</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Categorie</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Valuta</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-500">Excl.</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-500">BTW%</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-500">Totaal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 100).map((r, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-1.5 whitespace-nowrap">{r.expense_date}</td>
                          <td className="px-3 py-1.5">{r.vendor || '—'}</td>
                          <td className="px-3 py-1.5">{r.description}</td>
                          <td className="px-3 py-1.5">{r.category || '—'}</td>
                          <td className="px-3 py-1.5">{r.currency}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{r.amount_excl_btw.toFixed(2)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{r.btw_percent}%</td>
                          <td className="px-3 py-1.5 text-right font-mono">{r.amount_incl_btw.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > 100 && (
                  <p className="text-xs text-gray-400 mt-2">Eerste 100 van {rows.length} regels getoond</p>
                )}

                {error && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
              </div>
            )}

            {stage === 'importing' && (
              <div className="py-12 text-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-700">{rows.length} kosten worden geimporteerd...</p>
              </div>
            )}

            {stage === 'done' && (
              <div className="py-10 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-lg font-medium text-gray-900">{importedCount} kosten geimporteerd</p>
                <p className="text-sm text-gray-500 mt-1">Je kunt het venster sluiten.</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
            {stage === 'preview' && (
              <>
                <button onClick={() => { setStage('upload'); setRows([]); setError(null) }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                  Ander bestand
                </button>
                <button
                  onClick={handleConfirmImport}
                  className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Importeer {rows.length} kosten
                </button>
              </>
            )}
            {(stage === 'upload' || stage === 'preview') && (
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors" disabled={stage === ('importing' as typeof stage)}>
                Annuleren
              </button>
            )}
            {stage === 'done' && (
              <button onClick={onImported} className="px-5 py-2 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors">
                Klaar
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
