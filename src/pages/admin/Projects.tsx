import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { applyDefaultTemplates } from '../../lib/applyDefaultTemplates'
import type { Project, ProjectPhase, ProjectClient } from '../../types'
import { Plus, FolderKanban, X, Globe, Calendar, Search, Filter, Archive, ChevronRight, Users } from 'lucide-react'
import { phaseLabels, phaseColors } from '../../components/domain/domainShared'

interface FormData {
  name: string
  url: string
  client_id: string
  current_phase: ProjectPhase
  due_date: string
}

const emptyForm: FormData = { name: '', url: '', client_id: '', current_phase: 'intake', due_date: '' }

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })

// Oude domeinen met alleen projects.client_id krijgen alsnog een project_clients-rij
async function migrateExistingClients(projectList: Project[], existing: Record<string, ProjectClient[]>) {
  const toInsert = projectList
    .filter(p => p.client_id && (!existing[p.id] || existing[p.id].length === 0))
    .map(p => ({ project_id: p.id, client_id: p.client_id!, notify_invoices: true, notify_quotes: true, notify_portal: true }))
  if (toInsert.length === 0) return false
  await supabase.from('project_clients').insert(toInsert)
  return true
}

async function fetchProjectClients(ids: string[]) {
  const { data } = await supabase
    .from('project_clients')
    .select('*, client:clients(id, name, email)')
    .in('project_id', ids)
    .order('created_at')
  const grouped: Record<string, ProjectClient[]> = {}
  for (const pc of data || []) {
    if (!grouped[pc.project_id]) grouped[pc.project_id] = []
    grouped[pc.project_id].push(pc)
  }
  return grouped
}

// Overzicht van alle domeinen als compacte lijst; elk domein opent zijn eigen pagina
export default function Projects() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<FormData>(emptyForm)
  const [creating, setCreating] = useState(false)
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [projectClients, setProjectClients] = useState<Record<string, ProjectClient[]>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [filterPhase, setFilterPhase] = useState<ProjectPhase | 'all'>('all')
  const [filterClient, setFilterClient] = useState('all')
  const [filterLetter, setFilterLetter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active')

  const fetchProjects = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('*, client:clients(id, name, email)')
      .order('created_at', { ascending: false })
    const list = data || []
    setProjects(list)
    if (list.length > 0) {
      const ids = list.map(p => p.id)
      let grouped = await fetchProjectClients(ids)
      if (await migrateExistingClients(list, grouped)) grouped = await fetchProjectClients(ids)
      setProjectClients(grouped)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const load = async () => {
      const [, { data: clientData }] = await Promise.all([
        fetchProjects(),
        supabase.from('clients').select('id, name').order('name'),
      ])
      setClients(clientData || [])
    }
    load()
  }, [fetchProjects])

  const closeForm = () => { setShowForm(false); setFormData(emptyForm) }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    const { data: newProject } = await supabase.from('projects').insert({
      name: formData.name,
      url: formData.url || null,
      client_id: formData.client_id || null,
      current_phase: formData.current_phase,
      due_date: formData.due_date || null,
      status: 'active',
    }).select('id').single()
    if (newProject?.id) {
      // Voor elke fase met exact één template: meteen koppelen
      await applyDefaultTemplates(newProject.id)
      if (formData.client_id) {
        await supabase.from('project_clients').insert({
          project_id: newProject.id,
          client_id: formData.client_id,
          notify_invoices: true,
          notify_quotes: true,
          notify_portal: true,
        })
      }
      setCreating(false)
      closeForm()
      navigate(`/admin/projecten/${newProject.id}`)
      return
    }
    setCreating(false)
    closeForm()
    fetchProjects()
  }

  const clientNames = (project: Project) => {
    const names = (projectClients[project.id] || [])
      .map(pc => (pc.client as unknown as { name: string } | undefined)?.name)
      .filter((n): n is string => Boolean(n))
    if (names.length === 0 && project.client) names.push((project.client as unknown as { name: string }).name)
    return names
  }

  // Na viewMode + zoeken + fase + klant, vóór de letter: bepaalt welke letters actief zijn
  const baseFilteredProjects = projects.filter((p) => {
    const projectStatus = p.status || 'active'
    if (viewMode === 'active' && projectStatus !== 'active') return false
    if (viewMode === 'archived' && projectStatus !== 'archived') return false
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (filterPhase !== 'all' && p.current_phase !== filterPhase) return false
    if (filterClient !== 'all' && p.client_id !== filterClient && !(projectClients[p.id] || []).some(pc => pc.client_id === filterClient)) return false
    return true
  })

  const lettersWithProjects = new Set(
    baseFilteredProjects.map((p) => (p.name?.[0] || '').toLowerCase()).filter((c) => /[a-z]/.test(c))
  )

  const filteredProjects = baseFilteredProjects
    .filter((p) => filterLetter === 'all' || (p.name?.[0] || '').toLowerCase() === filterLetter)
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'))

  const hasFilters = searchQuery || filterPhase !== 'all' || filterClient !== 'all' || filterLetter !== 'all'

  return (
    <div>
      <div className="flex items-center justify-between mb-6 sm:mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Domeinen</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">Beheer je domeinen</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex bg-gray-100 rounded-lg p-1">
            <button type="button" onClick={() => setViewMode('active')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${viewMode === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Actief
            </button>
            <button type="button" onClick={() => setViewMode('archived')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${viewMode === 'archived' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Archive className="w-3.5 h-3.5" />
              Gearchiveerd
            </button>
          </div>
          {viewMode === 'active' && (
            <button onClick={() => { setFormData(emptyForm); setShowForm(true) }}
              className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors text-sm">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nieuw domein</span>
              <span className="sm:hidden">Nieuw</span>
            </button>
          )}
        </div>
      </div>

      {/* Alfabet-balk */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-3 py-2 mb-3 flex items-center gap-1 overflow-x-auto">
        <button type="button" onClick={() => setFilterLetter('all')}
          className={`px-2.5 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors flex-shrink-0 ${filterLetter === 'all' ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
          Alle
        </button>
        <div className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />
        {Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i)).map((letter) => {
          const hasProjects = lettersWithProjects.has(letter)
          const isActive = filterLetter === letter
          return (
            <button key={letter} type="button" onClick={() => setFilterLetter(letter)} disabled={!hasProjects && !isActive}
              className={`w-7 h-7 text-xs sm:text-sm font-medium rounded-md transition-colors flex-shrink-0 uppercase ${
                isActive ? 'bg-primary text-white' : hasProjects ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 cursor-not-allowed'
              }`}>
              {letter}
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Zoeken op domeinnaam..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400" />
          <select value={filterPhase} onChange={(e) => setFilterPhase(e.target.value as ProjectPhase | 'all')}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white cursor-pointer">
            <option value="all">Alle fasen</option>
            {(Object.entries(phaseLabels) as [ProjectPhase, string][]).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white cursor-pointer">
            <option value="all">Alle klanten</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {hasFilters && (
          <span className="text-xs text-gray-400">{filteredProjects.length} van {projects.length} domeinen</span>
        )}
      </div>

      {/* Nieuw domein */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Nieuw domein</h2>
              <button onClick={closeForm} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Domeinnaam</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm"
                  placeholder="bijv. Bakkerij De Gouden Aar" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Website URL</label>
                <div className="relative">
                  <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="url" value={formData.url} onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm"
                    placeholder="https://voorbeeld.nl" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Klant koppelen</label>
                <select value={formData.client_id} onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm">
                  <option value="">Geen klant (later koppelen)</option>
                  {clients.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Verwachte opleverdatum</label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeForm} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Annuleren</button>
                <button type="submit" disabled={creating} className="flex-1 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                  {creating ? 'Aanmaken...' : 'Aanmaken'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lijst */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 animate-pulse" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nog geen domeinen</h3>
          <p className="text-gray-500 mt-1">Maak je eerste domein aan om te beginnen.</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Geen resultaten</h3>
          <p className="text-gray-500 mt-1">Pas je filters aan om domeinen te vinden.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_8rem_8rem_1.5rem] gap-4 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            <span>Domein</span>
            <span>Klant</span>
            <span>Fase</span>
            <span>Oplevering</span>
            <span />
          </div>
          <ul className="divide-y divide-gray-100">
            {filteredProjects.map((project) => {
              const names = clientNames(project)
              return (
                <li key={project.id}>
                  <Link to={`/admin/projecten/${project.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_8rem_8rem_1.5rem] gap-x-4 gap-y-1 items-center px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{project.name}</p>
                      {project.url && (
                        <p className="text-xs text-gray-400 truncate">{project.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>
                      )}
                    </div>
                    <div className="min-w-0 hidden md:flex items-center gap-1.5 text-sm text-gray-600">
                      {names.length > 0 ? (
                        <>
                          <Users className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                          <span className="truncate">{names.join(', ')}</span>
                        </>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </div>
                    <div className="md:block">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${phaseColors[project.current_phase]}`}>
                        {phaseLabels[project.current_phase]}
                      </span>
                    </div>
                    <div className="hidden md:block text-sm text-gray-600">
                      {project.due_date ? formatDate(project.due_date) : <span className="text-gray-300">—</span>}
                    </div>
                    <ChevronRight className="hidden md:block w-4 h-4 text-gray-300" />
                    {/* Telefoon: klant en opleverdatum op een tweede regel */}
                    {(names.length > 0 || project.due_date) && (
                      <p className="md:hidden col-span-2 text-xs text-gray-500 truncate">
                        {[names.join(', '), project.due_date ? `oplevering ${formatDate(project.due_date)}` : ''].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
