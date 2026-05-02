import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { BankTransaction } from '../../types'
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
} from 'lucide-react'

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
  const now = new Date()
  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  const [filterYear, setFilterYear] = useState<number>(now.getFullYear())
  const [filterMonth, setFilterMonth] = useState<number | 'all'>(now.getMonth() + 1)
  const [searchQuery, setSearchQuery] = useState('')

  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchData = async () => {
    const [txRes, stateRes] = await Promise.all([
      supabase.from('bank_transactions').select('*').order('booked_at', { ascending: false }),
      supabase.from('bunq_state').select('last_sync_at, session_token').eq('id', 1).maybeSingle(),
    ])
    if (txRes.error) console.error('Kon transacties niet laden:', txRes.error)
    setTransactions((txRes.data as BankTransaction[] | null) ?? [])
    setLastSyncAt(stateRes.data?.last_sync_at ?? null)
    setIsConnected(Boolean(stateRes.data?.session_token))
    setLoading(false)
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
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const blob = [t.description, t.counterparty_name, t.counterparty_iban].filter(Boolean).join(' ').toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [transactions, filterYear, filterMonth, searchQuery])

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

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" />
            Financiën
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Inkomsten en uitgaven via Bunq
            {lastSyncAt && (
              <span className="ml-2 text-gray-400">· laatst gesynchroniseerd {formatRelativeTime(lastSyncAt)}</span>
            )}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {syncing ? 'Synchroniseren…' : 'Verversen'}
        </button>
      </div>

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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  <th className="px-4 py-3 font-medium">Factuur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((t) => (
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
                      {t.invoice_id ? (
                        <span className="inline-flex items-center gap-1 text-xs text-primary">
                          <LinkIcon className="w-3 h-3" />
                          Gekoppeld
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
