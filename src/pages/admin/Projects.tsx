import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import type { Project, ProjectPhase, PhaseTemplate, PhaseStep } from '../../types'
import { Plus, FolderKanban, Trash2, X, Globe, ExternalLink, ChevronDown, Calendar, Users, Pencil, Layers, Save, RotateCcw } from 'lucide-react'

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
  due_date: string
}

interface ProjectPhaseInstance {
  id: string
  project_id: string
  phase: string
  template_id: string | null
  custom_data: {
    content?: string
    steps?: PhaseStep[]
  } | null
  status: string
}

const emptyForm: FormData = { name: '', url: '', client_id: '', current_phase: 'intake', due_date: '' }

// Inline editable field component
function InlineEdit({
  value,
  onSave,
  type = 'text',
  placeholder,
  icon: Icon,
  displayValue,
}: {
  value: string
  onSave: (value: string) => void
  type?: string
  placeholder?: string
  icon?: React.ComponentType<{ className?: string }>
  displayValue?: string
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  useEffect(() => { setEditValue(value) }, [value])

  const save = () => {
    setEditing(false)
    if (editValue !== value) onSave(editValue)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
        <input ref={inputRef} type={type} value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditValue(value); setEditing(false) } }}
          className="px-2 py-1 bg-white border border-primary/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-0"
          placeholder={placeholder} />
      </div>
    )
  }

  return (
    <button onClick={() => setEditing(true)}
      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 group transition-colors text-left" title="Klik om te bewerken">
      {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
      <span>{displayValue || value || placeholder}</span>
      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0" />
    </button>
  )
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<FormData>(emptyForm)
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [phaseDropdownId, setPhaseDropdownId] = useState<string | null>(null)
  const [clientDropdownId, setClientDropdownId] = useState<string | null>(null)
  const phaseDropdownRef = useRef<HTMLDivElement>(null)
  const clientDropdownRef = useRef<HTMLDivElement>(null)

  // Template instance state
  const [templates, setTemplates] = useState<PhaseTemplate[]>([])
  const [phaseInstances, setPhaseInstances] = useState<Record<string, ProjectPhaseInstance>>({})
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const [editingInstance, setEditingInstance] = useState<{ content: string; steps: PhaseStep[] } | null>(null)
  const [savingInstance, setSavingInstance] = useState(false)
  const [reloadDropdownId, setReloadDropdownId] = useState<string | null>(null)
  const reloadDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (phaseDropdownRef.current && !phaseDropdownRef.current.contains(e.target as Node)) setPhaseDropdownId(null)
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) setClientDropdownId(null)
      if (reloadDropdownRef.current && !reloadDropdownRef.current.contains(e.target as Node)) setReloadDropdownId(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const updateProject = async (id: string, updates: Partial<Project>) => {
    await supabase.from('projects').update(updates).eq('id', id)
    fetchProjects()
  }

  const handlePhaseChange = async (project: Project, newPhase: ProjectPhase) => {
    setPhaseDropdownId(null)
    if (newPhase === project.current_phase) return
    const confirmed = confirm(`Fase van "${project.name}" wijzigen van ${phaseLabels[project.current_phase]} naar ${phaseLabels[newPhase]}?`)
    if (!confirmed) return
    updateProject(project.id, { current_phase: newPhase })
  }

  const handleClientChange = async (project: Project, clientId: string) => {
    setClientDropdownId(null)
    const newClientId = clientId || null
    if (newClientId === project.client_id) return
    updateProject(project.id, { client_id: newClientId } as Partial<Project>)
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

  const fetchTemplates = async () => {
    const { data } = await supabase.from('phase_templates').select('*').order('phase')
    setTemplates(data || [])
  }

  const fetchPhaseInstances = async () => {
    const { data } = await supabase.from('project_phases').select('*')
    const map: Record<string, ProjectPhaseInstance> = {}
    ;(data || []).forEach((pi: ProjectPhaseInstance) => {
      // Key by project_id + phase
      map[`${pi.project_id}_${pi.phase}`] = pi
    })
    setPhaseInstances(map)
  }

  useEffect(() => {
    fetchProjects()
    fetchClients()
    fetchTemplates()
    fetchPhaseInstances()
  }, [])

  const closeForm = () => { setShowForm(false); setFormData(emptyForm) }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('projects').insert({
      name: formData.name,
      url: formData.url || null,
      client_id: formData.client_id || null,
      current_phase: formData.current_phase,
      due_date: formData.due_date || null,
      status: 'active',
    })
    closeForm()
    fetchProjects()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit domein wilt verwijderen?')) return
    await supabase.from('projects').delete().eq('id', id)
    fetchProjects()
  }

  const getClientName = (project: Project) => {
    return (project.client as unknown as { name: string })?.name || null
  }

  // Template instance functions
  const getInstanceKey = (projectId: string, phase: string) => `${projectId}_${phase}`

  const getInstance = (projectId: string, phase: string) => {
    return phaseInstances[getInstanceKey(projectId, phase)] || null
  }

  const getTemplatesForPhase = (phase: string) => {
    return templates.filter(t => t.phase === phase)
  }

  const loadTemplate = async (projectId: string, phase: string, template: PhaseTemplate) => {
    const existing = getInstance(projectId, phase)
    // Copy template steps into custom_data so they can be edited per-domain
    const customData = {
      content: template.content || '',
      steps: template.steps.map(s => ({ ...s, id: crypto.randomUUID() })),
    }

    if (existing) {
      await supabase.from('project_phases').update({
        template_id: template.id,
        custom_data: customData,
      }).eq('id', existing.id)
    } else {
      await supabase.from('project_phases').insert({
        project_id: projectId,
        phase,
        template_id: template.id,
        custom_data: customData,
        status: 'active',
      })
    }
    await fetchPhaseInstances()
    // Open editing
    setEditingInstance({ content: customData.content, steps: customData.steps })
  }

  const openInstanceEditor = (instance: ProjectPhaseInstance) => {
    const customData = instance.custom_data || { content: '', steps: [] }
    setEditingInstance({
      content: customData.content || '',
      steps: customData.steps || [],
    })
  }

  const saveInstance = async (projectId: string, phase: string) => {
    if (!editingInstance) return
    setSavingInstance(true)
    const instance = getInstance(projectId, phase)
    if (instance) {
      await supabase.from('project_phases').update({
        custom_data: editingInstance,
      }).eq('id', instance.id)
    }
    await fetchPhaseInstances()
    setSavingInstance(false)
  }

  const updateInstanceStep = (index: number, field: keyof PhaseStep, value: string | boolean) => {
    if (!editingInstance) return
    const newSteps = [...editingInstance.steps]
    newSteps[index] = { ...newSteps[index], [field]: value }
    setEditingInstance({ ...editingInstance, steps: newSteps })
  }

  const addInstanceStep = () => {
    if (!editingInstance) return
    setEditingInstance({
      ...editingInstance,
      steps: [...editingInstance.steps, { id: crypto.randomUUID(), title: '', description: '', completed: false }],
    })
  }

  const removeInstanceStep = (index: number) => {
    if (!editingInstance) return
    setEditingInstance({
      ...editingInstance,
      steps: editingInstance.steps.filter((_, i) => i !== index),
    })
  }

  const toggleExpand = (projectId: string) => {
    if (expandedProject === projectId) {
      setExpandedProject(null)
      setEditingInstance(null)
    } else {
      setExpandedProject(projectId)
      const project = projects.find(p => p.id === projectId)
      if (project) {
        const instance = getInstance(projectId, project.current_phase)
        if (instance) {
          openInstanceEditor(instance)
        } else {
          setEditingInstance(null)
        }
      }
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Domeinen</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">Beheer je domeinen</p>
        </div>
        <button onClick={() => { setFormData(emptyForm); setShowForm(true) }}
          className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors text-sm">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nieuw domein</span>
          <span className="sm:hidden">Nieuw</span>
        </button>
      </div>

      {/* Create modal */}
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
                <button type="submit" className="flex-1 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">Aanmaken</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Projects list */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm animate-pulse"><div className="h-28" /></div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nog geen domeinen</h3>
          <p className="text-gray-500 mt-1">Maak je eerste domein aan om te beginnen.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => {
            const instance = getInstance(project.id, project.current_phase)
            const phaseTemplates = getTemplatesForPhase(project.current_phase)
            const isExpanded = expandedProject === project.id

            return (
              <div key={project.id} className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow overflow-hidden">
                {/* Card header */}
                <div className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <InlineEdit value={project.name} onSave={(name) => updateProject(project.id, { name })} displayValue={project.name} placeholder="Domeinnaam" />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="relative" ref={phaseDropdownId === project.id ? phaseDropdownRef : undefined}>
                        <button onClick={() => setPhaseDropdownId(phaseDropdownId === project.id ? null : project.id)}
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${phaseColors[project.current_phase]}`}>
                          {phaseLabels[project.current_phase]}
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {phaseDropdownId === project.id && (
                          <div className="absolute top-full right-0 mt-1.5 bg-white rounded-xl shadow-xl shadow-gray-200/50 border border-gray-100 py-1 z-50 min-w-[160px]">
                            {(Object.entries(phaseLabels) as [ProjectPhase, string][]).map(([key, label]) => (
                              <button key={key} onClick={() => handlePhaseChange(project, key)}
                                className={`flex items-center gap-2.5 w-full px-3.5 py-2 text-sm transition-colors ${key === project.current_phase ? 'bg-gray-50 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${key === project.current_phase ? 'bg-primary' : 'bg-gray-300'}`} />
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => handleDelete(project.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors" title="Verwijderen">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Card details */}
                <div className="px-5 sm:px-6 pb-5 sm:pb-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 pt-4 border-t border-gray-100">
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Website</p>
                      {project.url && (
                        <div className="flex items-center gap-1.5">
                          <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:text-primary-600 transition-colors truncate">
                            {project.url.replace(/^https?:\/\//, '')}
                          </a>
                          <ExternalLink className="w-3 h-3 text-primary/50 flex-shrink-0" />
                        </div>
                      )}
                      <InlineEdit value={project.url || ''} onSave={(url) => updateProject(project.id, { url: url || null })} type="url"
                        placeholder={project.url ? 'Wijzig URL' : 'URL toevoegen'} icon={Globe} displayValue={project.url ? '' : 'URL toevoegen'} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Klant</p>
                      <div className="relative" ref={clientDropdownId === project.id ? clientDropdownRef : undefined}>
                        <button onClick={() => setClientDropdownId(clientDropdownId === project.id ? null : project.id)}
                          className="flex items-center gap-1.5 text-sm group transition-colors text-left hover:text-gray-700">
                          <Users className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className={project.client_id ? 'text-gray-700 font-medium' : 'text-amber-500 font-medium'}>
                            {getClientName(project) || 'Klant koppelen'}
                          </span>
                          <ChevronDown className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors" />
                        </button>
                        {clientDropdownId === project.id && (
                          <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl shadow-xl shadow-gray-200/50 border border-gray-100 py-1 z-50 min-w-[200px]">
                            <button onClick={() => handleClientChange(project, '')}
                              className={`flex items-center gap-2.5 w-full px-3.5 py-2 text-sm transition-colors ${!project.client_id ? 'bg-gray-50 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${!project.client_id ? 'bg-primary' : 'bg-gray-300'}`} />
                              Geen klant
                            </button>
                            {clients.map((c) => (
                              <button key={c.id} onClick={() => handleClientChange(project, c.id)}
                                className={`flex items-center gap-2.5 w-full px-3.5 py-2 text-sm transition-colors ${project.client_id === c.id ? 'bg-gray-50 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${project.client_id === c.id ? 'bg-primary' : 'bg-gray-300'}`} />
                                {c.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Opleverdatum</p>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <input type="date" value={project.due_date || ''}
                          onChange={(e) => updateProject(project.id, { due_date: e.target.value || null })}
                          className="text-sm text-gray-700 bg-transparent border-none p-0 focus:outline-none focus:ring-0 cursor-pointer hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Template section toggle */}
                <div className="border-t border-gray-100">
                  <button onClick={() => toggleExpand(project.id)}
                    className="w-full px-5 sm:px-6 py-3 flex items-center justify-between text-sm hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-600">
                        Template — {phaseLabels[project.current_phase]}
                      </span>
                      {instance && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">Ingeladen</span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Expanded template panel */}
                  {isExpanded && (
                    <div className="px-5 sm:px-6 pb-5 sm:pb-6">
                      {/* No instance loaded yet */}
                      {!instance && (
                        <div>
                          {phaseTemplates.length > 0 ? (
                            <div>
                              <p className="text-sm text-gray-500 mb-3">Kies een template om in te laden voor dit domein:</p>
                              <div className="space-y-2">
                                {phaseTemplates.map((t) => (
                                  <button key={t.id} onClick={() => loadTemplate(project.id, project.current_phase, t)}
                                    className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-primary hover:bg-primary/5 transition-colors text-left">
                                    <div>
                                      <p className="text-sm font-medium text-gray-900">{t.title}</p>
                                      <p className="text-xs text-gray-400 mt-0.5">{t.steps?.length || 0} stappen</p>
                                    </div>
                                    <Layers className="w-4 h-4 text-gray-400" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-6">
                              <p className="text-sm text-gray-400">Geen templates beschikbaar voor de fase "{phaseLabels[project.current_phase]}".</p>
                              <p className="text-xs text-gray-400 mt-1">Maak eerst een template aan via het Templates menu.</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Instance loaded — editing */}
                      {instance && editingInstance && (
                        <div className="space-y-4">
                          {/* Reload template option */}
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-gray-400">
                              Template ingeladen. Bewerk hieronder de inhoud specifiek voor dit domein.
                            </p>
                            {phaseTemplates.length > 0 && (
                              <div className="relative" ref={reloadDropdownId === project.id ? reloadDropdownRef : undefined}>
                                {phaseTemplates.length === 1 ? (
                                  // Single template — reload directly
                                  <button onClick={() => { if (confirm('Template opnieuw inladen? Domein-specifieke aanpassingen worden overschreven.')) loadTemplate(project.id, project.current_phase, phaseTemplates[0]) }}
                                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary transition-colors">
                                    <RotateCcw className="w-3 h-3" />
                                    Herlaad template
                                  </button>
                                ) : (
                                  // Multiple templates — show picker
                                  <>
                                    <button onClick={() => setReloadDropdownId(reloadDropdownId === project.id ? null : project.id)}
                                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary transition-colors">
                                      <RotateCcw className="w-3 h-3" />
                                      Herlaad template
                                    </button>
                                    {reloadDropdownId === project.id && (
                                      <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50 min-w-[180px]">
                                        {phaseTemplates.map((t) => (
                                          <button key={t.id} onClick={() => { setReloadDropdownId(null); if (confirm(`Template "${t.title}" opnieuw inladen? Domein-specifieke aanpassingen worden overschreven.`)) loadTemplate(project.id, project.current_phase, t) }}
                                            className="w-full px-3 py-2 text-xs text-left text-gray-600 hover:bg-gray-50 transition-colors">
                                            {t.title}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Content */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">Inhoud (zichtbaar voor klant)</label>
                            <textarea value={editingInstance.content}
                              onChange={(e) => setEditingInstance({ ...editingInstance, content: e.target.value })}
                              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm resize-none"
                              rows={3} placeholder="Tekst of instructies voor de klant..." />
                          </div>

                          {/* Steps */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-xs font-medium text-gray-500">Stappen (cards voor klant)</label>
                              <button type="button" onClick={addInstanceStep}
                                className="flex items-center gap-1 text-xs text-primary hover:text-primary-600 font-medium transition-colors">
                                <Plus className="w-3 h-3" />
                                Stap toevoegen
                              </button>
                            </div>
                            {editingInstance.steps.length === 0 ? (
                              <div className="border border-dashed border-gray-200 rounded-lg p-4 text-center">
                                <p className="text-xs text-gray-400">Nog geen stappen.</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {editingInstance.steps.map((step, index) => (
                                  <div key={step.id} className="flex gap-2 items-start bg-gray-50 border border-gray-200 rounded-lg p-3">
                                    <div className="flex-1 space-y-1.5">
                                      <input type="text" value={step.title}
                                        onChange={(e) => updateInstanceStep(index, 'title', e.target.value)}
                                        className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                                        placeholder="Stap titel" />
                                      <input type="text" value={step.description}
                                        onChange={(e) => updateInstanceStep(index, 'description', e.target.value)}
                                        className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                                        placeholder="Beschrijving of URL (zichtbaar voor klant)" />
                                    </div>
                                    <button type="button" onClick={() => removeInstanceStep(index)}
                                      className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors mt-1">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Save button */}
                          <div className="flex justify-end">
                            <button onClick={() => saveInstance(project.id, project.current_phase)}
                              disabled={savingInstance}
                              className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                              <Save className="w-4 h-4" />
                              {savingInstance ? 'Opslaan...' : 'Opslaan'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
