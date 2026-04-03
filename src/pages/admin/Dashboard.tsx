import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { FolderKanban, Users, FileText, FileCheck, Mail, Bell, X, CheckCircle, XCircle, ClipboardCheck, Layers } from 'lucide-react'
import { Link } from 'react-router-dom'

interface DashboardStats {
  projects: number
  clients: number
  invoices: number
  quotes: number
  unpaidInvoices: number
  activeProjects: number
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
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
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
      .limit(20)
    setNotifications(data || [])
  }

  const dismissNotification = async (id: string) => {
    await supabase.from('admin_notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const dismissAll = async () => {
    const ids = notifications.map(n => n.id)
    if (ids.length === 0) return
    await supabase.from('admin_notifications').update({ read: true }).in('id', ids)
    setNotifications([])
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

      <div className="mt-8 bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">E-mail integratie</h2>
        <p className="text-sm text-gray-500 mb-4">Test of de EmailIt v2 koppeling correct werkt.</p>

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
    </div>
  )
}
