import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { PhaseTemplate, ProjectPhase, PhaseStep } from '../../types'
import { Plus, Layers, Trash2, Pencil, X, GripVertical, Check, Circle } from 'lucide-react'

const phases: ProjectPhase[] = ['intake', 'design', 'development', 'oplevering', 'onderhoud']

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
  phase: ProjectPhase
  title: string
  description: string
  content: string
  steps: PhaseStep[]
}

const emptyForm: FormData = {
  phase: 'intake',
  title: '',
  description: '',
  content: '',
  steps: [],
}

export default function Templates() {
  const [templates, setTemplates] = useState<PhaseTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(emptyForm)
  const [activeTab, setActiveTab] = useState<ProjectPhase | 'all'>('all')

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from('phase_templates')
      .select('*')
      .order('phase', { ascending: true })
      .order('created_at', { ascending: false })
    setTemplates(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  const openCreate = (phase?: ProjectPhase) => {
    setFormData({ ...emptyForm, phase: phase || 'intake' })
    setEditingId(null)
    setShowForm(true)
  }

  const openEdit = (template: PhaseTemplate) => {
    setFormData({
      phase: template.phase,
      title: template.title,
      description: template.description,
      content: template.content || '',
      steps: template.steps || [],
    })
    setEditingId(template.id)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData(emptyForm)
  }

  const addStep = () => {
    setFormData({
      ...formData,
      steps: [
        ...formData.steps,
        { id: crypto.randomUUID(), title: '', description: '', completed: false },
      ],
    })
  }

  const updateStep = (index: number, field: keyof PhaseStep, value: string | boolean) => {
    const newSteps = [...formData.steps]
    newSteps[index] = { ...newSteps[index], [field]: value }
    setFormData({ ...formData, steps: newSteps })
  }

  const removeStep = (index: number) => {
    setFormData({
      ...formData,
      steps: formData.steps.filter((_, i) => i !== index),
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      phase: formData.phase,
      title: formData.title,
      description: formData.description,
      content: formData.content,
      steps: formData.steps,
    }

    if (editingId) {
      await supabase.from('phase_templates').update(payload).eq('id', editingId)
    } else {
      await supabase.from('phase_templates').insert(payload)
    }

    closeForm()
    fetchTemplates()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit template wilt verwijderen?')) return
    await supabase.from('phase_templates').delete().eq('id', id)
    fetchTemplates()
  }

  const filteredTemplates = activeTab === 'all'
    ? templates
    : templates.filter((t) => t.phase === activeTab)

  return (
    <div>
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Templates</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">Beheer fase-templates voor klantweergave</p>
        </div>
        <button
          onClick={() => openCreate()}
          className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nieuw template</span>
          <span className="sm:hidden">Nieuw</span>
        </button>
      </div>

      {/* Phase filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            activeTab === 'all'
              ? 'bg-gray-900 text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Alle ({templates.length})
        </button>
        {phases.map((phase) => {
          const count = templates.filter((t) => t.phase === phase).length
          return (
            <button
              key={phase}
              onClick={() => setActiveTab(phase)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === phase
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {phaseLabels[phase]} ({count})
            </button>
          )
        })}
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl my-8">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? 'Template bewerken' : 'Nieuw template'}
              </h2>
              <button onClick={closeForm} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Fase</label>
                  <select
                    value={formData.phase}
                    onChange={(e) => setFormData({ ...formData, phase: e.target.value as ProjectPhase })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm"
                  >
                    {phases.map((phase) => (
                      <option key={phase} value={phase}>{phaseLabels[phase]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Titel</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm"
                    placeholder="bijv. Intake gesprek"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Beschrijving</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm resize-none"
                  rows={2}
                  placeholder="Korte beschrijving die de klant ziet"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Inhoud (zichtbaar voor klant)</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm resize-none"
                  rows={4}
                  placeholder="Tekst, uitleg, of instructies die de klant te zien krijgt in deze fase..."
                />
              </div>

              {/* Steps */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">Stappen</label>
                  <button
                    type="button"
                    onClick={addStep}
                    className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-600 font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Stap toevoegen
                  </button>
                </div>

                {formData.steps.length === 0 ? (
                  <div className="border border-dashed border-gray-200 rounded-xl p-6 text-center">
                    <p className="text-sm text-gray-400">Nog geen stappen. Voeg stappen toe die als cards getoond worden aan de klant.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formData.steps.map((step, index) => (
                      <div key={step.id} className="flex gap-3 items-start bg-gray-50 border border-gray-200 rounded-xl p-4">
                        <GripVertical className="w-4 h-4 text-gray-300 mt-2.5 flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={step.title}
                            onChange={(e) => updateStep(index, 'title', e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all text-sm"
                            placeholder="Stap titel"
                            required
                          />
                          <input
                            type="text"
                            value={step.description}
                            onChange={(e) => updateStep(index, 'description', e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all text-sm"
                            placeholder="Korte beschrijving (optioneel)"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeStep(index)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors mt-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

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

      {/* Templates list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm animate-pulse"><div className="h-24" /></div>
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <Layers className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">
            {activeTab === 'all' ? 'Nog geen templates' : `Geen templates voor ${phaseLabels[activeTab]}`}
          </h3>
          <p className="text-gray-500 mt-1">Maak een template aan om de klantweergave per fase in te stellen.</p>
          <button
            onClick={() => openCreate(activeTab !== 'all' ? activeTab : undefined)}
            className="mt-4 inline-flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Template aanmaken
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTemplates.map((template) => (
            <div key={template.id} className="bg-white rounded-xl p-5 sm:p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${phaseColors[template.phase]}`}>
                      {phaseLabels[template.phase]}
                    </span>
                    <h3 className="font-semibold text-gray-900">{template.title}</h3>
                  </div>
                  {template.description && (
                    <p className="text-sm text-gray-500 mt-1">{template.description}</p>
                  )}
                  {template.steps && template.steps.length > 0 && (
                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <div className="flex -space-x-1">
                          {template.steps.slice(0, 4).map((step, i) => (
                            <div key={i} className="w-5 h-5 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center">
                              {step.completed ? (
                                <Check className="w-2.5 h-2.5 text-green-500" />
                              ) : (
                                <Circle className="w-2.5 h-2.5 text-gray-300" />
                              )}
                            </div>
                          ))}
                        </div>
                        <span>{template.steps.length} stappen</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(template)}
                    className="p-2 text-gray-400 hover:text-primary rounded-lg hover:bg-primary/5 transition-colors"
                    title="Bewerken"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
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
