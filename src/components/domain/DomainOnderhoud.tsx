import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { groupUses, type HistoryEntry } from '../../lib/punchCardHistory'
import type { PunchCard, WorkLog } from '../../types'
import { Gift, Ticket, Clock, ClipboardList, Loader2, ArrowRight, Plus, Pencil, Trash2 } from 'lucide-react'
import AddPunchCard from '../AddPunchCard'
import WorkLogForm from '../WorkLogForm'
import { formatDuration } from '../../lib/workLogs'

const HISTORY_LIMIT = 8
const WORK_LOG_LIMIT = 5

const formatDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })

const cardLabel = (card: PunchCard) => (card.is_gift ? `Cadeau #${card.number}` : `Kaart #${card.number}`)

export default function DomainOnderhoud({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<PunchCard[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([])
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [showAllLogs, setShowAllLogs] = useState(false)
  // Na toevoegen opnieuw laden; telt op zodat de effect opnieuw draait
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey(k => k + 1)
  const [showWorkLogForm, setShowWorkLogForm] = useState(false)
  const [editingLog, setEditingLog] = useState<WorkLog | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: cardData }, { data: logData }] = await Promise.all([
        supabase.from('punch_cards').select('*').eq('project_id', projectId).order('number'),
        supabase
          .from('work_logs')
          .select('*')
          .eq('project_id', projectId)
          .order('performed_at', { ascending: false })
          .order('created_at', { ascending: false }),
      ])
      const projectCards = cardData || []
      setCards(projectCards)
      setWorkLogs(logData || [])

      if (projectCards.length > 0) {
        const { data: useData } = await supabase
          .from('punch_card_uses')
          .select('*')
          .in('punch_card_id', projectCards.map(c => c.id))
          .order('used_at', { ascending: false })
        setHistory(groupUses(useData || []))
      }
      setLoading(false)
    }
    fetchData()
  }, [projectId, reloadKey])

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
      </div>
    )
  }

  const activeCards = cards.filter(c => c.status === 'active')
  const totalRemaining = activeCards.reduce((sum, c) => sum + (c.total_punches - c.used_punches), 0)
  const cardsById = new Map(cards.map(c => [c.id, c]))
  const visibleHistory = showAllHistory ? history : history.slice(0, HISTORY_LIMIT)
  const visibleLogs = showAllLogs ? workLogs : workLogs.slice(0, WORK_LOG_LIMIT)

  const openWorkLogForm = (log: WorkLog | null) => {
    setEditingLog(log)
    setShowWorkLogForm(true)
  }

  const closeWorkLogForm = () => {
    setShowWorkLogForm(false)
    setEditingLog(null)
  }

  const deleteWorkLog = async (log: WorkLog) => {
    if (!confirm(`Werkzaamheid "${log.title}" verwijderen?`)) return
    await supabase.from('work_logs').delete().eq('id', log.id)
    reload()
  }

  const toggleAll = (expanded: boolean, setExpanded: (v: boolean) => void, total: number) => (
    <button type="button" onClick={() => setExpanded(!expanded)}
      className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors">
      {expanded ? 'Toon minder' : `Toon alle ${total}`}
    </button>
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Strippenkaarten */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Strippenkaarten</h4>
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
            totalRemaining > 0
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-600 border border-red-200'
          }`}>
            <Ticket className="w-3.5 h-3.5" />
            {totalRemaining} strips over
          </span>
        </div>

        {activeCards.length > 0 ? (
          <div className="space-y-2">
            {activeCards.map((card) => {
              const remaining = card.total_punches - card.used_punches
              const percentage = (remaining / card.total_punches) * 100
              return (
                <div key={card.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5 border border-gray-100">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-purple-50">
                    {card.is_gift ? <Gift className="w-3.5 h-3.5 text-purple-500" /> : <span className="text-xs font-bold text-purple-600">{card.number}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">{cardLabel(card)}</span>
                      <span className="text-xs text-gray-500">{remaining}/{card.total_punches}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${percentage > 50 ? 'bg-emerald-400' : percentage > 20 ? 'bg-amber-400' : 'bg-red-400'}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-400">Geen actieve strippenkaart.</p>
        )}

        <div>
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Laatst afgeschreven</p>
          {history.length === 0 ? (
            <p className="text-xs text-gray-400">Nog geen strippen afgeschreven.</p>
          ) : (
            <ul className="space-y-1.5">
              {visibleHistory.map((entry) => {
                const labels = entry.cardIds
                  .map(id => cardsById.get(id))
                  .filter((c): c is PunchCard => !!c)
                  .map(cardLabel)
                return (
                  <li key={entry.key} className="flex items-start gap-3 bg-white rounded-lg px-3 py-2 border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-400">
                        {formatDate(entry.used_at)}{labels.length > 0 && ` · ${labels.join(', ')}`}
                      </p>
                      <p className="text-xs text-gray-700 break-words">{entry.description}</p>
                    </div>
                    <span className="text-xs font-bold text-purple-600 flex-shrink-0">
                      {entry.strips} {entry.strips === 1 ? 'strip' : 'strips'}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          {history.length > HISTORY_LIMIT && <div className="mt-1.5">{toggleAll(showAllHistory, setShowAllHistory, history.length)}</div>}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          <Link to={`/admin/onderhoud/${projectId}/timer`}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors">
            <Clock className="w-3.5 h-3.5" />
            Tijd loggen
          </Link>
          <Link to="/admin/onderhoud"
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors">
            Alle domeinen
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="pt-1">
          <AddPunchCard projectId={projectId} align="start"
            nextNumber={cards.length > 0 ? Math.max(...cards.map(c => c.number)) + 1 : 1}
            onAdded={reload} />
        </div>
      </div>

      {/* Werkzaamheden */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Werkzaamheden</h4>
          <span className="text-xs text-gray-400">{workLogs.length} in totaal</span>
        </div>

        {workLogs.length === 0 ? (
          <p className="text-xs text-gray-400">Nog geen werkzaamheden gelogd voor dit domein.</p>
        ) : (
          <ul className="space-y-1.5">
            {visibleLogs.map((log) => (
              <li key={log.id} className="group flex items-start gap-3 bg-white rounded-lg px-3 py-2 border border-gray-100">
                <ClipboardList className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{log.title}</p>
                  <p className="text-[11px] text-gray-400 capitalize">{formatDate(log.performed_at)} · {log.category}</p>
                </div>
                <span className="text-xs text-gray-500 flex-shrink-0">{formatDuration(log.duration_minutes)}</span>
                <div className="flex items-center flex-shrink-0 -my-1 -mr-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button type="button" onClick={() => openWorkLogForm(log)} title="Bewerken"
                    className="p-1 text-gray-400 hover:text-primary rounded-md hover:bg-primary/5 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => deleteWorkLog(log)} title="Verwijderen"
                    className="p-1 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {workLogs.length > WORK_LOG_LIMIT && toggleAll(showAllLogs, setShowAllLogs, workLogs.length)}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          <button type="button" onClick={() => openWorkLogForm(null)}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-600 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Werkzaamheid toevoegen
          </button>
          <Link to="/admin/werkzaamheden"
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors">
            Alle werkzaamheden
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Werkzaamheid vastleggen of bewerken voor dit domein, zonder de pagina te verlaten */}
      {showWorkLogForm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 pt-[5vh] overflow-y-auto"
          onClick={closeWorkLogForm}>
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <WorkLogForm projectId={projectId} log={editingLog}
              onSaved={() => { closeWorkLogForm(); reload() }}
              onCancel={closeWorkLogForm} />
          </div>
        </div>
      )}
    </div>
  )
}
