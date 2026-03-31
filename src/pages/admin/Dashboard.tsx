import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { FolderKanban, Users, FileText, FileCheck } from 'lucide-react'
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overzicht van je portaal</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm animate-pulse">
              <div className="h-20" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {cards.map((card) => (
            <Link
              key={card.title}
              to={card.link}
              className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow border border-gray-100"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.color}`}>
                  <card.icon className="w-5 h-5" />
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">{card.value}</p>
              <p className="text-sm text-gray-500 mt-1">{card.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{card.subtitle}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
