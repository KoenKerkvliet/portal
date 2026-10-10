import { useEffect, useState } from 'react'
import { Eye, LayoutDashboard, Loader2, MessageCircle, MessageSquare } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { portalPageLabel, type PortalEvent } from '../../lib/portalActivity'

interface Item {
  key: string
  at: string
  icon: typeof Eye
  className: string
  text: string
  who: string
}

const PAGE = 25

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA')
const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })

// Domeinpagina › Algemeen › Activiteit: wat de klanten van dit domein in het portaal en met
// de links uit mails hebben gedaan, samen met tickets en chatgesprekken.
export default function DomainActivity({ projectId, clientIds }: { projectId: string; clientIds: string[] }) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [shown, setShown] = useState(PAGE)
  const idsKey = clientIds.join(',')

  useEffect(() => {
    const load = async () => {
      const ids = idsKey ? idsKey.split(',') : []
      const eventFilter = ids.length > 0 ? `project_id.eq.${projectId},client_id.in.(${ids.join(',')})` : `project_id.eq.${projectId}`
      const [{ data: events }, { data: tickets }, { data: chats }, { data: clients }] = await Promise.all([
        supabase.from('portal_events').select('*').or(eventFilter).order('created_at', { ascending: false }).limit(300),
        supabase.from('tickets').select('id, number, title, created_at').eq('project_id', projectId)
          .order('created_at', { ascending: false }).limit(50),
        ids.length > 0
          ? supabase.from('chat_conversations').select('id, client_id, created_at, message_count').in('client_id', ids)
            .order('created_at', { ascending: false }).limit(50)
          : Promise.resolve({ data: [] }),
        ids.length > 0 ? supabase.from('clients').select('id, name').in('id', ids) : Promise.resolve({ data: [] }),
      ])
      const nameOf = new Map(((clients || []) as { id: string; name: string }[]).map(c => [c.id, c.name]))
      const who = (clientId: string | null) => (clientId && nameOf.get(clientId)) || ''

      const result: Item[] = []
      // Paginabezoeken per klant per dag samenvoegen tot één regel
      const visits = new Map<string, { at: string; clientId: string | null; pages: string[] }>()
      for (const e of (events || []) as PortalEvent[]) {
        if (e.kind === 'doc_open') {
          result.push({
            key: e.id, at: e.created_at, icon: Eye, className: 'bg-emerald-50 text-emerald-600',
            text: `${e.label || 'Document'} geopend`, who: who(e.client_id) || 'via de link in de mail',
          })
          continue
        }
        const key = `${e.client_id}-${dayKey(e.created_at)}`
        const label = portalPageLabel(e.path)
        const visit = visits.get(key)
        if (!visit) visits.set(key, { at: e.created_at, clientId: e.client_id, pages: [label] })
        else if (!visit.pages.includes(label)) visit.pages.push(label)
      }
      for (const [key, v] of visits) {
        result.push({
          key, at: v.at, icon: LayoutDashboard, className: 'bg-primary/10 text-primary',
          text: `Portaal bezocht: ${[...v.pages].reverse().join(', ')}`, who: who(v.clientId),
        })
      }
      for (const t of (tickets || []) as { id: string; number: number; title: string; created_at: string }[]) {
        result.push({
          key: `t-${t.id}`, at: t.created_at, icon: MessageSquare, className: 'bg-amber-50 text-amber-600',
          text: `Ticket #${String(t.number).padStart(3, '0')}: ${t.title}`, who: '',
        })
      }
      for (const c of (chats || []) as { id: string; client_id: string | null; created_at: string; message_count: number }[]) {
        result.push({
          key: `c-${c.id}`, at: c.created_at, icon: MessageCircle, className: 'bg-sky-50 text-sky-600',
          text: `Chatgesprek met de assistent (${Math.round((c.message_count || 0) / 2)} ${Math.round((c.message_count || 0) / 2) === 1 ? 'vraag' : 'vragen'})`,
          who: who(c.client_id),
        })
      }
      result.sort((a, b) => b.at.localeCompare(a.at))
      setItems(result)
      setLoading(false)
    }
    load()
  }, [projectId, idsKey])

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-2">
        Nog geen activiteit. Hier zie je wanneer klanten van dit domein inloggen, welke pagina's ze bekijken en
        wanneer ze offertes, facturen, ontwerpen of vragenlijsten openen via de link in de mail.
      </p>
    )
  }

  const visible = items.slice(0, shown)

  return (
    <div>
      <ul className="space-y-1">
        {visible.map((item, index) => {
          const header = index === 0 || dayKey(visible[index - 1].at) !== dayKey(item.at)
          return (
            <li key={item.key}>
              {header && (
                <p className={`text-[11px] font-semibold text-gray-400 uppercase tracking-wider pb-1.5 ${index > 0 ? 'pt-3' : ''}`}>{formatDay(item.at)}</p>
              )}
              <div className="flex items-start gap-3 py-1.5">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${item.className}`}>
                  <item.icon className="w-3.5 h-3.5" />
                </span>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-sm text-gray-800 break-words">{item.text}</p>
                  {item.who && <p className="text-[11px] text-gray-400">{item.who}</p>}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0 pt-1">{formatTime(item.at)}</span>
              </div>
            </li>
          )
        })}
      </ul>
      {items.length > shown && (
        <button type="button" onClick={() => setShown(n => n + PAGE)}
          className="mt-3 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors">
          Toon meer ({items.length - shown})
        </button>
      )}
    </div>
  )
}
