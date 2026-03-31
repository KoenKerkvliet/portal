import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import type { Project, ProjectPhase } from '../../types'
import { Plus, FolderKanban, Trash2, Pencil, X, Globe, ExternalLink, ChevronDown } from 'lucide-react'

const phaseLabels: Record<ProjectPhase, string> = {
  intake: 'Intake',
  design: 'Design',
  development: 'Development',
  oplevering: 'Oplevering',
  onderhoud: 'Onderhoud',
}

const phaseColors: Record<ProjectPhase, string> = {
  intake: 'bg-blue-100 text-blue-700',
  design: 'bg-purple-100 text-purple-700',
  development: 'bg-yellow-100 text-yellow-700',
  oplevering: 'bg-green-100 text-green-700',
  onderhoud: 'bg-emerald-100 text-emerald-700',
}

interface FormData {
  name: string
  url: string
  client_id: string
  current_phase: ProjectPhase
}

const emptyForm: FormData = { name: '', url: '', client_id: '', current_phase: 'intake' }

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(emptyForm)
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [phaseDropdownId, setPhaseDropdownId] = useState<string | null>(null)
  const phaseDropdownRef = useRef<HTMLDivElement>(null)

  // Close phase dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (phaseDropdownRef.current && !phaseDropdownRef.current.contains(e.target as Node)) {
        setPhaseDropdownId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handlePhaseChange = async (project: Project, newPhase: ProjectPhase) => {
    setPhaseDropdownId(null)
    if (newPhase === project.current_phase) return

    const confirmed = confirm(
      `Fase van "${project.name}" wijzigen van ${phaseLabels[project.current_phase]} naar ${phaseLabels[newPhase]}?`
    )
    if (!confirmed) return

    await supabase.from('projects').update({ current_phase: newPhase }).eq('id', project.id)
    fetchProjects()
  }

  const fetchProjects = async () => {
    const { data } = await supabase
      .from('projects')
      .select('*, client:clients(id, name, email)')
      .order('created_at', { ascending: false })
    setProjects(data || [])
    setLoading(false)
  }

  const fetchClients = async () => {
    const { data } = await supabase.from('clients').select('id, name').order('name')
    setClients(data || [])
  }

  useEffect(() => {
    fetchProjects()
    fetchClients()
  }, [])

  const openCreate = () => {
    setFormData(emptyForm)
    setEditingId(null)
    setShowForm(true)
  }

  const openEdit = (project: Project) => {
    setFormData({
      name: project.name,
      url: project.url || '',
      client_id: project.client_id || '',
      current_phase: project.current_phase,
    })
    setEditingId(project.id)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData(emptyForm)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      name: formData.name,
      url: formData.url || null,
      client_id: formData.client_id || null,
      current_phase: formData.current_phase,
      status: 'active' as const,
    }

    if (editingId) {
      await supabase.from('projects').update(payload).eq('id', editingId)
    } else {
      await supabase.from('projects').insert(payload)
    }

    closeForm()
    fetchProjects()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit project wilt verwijderen?')) return
    await supabase.from('projects').delete().eq('id', id)
    fetchProjects()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Projecten</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">Beheer je webdesign projecten</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nieuw project</span>
          <span className="sm:hidden">Nieuw</span>
        </button>
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? 'Project bewerken' : 'Nieuw project'}
              </h2>
              <button onClick={closeForm} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Projectnaam</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm"
                  placeholder="bijv. Website Bakkerij De Gouden Aar"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Website URL</label>
                <div className="relative">
                  <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="url"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm"
                    placeholder="https://voorbeeld.nl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Klant koppelen</label>
                <select
                  value={formData.client_id}
                  onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm"
                >
                  <option value="">Geen klant (later koppelen)</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Je kunt later alsnog een klant koppelen via bewerken.</p>
              </div>

              {editingId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Huidige fase</label>
                  <select
                    value={formData.current_phase}
                    onChange={(e) => setFormData({ ...formData, current_phase: e.target.value as ProjectPhase })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm"
                  >
                    {Object.entries(phaseLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeForm} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  Annuleren
                </button>
                <button type="submit" className="flex-1 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
                  {editingId ? 'Opslaan' : 'Aanmaken'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Projects list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm animate-pulse"><div className="h-20" /></div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nog geen projecten</h3>
          <p className="text-gray-500 mt-1">Maak je eerste project aan om te beginnen.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <div key={project.id} className="bg-white rounded-xl p-5 sm:p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{project.name}</h3>
                    <div className="relative" ref={phaseDropdownId === project.id ? phaseDropdownRef : undefined}>
                      <button
                        onClick={() => setPhaseDropdownId(phaseDropdownId === project.id ? null : project.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${phaseColors[project.current_phase]}`}
                      >
                        {phaseLabels[project.current_phase]}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {phaseDropdownId === project.id && (
                        <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl shadow-xl shadow-gray-200/50 border border-gray-100 py-1 z-50 min-w-[160px]">
                          {(Object.entries(phaseLabels) as [ProjectPhase, string][]).map(([key, label]) => (
                            <button
                              key={key}
                              onClick={() => handlePhaseChange(project, key)}
                              className={`flex items-center gap-2.5 w-full px-3.5 py-2 text-sm transition-colors ${
                                key === project.current_phase
                                  ? 'bg-gray-50 font-medium text-gray-900'
                                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                              }`}
                            >
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                key === project.current_phase ? 'bg-primary' : 'bg-gray-300'
                              }`} />
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {project.url && (
                    <a
                      href={project.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary-600 mt-1 transition-colors"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      {project.url.replace(/^https?:\/\//, '')}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  <div className="flex items-center gap-3 mt-2">
                    {project.client_id ? (
                      <span className="text-sm text-gray-500">
                        Klant: <span className="font-medium text-gray-700">{(project.client as unknown as { name: string })?.name}</span>
                      </span>
                    ) : (
                      <span className="text-sm text-amber-500 font-medium">Geen klant gekoppeld</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(project)}
                    className="p-2 text-gray-400 hover:text-primary rounded-lg hover:bg-primary/5 transition-colors"
                    title="Bewerken"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(project.id)}
                    className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                    title="Verwijderen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
