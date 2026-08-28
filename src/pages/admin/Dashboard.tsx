import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { FolderKanban, Users, FileText, FileCheck, Mail, Bell, X, CheckCircle, XCircle, ClipboardCheck, Layers, Ticket, Gift, Euro, Timer, ChevronDown, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'

interface DashboardStats {
  projects: number
  clients: number
  invoices: number
  quotes: number
  unpaidInvoices: number
  activeProjects: number
}

interface PunchProjectStat {
  id: string
  name: string
  total: number
  remaining: number
  used: number
  earned: number
  cards: number
}

interface PunchStats {
  soldCards: number
  giftCards: number
  stripsSold: number
  revenue: number
  stripsUsed: number
  minutesUsed: number
  earned: number
  outstanding: number
  stripsRemaining: number
  avgStripPrice: number
  perProject: PunchProjectStat[]
}

const emptyPunchStats: PunchStats = {
  soldCards: 0,
  giftCards: 0,
  stripsSold: 0,
  revenue: 0,
  stripsUsed: 0,
  minutesUsed: 0,
  earned: 0,
  outstanding: 0,
  stripsRemaining: 0,
  avgStripPrice: 0,
  perProject: [],
}

function formatEuro(amount: number): string {
  return `€ ${amount.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} uur` : `${hours} u ${rest} min`
}

interface AdminNotification {
  id: string
  type: string
  title: string
  message: string
  link_url: string | null
  read: boolean
  created_at: string
  project?: { name: string }
  client?: { name: string }
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Zojuist'
  if (mins < 60) return `${mins} min geleden`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} uur geleden`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Gisteren'
  return `${days} dagen geleden`
}

const notifIcons: Record<string, typeof Bell> = {
  quote_accepted: CheckCircle,
  quote_declined: XCircle,
  assignment: ClipboardCheck,
  card_update: Layers,
  general: Bell,
}

const notifColors: Record<string, string> = {
  quote_accepted: 'bg-green-50 border-green-200',
  quote_declined: 'bg-red-50 border-red-200',
  assignment: 'bg-emerald-50 border-emerald-200',
  card_update: 'bg-amber-50 border-amber-200',
  general: 'bg-gray-50 border-gray-200',
}

const notifIconColors: Record<string, string> = {
  quote_accepted: 'text-green-500',
  quote_declined: 'text-red-500',
  assignment: 'text-emerald-500',
  card_update: 'text-amber-500',
  general: 'text-gray-400',
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    projects: 0,
    clients: 0,
    invoices: 0,
    quotes: 0,
    unpaidInvoices: 0,
    activeProjects: 0,
  })
  const [loading, setLoading] = useState(true)
  const [punchStats, setPunchStats] = useState<PunchStats>(emptyPunchStats)
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const stackedIdsRef = useRef<Record<string, string[]>>({})
  const [emailOpen, setEmailOpen] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [testEmailDesignPixels, setTestEmailDesignPixels] = useState(true)
  const [testEmailCustom, setTestEmailCustom] = useState('')

  const handleSendTestEmail = async () => {
    const recipients: string[] = []
    if (testEmailDesignPixels) recipients.push('koen.kerkvliet@designpixels.nl')
    if (testEmailCustom.trim()) recipients.push(testEmailCustom.trim())

    if (recipients.length === 0) {
      setTestResult({ success: false, message: 'Selecteer minstens één ontvanger of vul een e-mailadres in.' })
      return
    }

    setSendingTest(true)
    setTestResult(null)

    try {
      const results: string[] = []
      for (const to of recipients) {
        const { data, error } = await supabase.functions.invoke('send-test-email', {
          body: { to },
        })
        if (error) throw error
        if (data && !data.success) throw new Error(data.error || 'Onbekende fout')
        results.push(to)
      }
      setTestResult({ success: true, message: `Testmail verzonden naar ${results.join(' en ')}` })
    } catch (err) {
      setTestResult({ success: false, message: `Verzenden mislukt: ${err instanceof Error ? err.message : 'Onbekende fout'}` })
    } finally {
      setSendingTest(false)
    }
  }

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('admin_notifications')
      .select('*, project:projects(name), client:clients(name)')
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(50)

    // Stack similar notifications (same title prefix, e.g. "Reactie op ticket #001")
    const raw = data || []
    const stacked: AdminNotification[] = []
    const seen = new Map<string, { notif: AdminNotification; ids: string[]; count: number }>()

    for (const n of raw) {
      // Group key: strip trailing details, keep the core title
      const key = n.title.replace(/\s*—\s*.+$/, '').trim()
      const existing = seen.get(key)
      if (existing) {
        existing.count++
        existing.ids.push(n.id)
      } else {
        const entry = { notif: { ...n }, ids: [n.id], count: 1 }
        seen.set(key, entry)
        stacked.push(entry.notif)
      }
    }

    // Update titles for stacked notifications
    for (const [key, { notif, count }] of seen) {
      if (count > 1) {
        notif.title = `${key} (${count}x)`
        notif.message = `${count} meldingen`
      }
    }

    // Store grouped IDs for bulk dismiss
    stackedIdsRef.current = Object.fromEntries(
      [...seen.entries()].map(([, { notif, ids }]) => [notif.id, ids])
    )

    setNotifications(stacked)
  }

  const dismissNotification = async (id: string) => {
    const ids = stackedIdsRef.current[id] || [id]
    await supabase.from('admin_notifications').update({ read: true }).in('id', ids)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const dismissAll = async () => {
    const ids = notifications.map(n => n.id)
    if (ids.length === 0) return
    await supabase.from('admin_notifications').update({ read: true }).in('id', ids)
    setNotifications([])
  }

  const fetchPunchStats = async () => {
    const [cardsRes, usesRes] = await Promise.all([
      supabase.from('punch_cards').select('*, project:projects(name)'),
      supabase.from('punch_card_uses').select('duration_minutes'),
    ])

    const cards = cardsRes.data || []
    const next: PunchStats = { ...emptyPunchStats, perProject: [] }
    const byProject = new Map<string, PunchProjectStat>()

    for (const card of cards) {
      const total = Number(card.total_punches) || 0
      const used = Number(card.used_punches) || 0
      const price = Number(card.price) || 0
      const isGift = !!card.is_gift
      const isActive = card.status === 'active'
      // Elke strip is evenveel waard binnen z'n eigen kaart; cadeaustrippen zijn € 0.
      const stripValue = !isGift && total > 0 ? price / total : 0

      if (isGift) next.giftCards++
      else {
        next.soldCards++
        next.stripsSold += total
        next.revenue += price
      }

      next.stripsUsed += used
      next.earned += used * stripValue
      if (isActive) {
        next.stripsRemaining += total - used
        next.outstanding += (total - used) * stripValue
      }

      const projectId = card.project_id
      const entry = byProject.get(projectId) || {
        id: projectId,
        name: (card.project as unknown as { name: string } | null)?.name || 'Onbekend domein',
        total: 0,
        remaining: 0,
        used: 0,
        earned: 0,
        cards: 0,
      }
      entry.cards++
      entry.used += used
      entry.earned += used * stripValue
      if (isActive) {
        entry.total += total
        entry.remaining += total - used
      }
      byProject.set(projectId, entry)
    }

    next.minutesUsed = (usesRes.data || []).reduce((sum, u) => sum + (Number(u.duration_minutes) || 0), 0)
    next.avgStripPrice = next.stripsSold > 0 ? next.revenue / next.stripsSold : 0
    next.perProject = [...byProject.values()].sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name))

    setPunchStats(next)
  }

  useEffect(() => {
    const fetchStats = async () => {
      const [projects, clients, invoices, quotes] = await Promise.all([
        supabase.from('projects').select('id, status', { count: 'exact' }),
        supabase.from('clients').select('id', { count: 'exact' }),
        supabase.from('invoices').select('id, status', { count: 'exact' }),
        supabase.from('quotes').select('id', { count: 'exact' }),
      ])

      setStats({
        projects: projects.count || 0,
        clients: clients.count || 0,
        invoices: invoices.count || 0,
        quotes: quotes.count || 0,
        unpaidInvoices: invoices.data?.filter((i) => i.status !== 'paid').length || 0,
        activeProjects: projects.data?.filter((p) => p.status === 'active').length || 0,
      })
      setLoading(false)
    }

    fetchStats()
    fetchNotifications()
    fetchPunchStats()
  }, [])

  const cards = [
    {
      title: 'Domeinen',
      value: stats.projects,
      subtitle: `${stats.activeProjects} actief`,
      icon: FolderKanban,
      color: 'bg-primary/10 text-primary',
      link: '/admin/projecten',
    },
    {
      title: 'Klanten',
      value: stats.clients,
      subtitle: 'Totaal',
      icon: Users,
      color: 'bg-blue-50 text-blue-600',
      link: '/admin/klanten',
    },
    {
      title: 'Facturen',
      value: stats.invoices,
      subtitle: `${stats.unpaidInvoices} openstaand`,
      icon: FileText,
      color: 'bg-accent/10 text-accent-600',
      link: '/admin/facturen',
    },
    {
      title: 'Offertes',
      value: stats.quotes,
      subtitle: 'Totaal',
      icon: FileCheck,
      color: 'bg-green-50 text-green-600',
      link: '/admin/offertes',
    },
  ]

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overzicht van je portaal</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm animate-pulse">
              <div className="h-20" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          {cards.map((card) => (
            <Link
              key={card.title}
              to={card.link}
              className="bg-white rounded-xl p-4 sm:p-6 shadow-sm hover:shadow-md transition-shadow border border-gray-100"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.color}`}>
                  <card.icon className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">{card.value}</p>
              <p className="text-sm text-gray-500 mt-1">{card.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{card.subtitle}</p>
            </Link>
          ))}
        </div>
      )}

      {/* Admin notifications */}
      {notifications.length > 0 && (
        <div className="mt-8 bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-gray-900">Meldingen</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">{notifications.length}</span>
            </div>
            {notifications.length > 1 && (
              <button onClick={dismissAll} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                Alles gelezen
              </button>
            )}
          </div>
          <div className="space-y-2">
            {notifications.map((n) => {
              const Icon = notifIcons[n.type] || Bell
              const colorClass = notifColors[n.type] || notifColors.general
              const iconColor = notifIconColors[n.type] || notifIconColors.general
              const timeAgo = getTimeAgo(n.created_at)

              return (
                <div key={n.id} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${colorClass}`}>
                  <div className="flex-shrink-0 mt-0.5">
                    <Icon className={`w-4 h-4 ${iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                    {n.message && <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      {(n.client as unknown as { name: string })?.name && (
                        <span className="text-[11px] text-gray-400">{(n.client as unknown as { name: string }).name}</span>
                      )}
                      {(n.project as unknown as { name: string })?.name && (
                        <span className="text-[11px] text-gray-400">• {(n.project as unknown as { name: string }).name}</span>
                      )}
                      <span className="text-[11px] text-gray-400">• {timeAgo}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => dismissNotification(n.id)}
                    className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Strippenkaarten */}
      <div className="mt-8 bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-semibold text-gray-900">Strippenkaarten</h2>
          </div>
          <Link to="/admin/onderhoud" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
            Naar onderhoud
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Ticket className="w-4 h-4 text-purple-500" />
              <span className="text-xs font-medium text-gray-500">Kaarten gekocht</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{punchStats.soldCards}</p>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <Gift className="w-3 h-3" />
              {punchStats.giftCards} cadeau geschonken
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-medium text-gray-500">Strippen verkocht</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{punchStats.stripsSold}</p>
            <p className="text-xs text-gray-400 mt-0.5">{formatEuro(punchStats.revenue)} omzet</p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-medium text-gray-500">Strippen afgeschreven</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{punchStats.stripsUsed}</p>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <Timer className="w-3 h-3" />
              {formatDuration(punchStats.minutesUsed)} gelogd
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Euro className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-medium text-gray-500">Verdiend met strippen</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatEuro(punchStats.earned)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{formatEuro(punchStats.outstanding)} nog te leveren</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-xs text-gray-400">
          <span><span className="font-medium text-gray-600">{punchStats.stripsRemaining}</span> strippen open</span>
          <span>•</span>
          <span>Gem. <span className="font-medium text-gray-600">{formatEuro(punchStats.avgStripPrice)}</span> per strip</span>
          <span>•</span>
          <span>1 strip = 5 minuten</span>
        </div>

        {punchStats.perProject.length > 0 && (
          <div className="mt-5 pt-5 border-t border-gray-100 space-y-2">
            <p className="text-xs font-medium text-gray-500 mb-3">Per domein</p>
            {punchStats.perProject.map((p) => {
              const percentage = p.total > 0 ? (p.remaining / p.total) * 100 : 0
              return (
                <div key={p.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-xs font-medium text-gray-700 truncate">{p.name}</span>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {p.total > 0 ? `${p.remaining}/${p.total} strippen` : 'geen actieve kaart'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          percentage > 50 ? 'bg-emerald-400' : percentage > 20 ? 'bg-amber-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {p.cards} {p.cards === 1 ? 'kaart' : 'kaarten'} • {p.used} afgeschreven • {formatEuro(p.earned)} verdiend
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100">
        <button
          onClick={() => setEmailOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 p-4 sm:p-6 text-left"
        >
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-gray-400" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">E-mail integratie</h2>
              <p className="text-sm text-gray-500">Test of de EmailIt v2 koppeling correct werkt.</p>
            </div>
          </div>
          <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${emailOpen ? 'rotate-180' : ''}`} />
        </button>

        {emailOpen && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-6">
        <div className="space-y-3 mb-5">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={testEmailDesignPixels}
              onChange={(e) => setTestEmailDesignPixels(e.target.checked)}
              className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/30"
            />
            <span className="text-sm text-gray-700">koen.kerkvliet@designpixels.nl</span>
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ander e-mailadres</label>
            <input
              type="email"
              value={testEmailCustom}
              onChange={(e) => setTestEmailCustom(e.target.value)}
              placeholder="naam@voorbeeld.nl"
              className="w-full max-w-sm px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
            />
          </div>
        </div>

        <button
          onClick={handleSendTestEmail}
          disabled={sendingTest}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#9e86ff] to-[#7c3aed] text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Mail className="w-4 h-4" />
          {sendingTest ? 'Verzenden...' : 'Testmail versturen'}
        </button>
        {testResult && (
          <div className={`mt-3 px-4 py-3 rounded-lg text-sm ${testResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {testResult.message}
          </div>
        )}
        </div>
        )}
      </div>
    </div>
  )
}
