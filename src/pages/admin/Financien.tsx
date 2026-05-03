import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import JSZip from 'jszip'
import { supabase } from '../../lib/supabase'
import type { BankTransaction, Expense, ExpenseAttachment, Invoice, TransactionCategory } from '../../types'
import Kosten, { ExpenseFormModal } from './Kosten'
import {
  generateTransactionsCsv,
  generateExpensesCsv,
  generateSummaryText,
  generatePdfReport,
  buildAttachmentFilename,
} from '../../lib/financialExport'
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  AlertCircle,
  Search,
  Link as LinkIcon,
  Loader2,
  CheckCircle2,
  Receipt,
  Landmark,
  FileText,
  X,
  Unlink,
  ExternalLink,
  User,
  Inbox,
  Plus,
  Download,
  FileArchive,
  RotateCcw,
  TrendingUp,
  BarChart3,
} from 'lucide-react'

const PRIVATE_CATEGORY_LABELS: Record<TransactionCategory, string> = {
  private_deposit: 'Privé · inleg',
  private_withdrawal: 'Privé · opname',
  private_purchase: 'Privé · aankoop',
}

const PRIVATE_CATEGORY_DESCRIPTIONS: Record<TransactionCategory, string> = {
  private_deposit: 'Je hebt eigen geld op de zakelijke rekening gestort.',
  private_withdrawal: 'Je hebt geld voor jezelf van de zakelijke rekening gehaald.',
  private_purchase: 'Een persoonlijke aankoop met de zakelijke pas.',
}

type TabKey = 'bank' | 'income' | 'kosten' | 'balans'

function formatMoney(amount: number, currency = 'EUR'): string {
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency
  return `${symbol} ${Math.abs(amount).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatRelativeTime(d: string): string {
  const diffMs = Date.now() - new Date(d).getTime()
  const min = Math.round(diffMs / 60_000)
  if (min < 1) return 'zojuist'
  if (min < 60) return `${min} min geleden`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} u geleden`
  const days = Math.round(hr / 24)
  if (days < 7) return `${days} d geleden`
  return formatDate(d)
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
}

export default function Financien() {
  const navigate = useNavigate()
  const now = new Date()
  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const saved = (typeof window !== 'undefined' && window.sessionStorage.getItem('financien_tab')) as TabKey | null
    if (saved === 'kosten' || saved === 'income' || saved === 'balans') return saved
    return 'bank'
  })
  useEffect(() => {
    window.sessionStorage.setItem('financien_tab', activeTab)
  }, [activeTab])

  const [filterYear, setFilterYear] = useState<number | 'all'>(now.getFullYear())
  const [filterMonth, setFilterMonth] = useState<number | 'all'>(now.getMonth() + 1)
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Koppel-modal en cross-tab highlight
  const [linkingTx, setLinkingTx] = useState<BankTransaction | null>(null)
  const [creatingExpenseFor, setCreatingExpenseFor] = useState<BankTransaction | null>(null)
  const [highlightExpenseId, setHighlightExpenseId] = useState<string | null>(null)
  const [showUnprocessedOnly, setShowUnprocessedOnly] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const fetchData = async () => {
    const [txRes, stateRes, invRes, expRes] = await Promise.all([
      supabase.from('bank_transactions').select('*').order('booked_at', { ascending: false }),
      supabase.from('bunq_state').select('last_sync_at, session_token').eq('id', 1).maybeSingle(),
      supabase.from('invoices').select('*').order('invoice_date', { ascending: false, nullsFirst: false }),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
    ])
    if (txRes.error) console.error('Kon transacties niet laden:', txRes.error)
    setTransactions((txRes.data as BankTransaction[] | null) ?? [])
    setInvoices((invRes.data as Invoice[] | null) ?? [])
    setExpenses((expRes.data as Expense[] | null) ?? [])
    setLastSyncAt(stateRes.data?.last_sync_at ?? null)
    setIsConnected(Boolean(stateRes.data?.session_token))
    setLoading(false)
  }

  const invoiceById = useMemo(() => {
    const m = new Map<string, Invoice>()
    for (const i of invoices) m.set(i.id, i)
    return m
  }, [invoices])
  const expenseById = useMemo(() => {
    const m = new Map<string, Expense>()
    for (const e of expenses) m.set(e.id, e)
    return m
  }, [expenses])

  const handleOpenInvoice = (invoiceId: string) => {
    navigate(`/admin/facturen/${invoiceId}`)
  }
  const handleOpenExpense = (expenseId: string) => {
    setActiveTab('kosten')
    setHighlightExpenseId(expenseId)
    setTimeout(() => setHighlightExpenseId(null), 3000)
  }

  const handleLink = async (
    tx: BankTransaction,
    target: { kind: 'invoice'; id: string } | { kind: 'expense'; id: string } | { kind: 'category'; category: TransactionCategory },
  ) => {
    let update: { invoice_id: string | null; expense_id: string | null; category: TransactionCategory | null }
    if (target.kind === 'invoice') {
      update = { invoice_id: target.id, expense_id: null, category: null }
    } else if (target.kind === 'expense') {
      update = { invoice_id: null, expense_id: target.id, category: null }
    } else {
      update = { invoice_id: null, expense_id: null, category: target.category }
    }
    const { error } = await supabase.from('bank_transactions').update(update).eq('id', tx.id)
    if (error) {
      alert(`Verwerken mislukt: ${error.message}`)
      return
    }
    setLinkingTx(null)
    await fetchData()
  }

  const handleUnlink = async (tx: BankTransaction) => {
    const { error } = await supabase
      .from('bank_transactions')
      .update({ invoice_id: null, expense_id: null, category: null })
      .eq('id', tx.id)
    if (error) {
      alert(`Ontkoppelen mislukt: ${error.message}`)
      return
    }
    await fetchData()
  }

  // Nieuwe kost direct vanuit een banktransactie aanmaken (Patroon C):
  // ExpenseFormModal opent met velden vooringevuld. Bij save wordt de
  // nieuwe expense.id automatisch aan de transactie gekoppeld.
  const handleStartCreateExpense = (tx: BankTransaction) => {
    setLinkingTx(null)
    setCreatingExpenseFor(tx)
  }

  const handleNewExpenseSaved = async (expenseId?: string) => {
    if (creatingExpenseFor && expenseId) {
      const { error } = await supabase
        .from('bank_transactions')
        .update({ expense_id: expenseId, invoice_id: null, category: null })
        .eq('id', creatingExpenseFor.id)
      if (error) {
        alert(`Kost is opgeslagen, maar koppelen aan transactie mislukt: ${error.message}`)
      }
    }
    setCreatingExpenseFor(null)
    await fetchData()
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const { data, error } = await supabase.functions.invoke('bunq-sync', { body: {} })
      if (error) throw error
      if (data?.success === false) throw new Error(data.error || 'Sync mislukt')
      setSyncMessage({ type: 'success', text: `Sync gelukt — ${data.inserted ?? 0} transacties verwerkt` })
      await fetchData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setSyncMessage({ type: 'error', text: msg })
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMessage(null), 6000)
    }
  }

  const isUnprocessed = (t: BankTransaction) =>
    !t.invoice_id && !t.expense_id && !t.category

  // Een refund: positieve banktransactie gekoppeld aan een Kost. Telt niet als
  // omzet, maar als correctie op de oorspronkelijke uitgave.
  const isRefund = (t: BankTransaction) =>
    Number(t.amount) > 0 && t.expense_id != null

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const d = new Date(t.booked_at)
      if (filterYear !== 'all' && d.getFullYear() !== filterYear) return false
      if (filterMonth !== 'all' && d.getMonth() + 1 !== filterMonth) return false
      if (filterType === 'income' && t.amount < 0) return false
      if (filterType === 'expense' && t.amount >= 0) return false
      if (showUnprocessedOnly && !isUnprocessed(t)) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const blob = [t.description, t.counterparty_name, t.counterparty_iban].filter(Boolean).join(' ').toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [transactions, filterYear, filterMonth, filterType, showUnprocessedOnly, searchQuery])

  // Stat-cards berekenen ZONDER privé-transacties — anders vertekenen die de zakelijke totalen.
  const businessFiltered = useMemo(
    () => filtered.filter((t) => !t.category),
    [filtered],
  )

  // Ongekoppelde transacties wereldwijd (niet alleen in zicht) voor de banner.
  const unprocessedSummary = useMemo(() => {
    const items = transactions.filter(isUnprocessed)
    const total = items.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)
    return { count: items.length, total }
  }, [transactions])

  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    for (const t of businessFiltered) {
      const amt = Number(t.amount)
      if (isRefund(t)) {
        // Refund: trek af van uitgaven (geen omzet)
        expense -= amt
      } else if (amt >= 0) {
        income += amt
      } else {
        expense += Math.abs(amt)
      }
    }
    return { income, expense, balance: income - expense }
  }, [businessFiltered])

  const years = useMemo(() => {
    const set = new Set<number>([now.getFullYear()])
    for (const t of transactions) set.add(new Date(t.booked_at).getFullYear())
    return [...set].sort((a, b) => b - a)
  }, [transactions])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  const tabSubtitle =
    activeTab === 'bank' ? 'Inkomsten en uitgaven via Bunq'
    : activeTab === 'income' ? 'Overzicht van al je facturen'
    : activeTab === 'kosten' ? 'Beheer je uitgaven en kostenposten'
    : 'Inkomsten afgezet tegen uitgaven'

  const periodLabel = (() => {
    if (filterMonth === 'all' && filterYear === 'all') return 'Alle perioden'
    if (filterMonth === 'all') return `Heel ${filterYear}`
    const monthName = new Date(2000, (filterMonth as number) - 1, 1).toLocaleDateString('nl-NL', { month: 'long' })
    if (filterYear === 'all') return `${monthName} (alle jaren)`
    return monthLabel(filterYear, filterMonth as number)
  })()

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header — gedeeld tussen beide tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" />
            Financiën
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {tabSubtitle}
            {activeTab === 'bank' && lastSyncAt && (
              <span className="ml-2 text-gray-400">· laatst gesynchroniseerd {formatRelativeTime(lastSyncAt)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExportOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            title="Exporteer een periode als ZIP"
          >
            <Download className="w-4 h-4" />
            Exporteren
          </button>
          {activeTab === 'bank' && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {syncing ? 'Synchroniseren…' : 'Verversen'}
            </button>
          )}
        </div>
      </div>

      {/* Tab-strip */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1 overflow-x-auto">
          {([
            { key: 'bank', label: 'Banktransacties', icon: Landmark },
            { key: 'income', label: 'Inkomsten', icon: TrendingUp },
            { key: 'kosten', label: 'Kosten', icon: Receipt },
            { key: 'balans', label: 'Balans', icon: BarChart3 },
          ] as const).map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 -mb-px text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {activeTab === 'kosten' ? (
        <Kosten highlightId={highlightExpenseId} />
      ) : activeTab === 'income' ? (
        <IncomeTab invoices={invoices} />
      ) : activeTab === 'balans' ? (
        <BalansTab transactions={transactions} />
      ) : (
        <>
      {/* Sync feedback */}
      {syncMessage && (
        <div className={`mb-4 rounded-xl border p-4 flex gap-3 ${syncMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
          {syncMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          )}
          <p className={`text-sm ${syncMessage.type === 'success' ? 'text-emerald-900' : 'text-rose-900'}`}>
            {syncMessage.text}
          </p>
        </div>
      )}

      {/* Setup notice — alleen als er nog nooit gesynchroniseerd is */}
      {!isConnected && !lastSyncAt && transactions.length === 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-900">Bunq nog niet gekoppeld</p>
            <p className="text-amber-800 mt-1">
              Klik op <strong>Verversen</strong> om de eerste synchronisatie te starten.
              Daarna worden transacties elk uur automatisch opgehaald (mits de cron is geactiveerd).
            </p>
          </div>
        </div>
      )}

      {/* Ongekoppeld-banner */}
      {unprocessedSummary.count > 0 && !showUnprocessedOnly && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center gap-3">
          <Inbox className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div className="text-sm flex-1">
            <p className="font-medium text-blue-900">
              {unprocessedSummary.count} {unprocessedSummary.count === 1 ? 'transactie' : 'transacties'} nog te verwerken
            </p>
            <p className="text-blue-800 mt-0.5">
              Totaal {formatMoney(unprocessedSummary.total)} aan transacties zonder factuur, kost of privé-markering.
            </p>
          </div>
          <button
            onClick={() => setShowUnprocessedOnly(true)}
            className="text-sm font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
          >
            Bekijk →
          </button>
        </div>
      )}

      {/* Filter-modus chip */}
      {showUnprocessedOnly && (
        <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100 text-blue-900 text-sm">
          <Inbox className="w-4 h-4" />
          <span>Alleen ongekoppelde transacties</span>
          <button
            onClick={() => setShowUnprocessedOnly(false)}
            className="text-blue-700 hover:text-blue-900 -mr-1 p-0.5"
            title="Filter verwijderen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
            Inkomsten
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">
            {formatMoney(totals.income)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {periodLabel}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <ArrowUpRight className="w-4 h-4 text-rose-600" />
            Uitgaven
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-600">
            {formatMoney(totals.expense)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {periodLabel}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Wallet className="w-4 h-4 text-gray-700" />
            Saldo
          </div>
          <div className={`mt-2 text-2xl font-bold ${totals.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {totals.balance < 0 ? '−' : ''}{formatMoney(totals.balance)}
          </div>
          <div className="text-xs text-gray-400 mt-1">Inkomsten − Uitgaven</div>
        </div>
      </div>

      <p className="text-xs text-gray-400 -mt-3 mb-6">
        Privé-transacties (inleg, opname, persoonlijke aankopen) tellen niet mee in deze totalen.
      </p>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Jaar</label>
            <select
              value={String(filterYear)}
              onChange={(e) => setFilterYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">Alle jaren</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Maand</label>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">Heel jaar</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1, 1).toLocaleDateString('nl-NL', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <div className="inline-flex w-full rounded-lg border border-gray-300 overflow-hidden">
              {([
                { key: 'all' as const, label: 'Alles' },
                { key: 'income' as const, label: 'Inkomsten' },
                { key: 'expense' as const, label: 'Uitgaven' },
              ]).map((opt, i) => {
                const isActive = filterType === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setFilterType(opt.key)}
                    className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
                      i > 0 ? 'border-l border-gray-300' : ''
                    } ${
                      isActive
                        ? opt.key === 'income'
                          ? 'bg-emerald-50 text-emerald-700'
                          : opt.key === 'expense'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-gray-100 text-gray-900'
                        : 'bg-white text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Zoeken</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Omschrijving, tegenpartij of IBAN…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Transacties */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Wallet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              {transactions.length === 0
                ? 'Nog geen transacties — klik op Verversen om te synchroniseren met Bunq.'
                : 'Geen transacties gevonden voor de gekozen periode.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Datum</th>
                  <th className="px-4 py-3 font-medium">Tegenpartij</th>
                  <th className="px-4 py-3 font-medium">Omschrijving</th>
                  <th className="px-4 py-3 font-medium text-right">Bedrag</th>
                  <th className="px-4 py-3 font-medium">Koppeling</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((t) => {
                  const linkedInvoice = t.invoice_id ? invoiceById.get(t.invoice_id) : null
                  const linkedExpense = t.expense_id ? expenseById.get(t.expense_id) : null
                  const refund = isRefund(t)
                  return (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(t.booked_at)}</td>
                      <td className="px-4 py-3 text-gray-900">
                        {t.counterparty_name || '—'}
                        {t.counterparty_iban && (
                          <span className="block text-xs text-gray-400 font-mono">{t.counterparty_iban}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{t.description}</td>
                      <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${t.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {t.amount >= 0 ? '+' : '−'} {formatMoney(t.amount, t.currency)}
                      </td>
                      <td className="px-4 py-3">
                        {linkedInvoice ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleOpenInvoice(linkedInvoice.id)}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              title="Open factuur"
                            >
                              <FileText className="w-3 h-3" />
                              {linkedInvoice.number || 'Factuur'}
                              <ExternalLink className="w-3 h-3 opacity-60" />
                            </button>
                            <button
                              onClick={() => handleUnlink(t)}
                              className="text-gray-300 hover:text-rose-500 p-0.5"
                              title="Ontkoppelen"
                            >
                              <Unlink className="w-3 h-3" />
                            </button>
                          </div>
                        ) : linkedExpense ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleOpenExpense(linkedExpense.id)}
                              className={`inline-flex items-center gap-1 text-xs hover:underline ${
                                refund ? 'text-amber-600' : 'text-primary'
                              }`}
                              title={refund ? 'Open kost (refund)' : 'Open kost'}
                            >
                              {refund ? <RotateCcw className="w-3 h-3" /> : <Receipt className="w-3 h-3" />}
                              {refund ? 'Refund: ' : ''}{linkedExpense.vendor || linkedExpense.description.slice(0, 30) || 'Kost'}
                              <ExternalLink className="w-3 h-3 opacity-60" />
                            </button>
                            <button
                              onClick={() => handleUnlink(t)}
                              className="text-gray-300 hover:text-rose-500 p-0.5"
                              title="Ontkoppelen"
                            >
                              <Unlink className="w-3 h-3" />
                            </button>
                          </div>
                        ) : t.category ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span
                              className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 rounded px-2 py-0.5"
                              title={PRIVATE_CATEGORY_DESCRIPTIONS[t.category]}
                            >
                              <User className="w-3 h-3" />
                              {PRIVATE_CATEGORY_LABELS[t.category]}
                            </span>
                            <button
                              onClick={() => handleUnlink(t)}
                              className="text-gray-300 hover:text-rose-500 p-0.5"
                              title="Markering verwijderen"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setLinkingTx(t)}
                            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary border border-gray-200 hover:border-primary/40 rounded px-2 py-1 transition-colors"
                          >
                            <LinkIcon className="w-3 h-3" />
                            Verwerken
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}

      {linkingTx && (
        <LinkModal
          tx={linkingTx}
          invoices={invoices}
          expenses={expenses}
          onClose={() => setLinkingTx(null)}
          onSelect={(target) => handleLink(linkingTx, target)}
          onCreateNewExpense={() => handleStartCreateExpense(linkingTx)}
        />
      )}

      {creatingExpenseFor && (
        <ExpenseFormModal
          expense={null}
          prefill={{
            expense_date: creatingExpenseFor.booked_at.slice(0, 10),
            vendor: creatingExpenseFor.counterparty_name ?? '',
            description: creatingExpenseFor.description || creatingExpenseFor.counterparty_name || '',
            amount_excl_btw: Math.abs(Number(creatingExpenseFor.amount)),
            btw_percent: 0,
            btw_amount: 0,
            amount_incl_btw: Math.abs(Number(creatingExpenseFor.amount)),
            currency: creatingExpenseFor.currency || 'EUR',
          }}
          sourceBookedAt={creatingExpenseFor.booked_at}
          onClose={() => setCreatingExpenseFor(null)}
          onSaved={handleNewExpenseSaved}
          submitLabel="Opslaan en koppelen"
        />
      )}

      {exportOpen && (
        <ExportModal
          transactions={transactions}
          invoiceById={invoiceById}
          expenseById={expenseById}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  )
}

// ---- Koppel-modal ----------------------------------------------------------

function LinkModal({
  tx,
  invoices,
  expenses,
  onClose,
  onSelect,
  onCreateNewExpense,
}: {
  tx: BankTransaction
  invoices: Invoice[]
  expenses: Expense[]
  onClose: () => void
  onSelect: (target: { kind: 'invoice'; id: string } | { kind: 'expense'; id: string } | { kind: 'category'; category: TransactionCategory }) => void
  onCreateNewExpense: () => void
}) {
  const isIncoming = tx.amount >= 0
  const [tab, setTab] = useState<'invoice' | 'expense' | 'private'>(isIncoming ? 'invoice' : 'expense')
  const [q, setQ] = useState('')

  const txAmount = Math.abs(Number(tx.amount))

  const matchAmount = (a: number) => Math.abs(a - txAmount) <= 0.005

  const invoiceItems = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const list = invoices.filter((inv) => {
      if (!ql) return true
      const blob = [inv.number, inv.client_name, String(inv.amount)].filter(Boolean).join(' ').toLowerCase()
      return blob.includes(ql)
    })
    // Sorteer matches op bedrag bovenaan
    return list.sort((a, b) => {
      const ma = matchAmount(Number(a.amount)) ? 1 : 0
      const mb = matchAmount(Number(b.amount)) ? 1 : 0
      if (ma !== mb) return mb - ma
      return (b.invoice_date || '').localeCompare(a.invoice_date || '')
    })
  }, [invoices, q, txAmount])

  const expenseItems = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const list = expenses.filter((ex) => {
      if (!ql) return true
      const blob = [ex.vendor, ex.description, ex.invoice_number, ex.category, String(ex.amount_incl_btw)]
        .filter(Boolean).join(' ').toLowerCase()
      return blob.includes(ql)
    })
    return list.sort((a, b) => {
      const ma = matchAmount(Number(a.amount_incl_btw)) ? 1 : 0
      const mb = matchAmount(Number(b.amount_incl_btw)) ? 1 : 0
      if (ma !== mb) return mb - ma
      return b.expense_date.localeCompare(a.expense_date)
    })
  }, [expenses, q, txAmount])

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Transactie verwerken</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {formatDate(tx.booked_at)} · {tx.counterparty_name || '—'} ·{' '}
              <span className={tx.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                {tx.amount >= 0 ? '+' : '−'} {formatMoney(tx.amount, tx.currency)}
              </span>
            </p>
            {tx.description && (
              <p className="text-xs text-gray-400 mt-0.5 truncate max-w-md">{tx.description}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-100 px-6">
          <div className="flex gap-1">
            {([
              { key: 'invoice' as const, label: 'Facturen', icon: FileText, count: `(${invoices.length})` },
              { key: 'expense' as const, label: 'Kosten', icon: Receipt, count: `(${expenses.length})` },
              { key: 'private' as const, label: 'Privé', icon: User, count: '' },
            ]).map((t) => {
              const isActive = tab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-3 py-2 -mb-px text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                  {t.count && <span className="text-xs text-gray-400">{t.count}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Search — alleen voor invoice/expense tabs */}
        {tab !== 'private' && (
          <div className="px-6 py-3 border-b border-gray-100">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={tab === 'invoice'
                  ? 'Zoek op factuurnummer, klant of bedrag…'
                  : 'Zoek op leverancier, omschrijving of bedrag…'}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Tip: items met <strong>exact dezelfde bedrag</strong> als deze transactie staan bovenaan.
            </p>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'private' ? (
            <ul className="divide-y divide-gray-100">
              {(['private_deposit', 'private_withdrawal', 'private_purchase'] as TransactionCategory[]).map((cat) => (
                <li key={cat}>
                  <button
                    onClick={() => onSelect({ kind: 'category', category: cat })}
                    className="w-full text-left px-6 py-4 hover:bg-gray-50 flex items-start gap-3"
                  >
                    <User className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{PRIVATE_CATEGORY_LABELS[cat]}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{PRIVATE_CATEGORY_DESCRIPTIONS[cat]}</p>
                    </div>
                  </button>
                </li>
              ))}
              <li className="px-6 py-3 bg-gray-50 text-xs text-gray-500 leading-relaxed">
                Privé-gemarkeerde transacties tellen <strong>niet</strong> mee in je inkomsten- of uitgaventotaal.
                Ze blijven wel zichtbaar in de transactielijst — gemarkeerd met een grijs label.
              </li>
            </ul>
          ) : tab === 'invoice' ? (
            invoiceItems.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-12">Geen facturen gevonden.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {invoiceItems.map((inv) => {
                  const exact = matchAmount(Number(inv.amount))
                  return (
                    <li key={inv.id}>
                      <button
                        onClick={() => onSelect({ kind: 'invoice', id: inv.id })}
                        className="w-full text-left px-6 py-3 hover:bg-gray-50 flex items-center gap-3"
                      >
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {inv.number || '(zonder nummer)'}
                            </span>
                            {exact && (
                              <span className="text-[10px] uppercase tracking-wide bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                                Match
                              </span>
                            )}
                            <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                              inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700'
                                : inv.status === 'sent' ? 'bg-amber-50 text-amber-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {inv.status}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 truncate">
                            {inv.client_name || '—'}
                            {inv.invoice_date && <> · {formatDate(inv.invoice_date)}</>}
                          </p>
                        </div>
                        <div className="text-sm font-medium text-gray-700 whitespace-nowrap">
                          {formatMoney(Number(inv.amount))}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )
          ) : (
            <>
              {/* Refund-hint: positieve transactie aan een bestaande kost koppelen = refund */}
              {tx.amount > 0 && (
                <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-100 flex items-start gap-2">
                  <RotateCcw className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Deze transactie is een <strong>inkomend</strong> bedrag — als je 'm aan een bestaande kost koppelt,
                    wordt het automatisch verwerkt als <strong>refund</strong>: het bedrag wordt afgetrokken van je
                    uitgaven en telt niet mee als omzet.
                  </p>
                </div>
              )}

              {/* Knop om direct vanuit deze transactie een nieuwe kost te maken */}
              <button
                onClick={onCreateNewExpense}
                className="w-full text-left px-6 py-3 hover:bg-primary/5 flex items-center gap-3 border-b border-gray-100 group"
              >
                <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20">
                  <Plus className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">Maak nieuwe kost van deze transactie</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Datum, bedrag en tegenpartij worden vooringevuld. Daarna kun je een bonnetje uploaden.
                  </p>
                </div>
              </button>

              {expenseItems.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-12">Of zoek tussen bestaande kosten — geen kosten gevonden.</p>
              ) : (
              <ul className="divide-y divide-gray-100">
                {expenseItems.map((ex) => {
                  const exact = matchAmount(Number(ex.amount_incl_btw))
                  return (
                    <li key={ex.id}>
                      <button
                        onClick={() => onSelect({ kind: 'expense', id: ex.id })}
                        className="w-full text-left px-6 py-3 hover:bg-gray-50 flex items-center gap-3"
                      >
                        <Receipt className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {ex.vendor || ex.description}
                            </span>
                            {exact && (
                              <span className="text-[10px] uppercase tracking-wide bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                                Match
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 truncate">
                            {ex.description}
                            {ex.expense_date && <> · {formatDate(ex.expense_date)}</>}
                          </p>
                        </div>
                        <div className="text-sm font-medium text-gray-700 whitespace-nowrap">
                          {formatMoney(Number(ex.amount_incl_btw), ex.currency)}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ---- Export-modal --------------------------------------------------------

function ExportModal({
  transactions,
  invoiceById,
  expenseById,
  onClose,
}: {
  transactions: BankTransaction[]
  invoiceById: Map<string, Invoice>
  expenseById: Map<string, Expense>
  onClose: () => void
}) {
  const now = new Date()
  const yearStart = `${now.getFullYear()}-01-01`
  const today = now.toISOString().slice(0, 10)

  const [dateFrom, setDateFrom] = useState(yearStart)
  const [dateTo, setDateTo] = useState(today)
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [includeTransactions, setIncludeTransactions] = useState(true)
  const [includeExpenses, setIncludeExpenses] = useState(true)
  const [includeAttachments, setIncludeAttachments] = useState(true)
  const [includePdf, setIncludePdf] = useState(true)

  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async () => {
    setBusy(true)
    setError(null)
    setProgress('Voorbereiden…')
    try {
      // 1. Banktransacties filteren
      const fromTs = new Date(dateFrom + 'T00:00:00').getTime()
      const toTs = new Date(dateTo + 'T23:59:59.999').getTime()
      const txsInRange = transactions.filter((t) => {
        const ts = new Date(t.booked_at).getTime()
        if (ts < fromTs || ts > toTs) return false
        if (filterType === 'income' && t.amount < 0) return false
        if (filterType === 'expense' && t.amount >= 0) return false
        return true
      })

      // 2. Kosten ophalen voor de periode
      setProgress('Kosten ophalen…')
      const expRes = await supabase
        .from('expenses')
        .select('*')
        .gte('expense_date', dateFrom)
        .lte('expense_date', dateTo)
        .order('expense_date', { ascending: false })
      if (expRes.error) throw new Error(`Kosten ophalen mislukt: ${expRes.error.message}`)
      const expsInRange = (expRes.data as Expense[] | null) ?? []
      // Voor type-filter: toepassen op kosten als 'expense' actief is.
      // Inkomsten-filter: kosten zijn altijd uitgaven, dus dan leeg.
      const expsAfterFilter = filterType === 'income' ? [] : expsInRange

      // 3. Bijlages ophalen indien gevraagd
      let atts: ExpenseAttachment[] = []
      if (includeAttachments && includeExpenses && expsAfterFilter.length > 0) {
        setProgress('Bijlages registreren…')
        const expIds = expsAfterFilter.map((e) => e.id)
        const attRes = await supabase
          .from('expense_attachments')
          .select('*')
          .in('expense_id', expIds)
          .order('uploaded_at', { ascending: true })
        if (attRes.error) throw new Error(`Bijlages ophalen mislukt: ${attRes.error.message}`)
        atts = (attRes.data as ExpenseAttachment[] | null) ?? []
      }

      // 4. ZIP bouwen
      setProgress('ZIP samenstellen…')
      const zip = new JSZip()
      const periode = `${dateFrom}_tot_${dateTo}`

      if (includeTransactions) {
        zip.file(
          'transacties.csv',
          generateTransactionsCsv(txsInRange, invoiceById, expenseById),
        )
      }
      if (includeExpenses) {
        zip.file('kosten.csv', generateExpensesCsv(expsAfterFilter))
      }
      zip.file(
        'samenvatting.txt',
        generateSummaryText({ txs: txsInRange, expenses: expsAfterFilter, dateFrom, dateTo }),
      )

      if (includePdf) {
        const pdfBlob = generatePdfReport({
          txs: txsInRange,
          expenses: expsAfterFilter,
          invoiceById,
          expenseById,
          dateFrom,
          dateTo,
        })
        zip.file('rapport.pdf', pdfBlob)
      }

      // 5. Bijlages downloaden + toevoegen
      if (atts.length > 0) {
        const expById = new Map(expsAfterFilter.map((e) => [e.id, e]))
        // Tellers per expense voor unieke filenames bij meerdere bijlages
        const counters = new Map<string, number>()
        const folder = zip.folder('bonnen')
        for (let i = 0; i < atts.length; i++) {
          const att = atts[i]
          const expense = expById.get(att.expense_id)
          if (!expense) continue
          setProgress(`Bonnetje ${i + 1} / ${atts.length}…`)
          const idx = counters.get(att.expense_id) ?? 0
          counters.set(att.expense_id, idx + 1)
          const filename = buildAttachmentFilename(expense, att, idx)

          // Signed URL ophalen + downloaden
          const { data: urlData, error: urlErr } = await supabase.storage
            .from('expense-receipts')
            .createSignedUrl(att.storage_path, 600)
          if (urlErr || !urlData?.signedUrl) {
            console.warn(`Bijlage overgeslagen (${att.filename}): ${urlErr?.message}`)
            continue
          }
          try {
            const res = await fetch(urlData.signedUrl)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const blob = await res.blob()
            folder?.file(filename, blob)
          } catch (err) {
            console.warn(`Bijlage ophalen mislukt (${att.filename}):`, err)
          }
        }
      }

      // 6. Genereren + downloaden
      setProgress('Bestand genereren…')
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `financien-${periode}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setProgress('Klaar!')
      setTimeout(() => {
        setBusy(false)
        onClose()
      }, 800)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setBusy(false)
      setProgress(null)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={busy ? undefined : onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileArchive className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-gray-900">Exporteren</h2>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-gray-400 hover:text-gray-600 p-1 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Periode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Vanaf</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                disabled={busy}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tot en met</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                disabled={busy}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Type-filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <div className="inline-flex w-full rounded-lg border border-gray-300 overflow-hidden">
              {([
                { key: 'all' as const, label: 'Alles' },
                { key: 'income' as const, label: 'Inkomsten' },
                { key: 'expense' as const, label: 'Uitgaven' },
              ]).map((opt, i) => {
                const isActive = filterType === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setFilterType(opt.key)}
                    disabled={busy}
                    className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
                      i > 0 ? 'border-l border-gray-300' : ''
                    } ${
                      isActive
                        ? opt.key === 'income'
                          ? 'bg-emerald-50 text-emerald-700'
                          : opt.key === 'expense'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-gray-100 text-gray-900'
                        : 'bg-white text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Inhoud-checkboxes */}
          <div className="space-y-2">
            <p className="block text-xs font-medium text-gray-500">Inhoud</p>
            {([
              { key: 'tx' as const, value: includeTransactions, set: setIncludeTransactions, label: 'Banktransacties (transacties.csv)' },
              { key: 'ex' as const, value: includeExpenses, set: setIncludeExpenses, label: 'Kosten (kosten.csv)' },
              { key: 'at' as const, value: includeAttachments, set: setIncludeAttachments, label: 'Bijlages (bonnen-map)' },
              { key: 'pdf' as const, value: includePdf, set: setIncludePdf, label: 'PDF-rapport (rapport.pdf)' },
            ]).map((opt) => (
              <label
                key={opt.key}
                className={`flex items-center gap-2 text-sm text-gray-700 ${busy ? 'opacity-60' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={opt.value}
                  onChange={(e) => opt.set(e.target.checked)}
                  disabled={busy}
                  className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                />
                {opt.label}
              </label>
            ))}
          </div>

          {(busy || error) && (
            <div className={`rounded-lg p-3 text-sm ${error ? 'bg-rose-50 text-rose-800' : 'bg-blue-50 text-blue-800'}`}>
              {error ? (
                <div className="flex gap-2 items-start">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{progress}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-40"
          >
            Annuleren
          </button>
          <button
            onClick={handleExport}
            disabled={busy || (!includeTransactions && !includeExpenses && !includeAttachments && !includePdf)}
            className="inline-flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download ZIP
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ---- Inkomsten-tab -------------------------------------------------------

function IncomeTab({ invoices }: { invoices: Invoice[] }) {
  const navigate = useNavigate()
  const now = new Date()
  const [filterYear, setFilterYear] = useState<number | 'all'>(now.getFullYear())
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'sent' | 'draft'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const real = useMemo(() => invoices.filter((inv) => !inv.is_test), [invoices])

  const years = useMemo(() => {
    const set = new Set<number>([now.getFullYear()])
    for (const inv of real) {
      if (inv.invoice_date) set.add(new Date(inv.invoice_date).getFullYear())
    }
    return [...set].sort((a, b) => b - a)
  }, [real])

  const filtered = useMemo(() => {
    return real.filter((inv) => {
      if (filterYear !== 'all') {
        if (!inv.invoice_date) return false
        if (new Date(inv.invoice_date).getFullYear() !== filterYear) return false
      }
      if (filterStatus !== 'all' && inv.status !== filterStatus) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const blob = [inv.number, inv.client_name, String(inv.amount)].filter(Boolean).join(' ').toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [real, filterYear, filterStatus, searchQuery])

  const totals = useMemo(() => {
    let total = 0, paid = 0, outstanding = 0, draft = 0
    for (const inv of filtered) {
      const amt = Number(inv.amount)
      total += amt
      if (inv.status === 'paid') paid += amt
      else if (inv.status === 'sent') outstanding += amt
      else if (inv.status === 'draft') draft += amt
    }
    return { count: filtered.length, total, paid, outstanding, draft }
  }, [filtered])

  const periodLabel = filterYear === 'all' ? 'Alle jaren' : `${filterYear}`

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <FileText className="w-4 h-4 text-gray-700" />
            Totaal verstuurd
          </div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{formatMoney(totals.total)}</div>
          <div className="text-xs text-gray-400 mt-1">{totals.count} facturen · {periodLabel}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Betaald
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{formatMoney(totals.paid)}</div>
          <div className="text-xs text-gray-400 mt-1">Status: paid</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            Openstaand
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600">{formatMoney(totals.outstanding)}</div>
          <div className="text-xs text-gray-400 mt-1">Status: sent</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <FileText className="w-4 h-4 text-gray-400" />
            Concept
          </div>
          <div className="mt-2 text-2xl font-bold text-gray-500">{formatMoney(totals.draft)}</div>
          <div className="text-xs text-gray-400 mt-1">Status: draft</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Jaar</label>
            <select
              value={String(filterYear)}
              onChange={(e) => setFilterYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">Alle jaren</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'paid' | 'sent' | 'draft')}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">Alle</option>
              <option value="paid">Betaald</option>
              <option value="sent">Openstaand</option>
              <option value="draft">Concept</option>
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Zoeken</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Factuurnummer of klant…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Geen facturen gevonden voor deze filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Nummer</th>
                  <th className="px-4 py-3 font-medium">Klant</th>
                  <th className="px-4 py-3 font-medium">Factuurdatum</th>
                  <th className="px-4 py-3 font-medium">Vervaldatum</th>
                  <th className="px-4 py-3 font-medium text-right">Bedrag</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/admin/facturen/${inv.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {inv.number || <span className="text-gray-400">(zonder nummer)</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{inv.client_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {inv.invoice_date ? formatDate(inv.invoice_date) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {inv.due_date ? formatDate(inv.due_date) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                      {formatMoney(Number(inv.amount))}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ${
                        inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700'
                          : inv.status === 'sent' ? 'bg-amber-50 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {inv.status === 'paid' ? 'Betaald' : inv.status === 'sent' ? 'Openstaand' : 'Concept'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

// ---- Balans-tab ----------------------------------------------------------

function BalansTab({ transactions }: { transactions: BankTransaction[] }) {
  const now = new Date()
  const [filterYear, setFilterYear] = useState<number | 'all'>(now.getFullYear())

  const years = useMemo(() => {
    const set = new Set<number>([now.getFullYear()])
    for (const t of transactions) set.add(new Date(t.booked_at).getFullYear())
    return [...set].sort((a, b) => b - a)
  }, [transactions])

  const business = useMemo(() => transactions.filter((t) => !t.category), [transactions])

  type Bucket = { label: string; income: number; expense: number }

  const buckets = useMemo<Bucket[]>(() => {
    if (filterYear === 'all') {
      const yearMap = new Map<number, { income: number; expense: number }>()
      for (const t of business) {
        const y = new Date(t.booked_at).getFullYear()
        const cur = yearMap.get(y) ?? { income: 0, expense: 0 }
        const amt = Number(t.amount)
        const isRefundTx = amt > 0 && t.expense_id != null
        if (isRefundTx) cur.expense -= amt
        else if (amt >= 0) cur.income += amt
        else cur.expense += Math.abs(amt)
        yearMap.set(y, cur)
      }
      return [...yearMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([y, v]) => ({ label: String(y), income: v.income, expense: v.expense }))
    }

    const months: Bucket[] = Array.from({ length: 12 }, (_, m) => ({
      label: new Date(2000, m, 1).toLocaleDateString('nl-NL', { month: 'short' }),
      income: 0,
      expense: 0,
    }))
    for (const t of business) {
      const d = new Date(t.booked_at)
      if (d.getFullYear() !== filterYear) continue
      const m = d.getMonth()
      const amt = Number(t.amount)
      const isRefundTx = amt > 0 && t.expense_id != null
      if (isRefundTx) months[m].expense -= amt
      else if (amt >= 0) months[m].income += amt
      else months[m].expense += Math.abs(amt)
    }
    return months
  }, [business, filterYear])

  const totals = useMemo(() => {
    let income = 0, expense = 0
    for (const b of buckets) { income += b.income; expense += b.expense }
    return { income, expense, balance: income - expense }
  }, [buckets])

  const maxValue = useMemo(() => {
    let m = 0
    for (const b of buckets) {
      if (b.income > m) m = b.income
      if (b.expense > m) m = b.expense
    }
    return m || 1
  }, [buckets])

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
            Inkomsten
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{formatMoney(totals.income)}</div>
          <div className="text-xs text-gray-400 mt-1">
            {filterYear === 'all' ? 'Alle jaren' : `${filterYear}`}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <ArrowUpRight className="w-4 h-4 text-rose-600" />
            Uitgaven
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-600">{formatMoney(totals.expense)}</div>
          <div className="text-xs text-gray-400 mt-1">Refunds verrekend</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Wallet className="w-4 h-4 text-gray-700" />
            Saldo
          </div>
          <div className={`mt-2 text-2xl font-bold ${totals.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {totals.balance < 0 ? '−' : ''}{formatMoney(totals.balance)}
          </div>
          <div className="text-xs text-gray-400 mt-1">Inkomsten − Uitgaven</div>
        </div>
      </div>

      <p className="text-xs text-gray-400 -mt-3 mb-6">
        Privé-transacties tellen niet mee. Refunds verlagen de uitgaven.
      </p>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="max-w-xs">
          <label className="block text-xs font-medium text-gray-500 mb-1">Jaar</label>
          <select
            value={String(filterYear)}
            onChange={(e) => setFilterYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">Alle jaren</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">
            {filterYear === 'all' ? 'Per jaar' : `Per maand (${filterYear})`}
          </h3>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              Inkomsten
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
              Uitgaven
            </span>
          </div>
        </div>

        <BarChart buckets={buckets} maxValue={maxValue} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">{filterYear === 'all' ? 'Jaar' : 'Maand'}</th>
                <th className="px-4 py-3 font-medium text-right">Inkomsten</th>
                <th className="px-4 py-3 font-medium text-right">Uitgaven</th>
                <th className="px-4 py-3 font-medium text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {buckets.map((b) => {
                const saldo = b.income - b.expense
                return (
                  <tr key={b.label} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-700 capitalize">{b.label}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-600 whitespace-nowrap">
                      {b.income > 0 ? `+ ${formatMoney(b.income)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-rose-600 whitespace-nowrap">
                      {b.expense > 0 ? `− ${formatMoney(b.expense)}` : '—'}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-medium whitespace-nowrap ${
                      saldo >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {saldo < 0 ? '−' : ''}{formatMoney(saldo)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// Simpele staaf-grafiek met SVG, geen library nodig
function BarChart({ buckets, maxValue }: { buckets: { label: string; income: number; expense: number }[]; maxValue: number }) {
  const colWidth = 100 / Math.max(buckets.length, 1)
  const barGap = 2
  const barWidth = (colWidth - barGap) / 2
  const chartHeight = 200

  return (
    <div className="space-y-2">
      <svg
        width="100%"
        height={chartHeight}
        viewBox={`0 0 100 ${chartHeight}`}
        preserveAspectRatio="none"
        className="overflow-visible"
      >
        {[0.25, 0.5, 0.75, 1].map((frac) => (
          <line
            key={frac}
            x1={0}
            x2={100}
            y1={chartHeight - chartHeight * frac}
            y2={chartHeight - chartHeight * frac}
            stroke="#e5e7eb"
            strokeWidth={0.2}
            strokeDasharray="0.5 0.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {buckets.map((b, i) => {
          const x = i * colWidth
          const incomeH = (b.income / maxValue) * chartHeight
          const expenseH = (Math.max(0, b.expense) / maxValue) * chartHeight
          return (
            <g key={i}>
              <rect
                x={x + barGap / 2}
                y={chartHeight - incomeH}
                width={barWidth}
                height={incomeH}
                fill="#10b981"
              >
                <title>{`${b.label}: € ${b.income.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} inkomsten`}</title>
              </rect>
              <rect
                x={x + barGap / 2 + barWidth}
                y={chartHeight - expenseH}
                width={barWidth}
                height={expenseH}
                fill="#f43f5e"
              >
                <title>{`${b.label}: € ${b.expense.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} uitgaven`}</title>
              </rect>
            </g>
          )
        })}
      </svg>
      <div className="flex">
        {buckets.map((b) => (
          <div key={b.label} style={{ width: `${colWidth}%` }} className="text-center text-[10px] text-gray-500 capitalize">
            {b.label}
          </div>
        ))}
      </div>
    </div>
  )
}
