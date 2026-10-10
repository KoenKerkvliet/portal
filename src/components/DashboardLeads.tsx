import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Target, Loader2, CalendarClock, Send, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Lead, LeadStatus } from '../types'
import { PRIORITIES, STATUSES, city, formatDate, todayISO } from '../lib/leads'

const PER_COLUMN = 5

// Statussen waarbij het contact loopt en de bal ergens ligt.
const LOPEND: LeadStatus[] = ['in_beraad', 'mail_gestuurd', 'contact_gelegd']

type Row = Pick<
  Lead,
  'id' | 'name' | 'address' | 'lead_type' | 'status' | 'priority' | 'score' | 'follow_up_at' | 'last_contact_at'
>

// Dashboard: waar staan mijn leads? Links wat vandaag moet, in het midden de
// lopende gesprekken, rechts de voorraad die ik interessant vond.
export default function DashboardLeads() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('leads')
      .select('id, name, address, lead_type, status, priority, score, follow_up_at, last_contact_at')
      .neq('status', 'niet_interessant')
      .then(({ data }) => {
        setRows((data || []) as Row[])
        setLoading(false)
      })
  }, [])

  const today = todayISO()

  const actie = rows
    .filter((l) => (l.follow_up_at && l.follow_up_at <= today) || l.status === 'nog_opvolgen')
    .sort((a, b) => (a.follow_up_at ?? '9999').localeCompare(b.follow_up_at ?? '9999'))

  const lopend = rows
    .filter((l) => LOPEND.includes(l.status))
    // In beraad eerst: daar wordt op dit moment over jou beslist.
    .sort((a, b) => LOPEND.indexOf(a.status) - LOPEND.indexOf(b.status) || a.name.localeCompare(b.name))

  const interessant = rows
    .filter((l) => l.status === 'interessant')
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))

  const columns = [
    {
      key: 'actie',
      title: 'Actie nodig',
      icon: CalendarClock,
      accent: 'text-amber-600',
      href: '/admin/leads?opvolgen=1',
      items: actie,
      leeg: 'Niets staat open vandaag.',
      meta: (l: Row) =>
        l.follow_up_at
          ? l.follow_up_at < today
            ? `Stond gepland op ${formatDate(l.follow_up_at)}`
            : 'Vandaag opvolgen'
          : STATUSES[l.status].label,
    },
    {
      key: 'lopend',
      title: 'Benaderd',
      icon: Send,
      accent: 'text-blue-600',
      href: '/admin/leads?status=mail_gestuurd',
      items: lopend,
      leeg: 'Nog niemand benaderd.',
      meta: (l: Row) =>
        l.last_contact_at
          ? `${STATUSES[l.status].label} · ${formatDate(l.last_contact_at)}`
          : STATUSES[l.status].label,
    },
    {
      key: 'interessant',
      title: 'Interessant',
      icon: Sparkles,
      accent: 'text-purple-600',
      href: '/admin/leads?status=interessant',
      items: interessant,
      leeg: 'Nog niets gemarkeerd.',
      meta: (l: Row) => PRIORITIES[l.priority ?? 'ok'].label,
    },
  ]

  return (
    <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">Leads</h2>
        </div>
        <Link to="/admin/leads" className="text-sm text-primary hover:underline">
          Alle leads
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Leads laden...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {columns.map((col) => (
            <div key={col.key} className="min-w-0">
              <Link
                to={col.href}
                className="flex items-center gap-2 mb-3 group"
              >
                <col.icon className={`w-4 h-4 ${col.accent}`} />
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider group-hover:text-gray-900 transition-colors">
                  {col.title}
                </span>
                <span className="text-xs text-gray-400">{col.items.length}</span>
              </Link>

              {col.items.length === 0 ? (
                <p className="text-xs text-gray-400">{col.leeg}</p>
              ) : (
                <div className="space-y-1.5">
                  {col.items.slice(0, PER_COLUMN).map((lead) => (
                    <Link
                      key={lead.id}
                      to={col.href}
                      className="block bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors"
                    >
                      <p className="text-xs font-medium text-gray-800 truncate">{lead.name}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {col.meta(lead)}
                        {city(lead.address) && <span className="text-gray-400"> · {city(lead.address)}</span>}
                      </p>
                    </Link>
                  ))}
                  {col.items.length > PER_COLUMN && (
                    <Link to={col.href} className="block text-[11px] text-gray-500 hover:text-gray-800 px-3 pt-0.5">
                      en nog {col.items.length - PER_COLUMN}...
                    </Link>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
