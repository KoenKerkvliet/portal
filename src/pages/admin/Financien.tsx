import { useMemo, useState } from 'react'
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  AlertCircle,
  Search,
  Link as LinkIcon,
} from 'lucide-react'

type BankTransaction = {
  id: string
  booked_at: string
  description: string
  counterparty: string | null
  amount: number
  currency: string
  invoice_id: string | null
}

function formatMoney(amount: number, currency = 'EUR'): string {
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency
  return `${symbol} ${Math.abs(amount).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
}

export default function Financien() {
  const now = new Date()
  const [filterYear, setFilterYear] = useState<number>(now.getFullYear())
  const [filterMonth, setFilterMonth] = useState<number | 'all'>(now.getMonth() + 1)
  const [searchQuery, setSearchQuery] = useState('')

  // Bunq-koppeling nog niet actief — transacties komen straks uit de bank_transactions-tabel
  // die door een uurlijkse Edge Function-cron wordt gevuld vanuit de Bunq API.
  const transactions: BankTransaction[] = []
  const lastSyncAt: string | null = null
  const isConnected = false

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const d = new Date(t.booked_at)
      if (d.getFullYear() !== filterYear) return false
      if (filterMonth !== 'all' && d.getMonth() + 1 !== filterMonth) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const blob = [t.description, t.counterparty].filter(Boolean).join(' ').toLowerCase()
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
  }, [transactions, now])

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
              <span className="ml-2 text-gray-400">· laatst gesynchroniseerd {formatDate(lastSyncAt)}</span>
            )}
          </p>
        </div>
        <button
          disabled
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium opacity-50 cursor-not-allowed"
          title="Bunq-koppeling nog niet actief"
        >
          <RefreshCw className="w-4 h-4" />
          Verversen
        </button>
      </div>

      {/* Setup notice */}
      {!isConnected && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-900">Bunq-koppeling nog niet actief</p>
            <p className="text-amber-800 mt-1">
              Zodra de Bunq API-sleutel is ingesteld, worden transacties elk uur automatisch opgehaald
              en zie je hier het overzicht. Later kunnen inkomsten gekoppeld worden aan facturen.
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
                placeholder="Omschrijving of tegenpartij…"
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
              {isConnected ? 'Geen transacties gevonden voor de gekozen periode.' : 'Nog geen transacties — koppeling met Bunq is nog niet actief.'}
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
                    <td className="px-4 py-3 text-gray-900">{t.counterparty || '—'}</td>
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
