import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { BankTransaction, Expense, Invoice } from '../../types'
import Kosten from './Kosten'
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
} from 'lucide-react'

type TabKey = 'bank' | 'kosten'

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
    return saved === 'kosten' ? 'kosten' : 'bank'
  })
  useEffect(() => {
    window.sessionStorage.setItem('financien_tab', activeTab)
  }, [activeTab])

  const [filterYear, setFilterYear] = useState<number>(now.getFullYear())
  const [filterMonth, setFilterMonth] = useState<number | 'all'>(now.getMonth() + 1)
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Koppel-modal en cross-tab highlight
  const [linkingTx, setLinkingTx] = useState<BankTransaction | null>(null)
  const [highlightExpenseId, setHighlightExpenseId] = useState<string | null>(null)

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

  const handleLink = async (tx: BankTransaction, target: { kind: 'invoice' | 'expense'; id: string }) => {
    const update = target.kind === 'invoice'
      ? { invoice_id: target.id, expense_id: null }
      : { expense_id: target.id, invoice_id: null }
    const { error } = await supabase.from('bank_transactions').update(update).eq('id', tx.id)
    if (error) {
      alert(`Koppelen mislukt: ${error.message}`)
      return
    }
    setLinkingTx(null)
    await fetchData()
  }

  const handleUnlink = async (tx: BankTransaction) => {
    const { error } = await supabase
      .from('bank_transactions')
      .update({ invoice_id: null, expense_id: null })
      .eq('id', tx.id)
    if (error) {
      alert(`Ontkoppelen mislukt: ${error.message}`)
      return
    }
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

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const d = new Date(t.booked_at)
      if (d.getFullYear() !== filterYear) return false
      if (filterMonth !== 'all' && d.getMonth() + 1 !== filterMonth) return false
      if (filterType === 'income' && t.amount < 0) return false
      if (filterType === 'expense' && t.amount >= 0) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const blob = [t.description, t.counterparty_name, t.counterparty_iban].filter(Boolean).join(' ').toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [transactions, filterYear, filterMonth, filterType, searchQuery])

  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    for (const t of filtered) {
      if (t.amount >= 0) income += t.amount
      else expense += Math.abs(t.amount)
    }
    return { income, expense, balance: income - expense }
  }, [filtered])

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

  const tabSubtitle = activeTab === 'bank'
    ? 'Inkomsten en uitgaven via Bunq'
    : 'Beheer je uitgaven en kostenposten'

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

      {/* Tab-strip */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {([
            { key: 'bank', label: 'Banktransacties', icon: Landmark },
            { key: 'kosten', label: 'Kosten', icon: Receipt },
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
            {filterMonth === 'all' ? `Heel ${filterYear}` : monthLabel(filterYear, filterMonth as number)}
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
            {filterMonth === 'all' ? `Heel ${filterYear}` : monthLabel(filterYear, filterMonth as number)}
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

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Jaar</label>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
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
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              title="Open kost"
                            >
                              <Receipt className="w-3 h-3" />
                              {linkedExpense.vendor || linkedExpense.description.slice(0, 30) || 'Kost'}
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
                        ) : (
                          <button
                            onClick={() => setLinkingTx(t)}
                            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary border border-gray-200 hover:border-primary/40 rounded px-2 py-1 transition-colors"
                          >
                            <LinkIcon className="w-3 h-3" />
                            Koppelen
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
}: {
  tx: BankTransaction
  invoices: Invoice[]
  expenses: Expense[]
  onClose: () => void
  onSelect: (target: { kind: 'invoice' | 'expense'; id: string }) => void
}) {
  const isIncoming = tx.amount >= 0
  const [tab, setTab] = useState<'invoice' | 'expense'>(isIncoming ? 'invoice' : 'expense')
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
            <h2 className="text-lg font-semibold text-gray-900">Koppelen aan factuur of kost</h2>
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
              { key: 'invoice' as const, label: 'Facturen', icon: FileText, count: invoices.length },
              { key: 'expense' as const, label: 'Kosten', icon: Receipt, count: expenses.length },
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
                  <span className="text-xs text-gray-400">({t.count})</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Search */}
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

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'invoice' ? (
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
            expenseItems.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-12">Geen kosten gevonden.</p>
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
            )
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
