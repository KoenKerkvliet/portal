import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Project, PunchCard, PunchCardUse } from '../../types'
import { Wrench, Gift, Globe, ExternalLink, Loader2, Ticket, Clock, History, ChevronDown } from 'lucide-react'

interface HistoryEntry {
  key: string
  used_at: string
  description: string
  strips: number
  minutes: number
  cardIds: string[]
}

// Eén tijdregistratie schrijft per strip een rij weg; voeg die samen tot één regel
function groupUses(uses: PunchCardUse[]): HistoryEntry[] {
  const entries = new Map<string, HistoryEntry>()
  for (const use of uses) {
    const key = `${use.used_at}|${use.description}`
    const entry = entries.get(key)
    if (entry) {
      entry.strips += 1
      entry.minutes += use.duration_minutes || 0
      if (!entry.cardIds.includes(use.punch_card_id)) entry.cardIds.push(use.punch_card_id)
    } else {
      entries.set(key, {
        key,
        used_at: use.used_at,
        description: use.description,
        strips: 1,
        minutes: use.duration_minutes || 0,
        cardIds: [use.punch_card_id],
      })
    }
  }
  return [...entries.values()].sort((a, b) => b.used_at.localeCompare(a.used_at))
}

export default function Onderhoud() {
  const [projects, setProjects] = useState<Project[]>([])
  const [punchCards, setPunchCards] = useState<Record<string, PunchCard[]>>({})
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const [gifting, setGifting] = useState<string | null>(null)
  const [giftPunches, setGiftPunches] = useState<Record<string, number>>({})
  const [showGiftPicker, setShowGiftPicker] = useState<string | null>(null)
  const [openHistory, setOpenHistory] = useState<string | null>(null)
  const [history, setHistory] = useState<Record<string, HistoryEntry[]>>({})
  const [loadingHistory, setLoadingHistory] = useState<string | null>(null)

  const fetchData = async () => {
    const { data: projectData } = await supabase
      .from('projects')
      .select('*, client:clients(id, name, email)')
      .eq('current_phase', 'onderhoud')
      .eq('status', 'active')
      .order('name')

    const projects = projectData || []
    setProjects(projects)

    if (projects.length > 0) {
      const projectIds = projects.map(p => p.id)
      const { data: cardsData } = await supabase
        .from('punch_cards')
        .select('*')
        .in('project_id', projectIds)
        .order('number')

      const grouped: Record<string, PunchCard[]> = {}
      for (const card of cardsData || []) {
        if (!grouped[card.project_id]) grouped[card.project_id] = []
        grouped[card.project_id].push(card)
      }
      setPunchCards(grouped)
    }

    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const giftCard = async (projectId: string) => {
    const punches = giftPunches[projectId] || 6
    setGifting(projectId)
    const existingCards = punchCards[projectId] || []
    const maxNumber = existingCards.length > 0
      ? Math.max(...existingCards.map(c => c.number))
      : 0

    await supabase.from('punch_cards').insert({
      project_id: projectId,
      number: maxNumber + 1,
      total_punches: punches,
      used_punches: 0,
      is_gift: true,
      price: 0,
      status: 'active',
      purchased_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    })

    setGifting(null)
    setShowGiftPicker(null)
    fetchData()
  }

  const toggleHistory = async (projectId: string) => {
    if (openHistory === projectId) {
      setOpenHistory(null)
      return
    }
    setOpenHistory(projectId)

    const cardIds = (punchCards[projectId] || []).map(c => c.id)
    if (cardIds.length === 0) {
      setHistory(prev => ({ ...prev, [projectId]: [] }))
      return
    }

    setLoadingHistory(projectId)
    const { data } = await supabase
      .from('punch_card_uses')
      .select('*')
      .in('punch_card_id', cardIds)
      .order('used_at', { ascending: false })
    setHistory(prev => ({ ...prev, [projectId]: groupUses(data || []) }))
    setLoadingHistory(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Onderhoud</h1>
        <p className="text-sm text-gray-500 mt-1">Beheer strippenkaarten voor domeinen in de onderhoudsfase.</p>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Wrench className="w-8 h-8 text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Geen domeinen in onderhoud</h3>
          <p className="text-sm text-gray-500">Er zijn momenteel geen domeinen in de onderhoudsfase.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {projects.map((project) => {
            const cards = punchCards[project.id] || []
            const activeCards = cards.filter(c => c.status === 'active')
            const totalRemaining = activeCards.reduce((sum, c) => sum + (c.total_punches - c.used_punches), 0)
            const clientName = (project.client as unknown as { name: string })?.name || ''
            const isGifting = gifting === project.id
            const isHistoryOpen = openHistory === project.id
            const projectHistory = history[project.id]
            const cardsById = new Map(cards.map(c => [c.id, c]))

            return (
              <div key={project.id} className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                {/* Card header */}
                <div className="px-6 py-5 border-b border-gray-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-gray-900 truncate">{project.name}</h3>
                      {project.url && (
                        <a href={project.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-1 transition-colors">
                          <Globe className="w-3 h-3" />
                          <span className="truncate">{project.url.replace(/^https?:\/\//, '')}</span>
                          <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                        </a>
                      )}
                      {clientName && (
                        <p className="text-xs text-gray-400 mt-1">{clientName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
                        totalRemaining > 0
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-red-50 text-red-600 border border-red-200'
                      }`}>
                        <Ticket className="w-3.5 h-3.5" />
                        {totalRemaining} strips
                      </div>
                    </div>
                  </div>
                </div>

                {/* Active cards overview */}
                <div className="px-6 py-4">
                  {activeCards.length > 0 ? (
                    <div className="space-y-2">
                      {activeCards.map((card) => {
                        const remaining = card.total_punches - card.used_punches
                        const percentage = (remaining / card.total_punches) * 100
                        return (
                          <div key={card.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              card.is_gift ? 'bg-purple-100' : 'bg-purple-50'
                            }`}>
                              {card.is_gift ? (
                                <Gift className="w-4 h-4 text-purple-500" />
                              ) : (
                                <span className="text-xs font-bold text-purple-600">{card.number}</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-gray-700">
                                  {card.is_gift ? `Cadeau #${card.number}` : `Kaart #${card.number}`}
                                </span>
                                <span className="text-xs text-gray-500">{remaining}/{card.total_punches}</span>
                              </div>
                              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    percentage > 50 ? 'bg-emerald-400' : percentage > 20 ? 'bg-amber-400' : 'bg-red-400'
                                  }`}
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-3">Geen actieve strippenkaarten</p>
                  )}
                </div>

                {/* Historie afgeschreven strippen */}
                {isHistoryOpen && (
                  <div className="px-6 py-4 border-t border-gray-100">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Historie afgeschreven strippen</h4>
                    {loadingHistory === project.id || !projectHistory ? (
                      <div className="flex justify-center py-3">
                        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                      </div>
                    ) : projectHistory.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">Nog geen strippen afgeschreven</p>
                    ) : (
                      <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {projectHistory.map((entry) => {
                          const cardLabels = entry.cardIds
                            .map(id => cardsById.get(id))
                            .filter((c): c is PunchCard => !!c)
                            .map(c => (c.is_gift ? `Cadeau #${c.number}` : `Kaart #${c.number}`))
                          return (
                            <li key={entry.key} className="flex items-start gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] text-gray-400">
                                  {new Date(entry.used_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                                  {' · '}
                                  {new Date(entry.used_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                                  {cardLabels.length > 0 && ` · ${cardLabels.join(', ')}`}
                                </p>
                                <p className="text-xs text-gray-700 mt-0.5 break-words">{entry.description}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-xs font-bold text-purple-600">
                                  {entry.strips} {entry.strips === 1 ? 'strip' : 'strips'}
                                </p>
                                {entry.minutes > 0 && (
                                  <p className="text-[11px] text-gray-400">{entry.minutes} min</p>
                                )}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {/* Footer actions */}
                <div className="px-6 py-3 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => navigate(`/admin/onderhoud/${project.id}/timer`)}
                      className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      Tijd loggen
                    </button>
                    <button
                      onClick={() => toggleHistory(project.id)}
                      className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      <History className="w-3.5 h-3.5" />
                      Historie
                      <ChevronDown className={`w-3 h-3 transition-transform ${isHistoryOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  <div>
                  {showGiftPicker === project.id ? (
                    <div className="flex items-center gap-3">
                      <select
                        value={giftPunches[project.id] || 6}
                        onChange={(e) => setGiftPunches(prev => ({ ...prev, [project.id]: Number(e.target.value) }))}
                        className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-300"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                          <option key={n} value={n}>{n} strippen</option>
                        ))}
                      </select>
                      <button
                        onClick={() => giftCard(project.id)}
                        disabled={isGifting}
                        className="flex items-center gap-1.5 text-xs font-medium bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                      >
                        {isGifting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gift className="w-3.5 h-3.5" />}
                        Schenken
                      </button>
                      <button
                        onClick={() => setShowGiftPicker(null)}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        Annuleren
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowGiftPicker(project.id)}
                      className="flex items-center gap-1.5 text-xs font-medium text-purple-600 hover:text-purple-700 transition-colors"
                    >
                      <Gift className="w-3.5 h-3.5" />
                      Strippenkaart schenken
                    </button>
                  )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
