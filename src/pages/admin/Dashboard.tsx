import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { FolderKanban, Users, FileText, FileCheck, Mail } from 'lucide-react'
import { Link } from 'react-router-dom'

interface DashboardStats {
  projects: number
  clients: number
  invoices: number
  quotes: number
  unpaidInvoices: number
  activeProjects: number
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
  const [sendingTest, setSendingTest] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleSendTestEmail = async () => {
    setSendingTest(true)
    setTestResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('send-test-email')
      if (error) throw error
      if (data && !data.success) throw new Error(data.error || 'Onbekende fout')
      setTestResult({ success: true, message: 'Testmail verzonden naar koen.kerkvliet@designpixels.nl' })
    } catch (err) {
      setTestResult({ success: false, message: `Verzenden mislukt: ${err instanceof Error ? err.message : 'Onbekende fout'}` })
    } finally {
      setSendingTest(false)
    }
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
  }, [])

  const cards = [
    {
      title: 'Projecten',
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

      <div className="mt-8 bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">E-mail integratie</h2>
        <p className="text-sm text-gray-500 mb-4">Test of de EmailIt v2 koppeling correct werkt.</p>
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
