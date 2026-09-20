import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Project, WorkLog, WorkLogCategory } from '../../types'
import { Plus, X, Pencil, Trash2, Search, ClipboardList, Clock, Globe, Calendar, Receipt } from 'lucide-react'

const CATEGORIES: { value: WorkLogCategory; label: string; className: string }[] = [
  { value: 'onderhoud', label: 'Onderhoud', className: 'bg-emerald-50 text-emerald-700' },
  { value: 'update', label: 'Update', className: 'bg-blue-50 text-blue-700' },
  { value: 'bugfix', label: 'Bugfix', className: 'bg-red-50 text-red-600' },
  { value: 'content', label: 'Content', className: 'bg-amber-50 text-amber-700' },
  { value: 'design', label: 'Design', className: 'bg-pink-50 text-pink-700' },
  { value: 'development', label: 'Development', className: 'bg-indigo-50 text-indigo-700' },
  { value: 'seo', label: 'SEO', className: 'bg-teal-50 text-teal-700' },
  { value: 'beveiliging', label: 'Beveiliging', className: 'bg-orange-50 text-orange-700' },
  { value: 'overleg', label: 'Overleg', className: 'bg-purple-50 text-purple-700' },
  { value: 'overig', label: 'Overig', className: 'bg-gray-100 text-gray-600' },
]

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120]

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const emptyForm = {
  project_id: '',
  performed_at: todayISO(),
  title: '',
  description: '',
  duration_minutes: '30',
  category: 'onderhoud' as WorkLogCategory,
  billable: false,
}

const formatDuration = (minutes: number) => {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h}u ${m}m`
  if (h) return `${h}u`
  return `${m}m`
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
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

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
    setFormData({ ...emptyForm, performed_at: todayISO(), project_id: projectFilter || '' })
    setEditingId(null)
    setShowForm(true)
  }

  const handleEdit = (log: WorkLog) => {
    setFormData({
      project_id: log.project_id,
      performed_at: log.performed_at,
      title: log.title,
      description: log.description,
      duration_minutes: String(log.duration_minutes),
      category: log.category,
      billable: log.billable,
    })
    setEditingId(log.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData(emptyForm)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.project_id || !formData.title.trim()) return
    setSaving(true)

    const payload = {
      project_id: formData.project_id,
      performed_at: formData.performed_at,
      title: formData.title.trim(),
      description: formData.description.trim(),
      duration_minutes: parseInt(formData.duration_minutes) || 0,
      category: formData.category,
      billable: formData.billable,
    }

    if (editingId) {
      await supabase.from('work_logs').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingId)
    } else {
      await supabase.from('work_logs').insert(payload)
    }

    setSaving(false)
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
        !log.description.toLowerCase().includes(q) &&
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

  const grouped: { key: string; logs: WorkLog[] }[] = []
  for (const log of filtered) {
    const key = monthKey(log.performed_at)
    const last = grouped[grouped.length - 1]
    if (last && last.key === key) last.logs.push(log)
    else grouped.push({ key, logs: [log] })
  }

  const inputClass = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all'

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
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">
              {editingId ? 'Werkzaamheid bewerken' : 'Nieuwe werkzaamheid vastleggen'}
            </h2>
            <button type="button" onClick={handleCancel} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Domein</label>
              <select
                value={formData.project_id}
                onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                className={inputClass}
                required
              >
                <option value="">Kies een domein...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.status === 'archived' ? ' (gearchiveerd)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Datum</label>
              <input
                type="date"
                value={formData.performed_at}
                onChange={(e) => setFormData({ ...formData, performed_at: e.target.value })}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categorie</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as WorkLogCategory })}
                className={inputClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Titel</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className={inputClass}
                placeholder="Plugins bijgewerkt en cache geleegd"
                required
              />
            </div>

            <div className="lg:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Uitgevoerde werkzaamheden</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className={`${inputClass} resize-y`}
                placeholder="Wat heb je precies gedaan? Denk aan wat je over een jaar nog wilt weten."
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tijdsduur (minuten)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={formData.duration_minutes}
                  onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                  className="w-28 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                />
                <div className="flex flex-wrap gap-1.5">
                  {DURATION_PRESETS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setFormData({ ...formData, duration_minutes: String(m) })}
                      className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                        formData.duration_minutes === String(m)
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {formatDuration(m)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Facturabel</label>
              <div className="flex gap-2 mt-0.5">
                {[
                  { value: false, label: 'Nee' },
                  { value: true, label: 'Ja' },
                ].map((opt) => (
                  <button
                    type="button"
                    key={String(opt.value)}
                    onClick={() => setFormData({ ...formData, billable: opt.value })}
                    className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                      formData.billable === opt.value
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-primary hover:bg-primary-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-medium transition-colors text-sm"
            >
              {saving ? 'Bezig...' : editingId ? 'Opslaan' : 'Vastleggen'}
            </button>
            <button type="button" onClick={handleCancel} className="px-5 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors">
              Annuleren
            </button>
          </div>
        </form>
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
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
              placeholder="Zoek op titel, omschrijving of domein..."
            />
          </div>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
          >
            <option value="">Alle domeinen</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
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
          {grouped.map((group) => {
            const groupMinutes = group.logs.reduce((sum, l) => sum + l.duration_minutes, 0)
            return (
              <div key={group.key}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{formatMonth(group.key)}</h2>
                  <span className="text-xs text-gray-400">{formatDuration(groupMinutes)}</span>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                  {group.logs.map((log) => {
                    const category = CATEGORIES.find((c) => c.value === log.category) || CATEGORIES[CATEGORIES.length - 1]
                    const project = log.project as unknown as { name?: string } | undefined
                    return (
                      <div key={log.id} className="px-5 py-4 hover:bg-gray-50/50 transition-colors group">
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
                            {log.description && (
                              <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{log.description}</p>
                            )}
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
            )
          })}
        </div>
      )}
    </div>
  )
}
