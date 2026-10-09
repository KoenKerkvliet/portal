import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Project, WorkLog } from '../../types'
import { Plus, Pencil, Trash2, Search, ClipboardList, Clock, Globe, Calendar, Receipt, ChevronLeft, ChevronRight } from 'lucide-react'
import DOMPurify from 'dompurify'
import WorkLogForm from '../../components/WorkLogForm'
import { WORK_LOG_CATEGORIES as CATEGORIES, formatDuration, htmlToText, isHtml, todayISO } from '../../lib/workLogs'


const PAGE_SIZES = [10, 20, 50]
const PAGE_SIZE_STORAGE_KEY = 'werkzaamheden-page-size'

const readPageSize = () => {
  try {
    const stored = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY))
    return PAGE_SIZES.includes(stored) ? stored : PAGE_SIZES[0]
  } catch {
    return PAGE_SIZES[0]
  }
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

const monthKey = (iso: string) => iso.slice(0, 7)

const formatMonth = (key: string) =>
  new Date(`${key}-01T00:00:00`).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })

export default function Werkzaamheden() {
  const [logs, setLogs] = useState<WorkLog[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingLog, setEditingLog] = useState<WorkLog | null>(null)
  // Het formulier (en de editor) bij elke nieuwe invoer opnieuw mounten
  const [formKey, setFormKey] = useState(0)
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(readPageSize)

  const fetchData = async () => {
    const [{ data: logData }, { data: projectData }] = await Promise.all([
      supabase
        .from('work_logs')
        .select('*, project:projects(id, name, url, status)')
        .order('performed_at', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name, status').order('name'),
    ])
    setLogs(logData || [])
    setProjects((projectData || []) as Project[])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const openNew = () => {
    setEditingLog(null)
    setFormKey((k) => k + 1)
    setShowForm(true)
  }

  const handleEdit = (log: WorkLog) => {
    setEditingLog(log)
    setFormKey((k) => k + 1)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingLog(null)
  }

  const handleSaved = () => {
    handleCancel()
    fetchData()
  }

  const handleDelete = async (log: WorkLog) => {
    if (!confirm(`Werkzaamheid "${log.title}" verwijderen?`)) return
    await supabase.from('work_logs').delete().eq('id', log.id)
    fetchData()
  }

  const filtered = logs.filter((log) => {
    if (projectFilter && log.project_id !== projectFilter) return false
    if (categoryFilter && log.category !== categoryFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const projectName = (log.project as unknown as { name?: string })?.name || ''
      if (
        !log.title.toLowerCase().includes(q) &&
        !htmlToText(log.description).toLowerCase().includes(q) &&
        !projectName.toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  const totalMinutes = filtered.reduce((sum, l) => sum + l.duration_minutes, 0)
  const thisMonth = monthKey(todayISO())
  const monthMinutes = filtered
    .filter((l) => monthKey(l.performed_at) === thisMonth)
    .reduce((sum, l) => sum + l.duration_minutes, 0)

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * pageSize
  const pageLogs = filtered.slice(pageStart, pageStart + pageSize)

  // Maandtotalen over alle gefilterde logs, niet alleen de huidige pagina
  const minutesByMonth = new Map<string, number>()
  for (const log of filtered) {
    const key = monthKey(log.performed_at)
    minutesByMonth.set(key, (minutesByMonth.get(key) || 0) + log.duration_minutes)
  }

  const grouped: { key: string; logs: WorkLog[] }[] = []
  for (const log of pageLogs) {
    const key = monthKey(log.performed_at)
    const last = grouped[grouped.length - 1]
    if (last && last.key === key) last.logs.push(log)
    else grouped.push({ key, logs: [log] })
  }

  const changePageSize = (size: number) => {
    setPageSize(size)
    setPage(1)
    try { localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size)) } catch { /* niet opslaan is prima */ }
  }

  const goToPage = (target: number) => {
    setPage(target)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Werkzaamheden</h1>
          <p className="text-gray-500 mt-1">Leg per domein vast wat je hebt gedaan en wanneer.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nieuwe werkzaamheid
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-6">
          <WorkLogForm key={formKey} projects={projects} defaultProjectId={projectFilter} log={editingLog}
            onSaved={handleSaved} onCancel={handleCancel} />
        </div>
      )}

      {/* Stats */}
      {!loading && logs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Vastgelegd</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{filtered.length} {filtered.length === 1 ? 'log' : 'logs'}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Totale tijd</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{formatDuration(totalMinutes)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Deze maand</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{formatDuration(monthMinutes)}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      {!loading && logs.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
              placeholder="Zoek op titel, omschrijving of domein..."
            />
          </div>
          <select
            value={projectFilter}
            onChange={(e) => { setProjectFilter(e.target.value); setPage(1) }}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
          >
            <option value="">Alle domeinen</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1) }}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
          >
            <option value="">Alle categorieën</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm animate-pulse"><div className="h-16" /></div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 shadow-sm border border-gray-100 text-center">
          <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nog geen werkzaamheden</h3>
          <p className="text-gray-500 mt-1">Leg vast wat je op een website hebt gedaan, zodat je het later kunt terugvinden.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 shadow-sm border border-gray-100 text-center">
          <p className="text-sm text-gray-400">Geen werkzaamheden gevonden met deze filters.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
              <div key={group.key}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{formatMonth(group.key)}</h2>
                  <span className="text-xs text-gray-400">{formatDuration(minutesByMonth.get(group.key) || 0)}</span>
                </div>
                <div className="space-y-3">
                  {group.logs.map((log) => {
                    const category = CATEGORIES.find((c) => c.value === log.category) || CATEGORIES[CATEGORIES.length - 1]
                    const project = log.project as unknown as { name?: string } | undefined
                    return (
                      <div key={log.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 hover:border-gray-200 transition-colors group">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-gray-900">{log.title}</h3>
                              <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${category.className}`}>
                                {category.label}
                              </span>
                              {log.billable && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-[11px] font-medium rounded-full">
                                  <Receipt className="w-3 h-3" />
                                  Facturabel
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-400">
                              <span className="inline-flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                {project?.name || 'Onbekend domein'}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDate(log.performed_at)}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDuration(log.duration_minutes)}
                              </span>
                            </div>
                            {log.description && (isHtml(log.description) ? (
                              <div
                                className="text-sm text-gray-600 mt-2 prose-worklog"
                                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(log.description) }}
                              />
                            ) : (
                              <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{log.description}</p>
                            ))}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button
                              onClick={() => handleEdit(log)}
                              className="p-1.5 text-gray-400 hover:text-primary rounded-lg hover:bg-primary/5 transition-colors"
                              title="Bewerken"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(log)}
                              className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                              title="Verwijderen"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
          ))}

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>Toon</span>
              <select
                value={pageSize}
                onChange={(e) => changePageSize(Number(e.target.value))}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
              <span>per pagina</span>
              <span className="text-gray-300 mx-1">·</span>
              <span>
                {pageStart + 1}–{pageStart + pageLogs.length} van {filtered.length}
              </span>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                  title="Vorige pagina"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {pageNumbers(currentPage, totalPages).map((n, i) =>
                  n === null ? (
                    <span key={`gap-${i}`} className="px-1.5 text-sm text-gray-400">…</span>
                  ) : (
                    <button
                      key={n}
                      type="button"
                      onClick={() => goToPage(n)}
                      className={`min-w-[2.25rem] px-2 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        n === currentPage
                          ? 'bg-primary/10 text-primary'
                          : 'text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {n}
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                  title="Volgende pagina"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Paginanummers met weglatingstekens: 1 … 4 5 6 … 12
function pageNumbers(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set([1, total, current - 1, current, current + 1])
  const sorted = [...pages].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  const result: (number | null)[] = []
  for (const n of sorted) {
    const prev = result[result.length - 1]
    if (typeof prev === 'number' && n - prev > 1) result.push(null)
    result.push(n)
  }
  return result
}
