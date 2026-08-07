import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Form, FormStep, FormField, FormFieldType } from '../../types'
import { Plus, ClipboardList, Trash2, X, ChevronDown, GripVertical, Pencil, Copy } from 'lucide-react'

const fieldTypeLabels: Record<FormFieldType, string> = {
  heading: 'Koptekst',
  text: 'Tekstveld',
  textarea: 'Tekstvlak',
  email: 'E-mailadres',
  phone: 'Telefoonnummer',
  select: 'Dropdown',
  checkbox: 'Checkbox',
  radio: 'Meerkeuze',
  date: 'Datum',
  number: 'Getal',
}

const fieldTypes: FormFieldType[] = ['heading', 'text', 'textarea', 'email', 'phone', 'select', 'checkbox', 'radio', 'date', 'number']

interface FormData {
  title: string
  description: string
  steps: FormStep[]
}

const emptyForm: FormData = { title: '', description: '', steps: [] }

function createField(type: FormFieldType): FormField {
  const base: FormField = { id: crypto.randomUUID(), type, label: '', placeholder: '', required: false }
  if (type === 'select' || type === 'radio' || type === 'checkbox') {
    base.options = [{ id: crypto.randomUUID(), label: '' }]
  }
  return base
}

export default function Forms() {
  const [forms, setForms] = useState<Form[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(emptyForm)
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null)

  const fetchForms = async () => {
    const { data } = await supabase
      .from('forms')
      .select('*')
      .order('created_at', { ascending: false })
    setForms(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchForms() }, [])

  const openCreate = () => {
    setFormData({ ...emptyForm, steps: [{ id: crypto.randomUUID(), title: 'Stap 1', fields: [] }] })
    setEditingId(null)
    setShowForm(true)
  }

  const openEdit = (form: Form) => {
    setFormData({ title: form.title, description: form.description, steps: form.steps || [] })
    setEditingId(form.id)
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setEditingId(null); setFormData(emptyForm) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = { title: formData.title, description: formData.description, steps: formData.steps }
    if (editingId) {
      await supabase.from('forms').update(payload).eq('id', editingId)
    } else {
      await supabase.from('forms').insert(payload)
    }
    closeForm()
    fetchForms()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit formulier wilt verwijderen?')) return
    await supabase.from('forms').delete().eq('id', id)
    fetchForms()
  }

  const handleDuplicate = async (form: Form) => {
    await supabase.from('forms').insert({
      title: `${form.title} (kopie)`,
      description: form.description,
      steps: form.steps,
    })
    fetchForms()
  }

  // Step management
  const addStep = () => {
    const newStep: FormStep = { id: crypto.randomUUID(), title: `Stap ${formData.steps.length + 1}`, fields: [] }
    setFormData({ ...formData, steps: [...formData.steps, newStep] })
    setExpandedStepId(newStep.id)
  }

  const updateStep = (stepIndex: number, updates: Partial<FormStep>) => {
    const newSteps = [...formData.steps]
    newSteps[stepIndex] = { ...newSteps[stepIndex], ...updates }
    setFormData({ ...formData, steps: newSteps })
  }

  const removeStep = (stepIndex: number) => {
    if (formData.steps.length <= 1) return
    setFormData({ ...formData, steps: formData.steps.filter((_, i) => i !== stepIndex) })
  }

  // Field management
  const addField = (stepIndex: number, type: FormFieldType) => {
    const newSteps = [...formData.steps]
    newSteps[stepIndex] = { ...newSteps[stepIndex], fields: [...newSteps[stepIndex].fields, createField(type)] }
    setFormData({ ...formData, steps: newSteps })
  }

  const updateField = (stepIndex: number, fieldIndex: number, updates: Partial<FormField>) => {
    const newSteps = [...formData.steps]
    const newFields = [...newSteps[stepIndex].fields]
    newFields[fieldIndex] = { ...newFields[fieldIndex], ...updates }
    newSteps[stepIndex] = { ...newSteps[stepIndex], fields: newFields }
    setFormData({ ...formData, steps: newSteps })
  }

  const removeField = (stepIndex: number, fieldIndex: number) => {
    const newSteps = [...formData.steps]
    newSteps[stepIndex] = { ...newSteps[stepIndex], fields: newSteps[stepIndex].fields.filter((_, i) => i !== fieldIndex) }
    setFormData({ ...formData, steps: newSteps })
  }

  // Option management (for select, radio, checkbox)
  const addOption = (stepIndex: number, fieldIndex: number) => {
    const newSteps = [...formData.steps]
    const field = newSteps[stepIndex].fields[fieldIndex]
    const options = [...(field.options || []), { id: crypto.randomUUID(), label: '' }]
    newSteps[stepIndex].fields[fieldIndex] = { ...field, options }
    setFormData({ ...formData, steps: newSteps })
  }

  const updateOption = (stepIndex: number, fieldIndex: number, optIndex: number, label: string) => {
    const newSteps = [...formData.steps]
    const field = newSteps[stepIndex].fields[fieldIndex]
    const options = [...(field.options || [])]
    options[optIndex] = { ...options[optIndex], label }
    newSteps[stepIndex].fields[fieldIndex] = { ...field, options }
    setFormData({ ...formData, steps: newSteps })
  }

  const removeOption = (stepIndex: number, fieldIndex: number, optIndex: number) => {
    const newSteps = [...formData.steps]
    const field = newSteps[stepIndex].fields[fieldIndex]
    const options = (field.options || []).filter((_, i) => i !== optIndex)
    newSteps[stepIndex].fields[fieldIndex] = { ...field, options }
    setFormData({ ...formData, steps: newSteps })
  }

  const totalFields = (form: Form) => form.steps?.reduce((sum, s) => sum + (s.fields?.length || 0), 0) || 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Formulieren</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">Maak formulieren die je kunt koppelen aan cards</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors text-sm">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nieuw formulier</span>
          <span className="sm:hidden">Nieuw</span>
        </button>
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl my-8">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? 'Formulier bewerken' : 'Nieuw formulier'}
              </h2>
              <button type="button" onClick={closeForm} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Title & description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Naam</label>
                  <input type="text" value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm"
                    placeholder="bijv. Onboarding vragenlijst" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Beschrijving</label>
                  <input type="text" value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm"
                    placeholder="Korte uitleg voor de klant" />
                </div>
              </div>

              {/* Steps */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">Stappen</label>
                  <button type="button" onClick={addStep}
                    className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-600 font-medium transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                    Stap toevoegen
                  </button>
                </div>

                <div className="space-y-3">
                  {formData.steps.map((step, stepIndex) => {
                    const isExpanded = expandedStepId === step.id
                    return (
                      <div key={step.id} className="border border-gray-200 rounded-xl overflow-hidden">
                        {/* Step header */}
                        <div className="flex items-center gap-2 bg-gray-50 px-4 py-3">
                          <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                          <input type="text" value={step.title}
                            onChange={(e) => updateStep(stepIndex, { title: e.target.value })}
                            className="flex-1 px-2 py-1 bg-white border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="Stap naam" />
                          <span className="text-xs text-gray-400 whitespace-nowrap">{step.fields.length} velden</span>
                          <button type="button" onClick={() => setExpandedStepId(isExpanded ? null : step.id)}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                            <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                          {formData.steps.length > 1 && (
                            <button type="button" onClick={() => removeStep(stepIndex)}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Step fields */}
                        {isExpanded && (
                          <div className="p-4 space-y-3">
                            {step.fields.length === 0 && (
                              <p className="text-xs text-gray-400 text-center py-3">Nog geen velden. Voeg hieronder een veld toe.</p>
                            )}

                            {step.fields.map((field, fieldIndex) => (
                              <div key={field.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                                <div className="flex items-start gap-2">
                                  <GripVertical className="w-3.5 h-3.5 text-gray-300 mt-2.5 flex-shrink-0" />
                                  <div className="flex-1 space-y-2">
                                    {/* Type badge + label */}
                                    <div className="flex items-center gap-2">
                                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary whitespace-nowrap">
                                        {fieldTypeLabels[field.type]}
                                      </span>
                                      {field.type !== 'heading' && (
                                        <label className="flex items-center gap-1.5 text-xs text-gray-500">
                                          <input type="checkbox" checked={field.required || false}
                                            onChange={(e) => updateField(stepIndex, fieldIndex, { required: e.target.checked })}
                                            className="rounded border-gray-300 text-primary focus:ring-primary/30 w-3 h-3" />
                                          Verplicht
                                        </label>
                                      )}
                                    </div>

                                    {/* Label input */}
                                    <input type="text" value={field.label}
                                      onChange={(e) => updateField(stepIndex, fieldIndex, { label: e.target.value })}
                                      className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                      placeholder={field.type === 'heading' ? 'Koptekst' : 'Veldnaam'} />

                                    {/* Placeholder (not for heading, checkbox, radio) */}
                                    {!['heading', 'checkbox', 'radio', 'select'].includes(field.type) && (
                                      <input type="text" value={field.placeholder || ''}
                                        onChange={(e) => updateField(stepIndex, fieldIndex, { placeholder: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md text-xs text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                        placeholder="Placeholder tekst (optioneel)" />
                                    )}

                                    {/* Options for select, radio, checkbox */}
                                    {['select', 'radio', 'checkbox'].includes(field.type) && (
                                      <div className="space-y-1.5 pt-1">
                                        <p className="text-[11px] text-gray-400 font-medium">Opties</p>
                                        {(field.options || []).map((opt, optIndex) => (
                                          <div key={opt.id} className="flex items-center gap-1.5">
                                            <span className="w-4 text-center text-xs text-gray-300">{optIndex + 1}.</span>
                                            <input type="text" value={opt.label}
                                              onChange={(e) => updateOption(stepIndex, fieldIndex, optIndex, e.target.value)}
                                              className="flex-1 px-2 py-1 bg-white border border-gray-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                                              placeholder="Optie naam" />
                                            <button type="button" onClick={() => removeOption(stepIndex, fieldIndex, optIndex)}
                                              className="p-0.5 text-gray-400 hover:text-red-500 transition-colors">
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        ))}
                                        <button type="button" onClick={() => addOption(stepIndex, fieldIndex)}
                                          className="flex items-center gap-1 text-xs text-primary hover:text-primary-600 font-medium transition-colors">
                                          <Plus className="w-3 h-3" />
                                          Optie toevoegen
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  <button type="button" onClick={() => removeField(stepIndex, fieldIndex)}
                                    className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}

                            {/* Add field buttons */}
                            <div className="pt-2">
                              <p className="text-[11px] text-gray-400 font-medium mb-2">Veld toevoegen</p>
                              <div className="flex flex-wrap gap-1.5">
                                {fieldTypes.map((type) => (
                                  <button key={type} type="button"
                                    onClick={() => addField(stepIndex, type)}
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors">
                                    {fieldTypeLabels[type]}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Actions */}
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

      {/* Forms list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm animate-pulse"><div className="h-20" /></div>
          ))}
        </div>
      ) : forms.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nog geen formulieren</h3>
          <p className="text-gray-500 mt-1">Maak een formulier aan om te koppelen aan cards in je templates.</p>
          <button onClick={openCreate}
            className="mt-4 inline-flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            Formulier aanmaken
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {forms.map((form) => (
            <div key={form.id} className="bg-white rounded-xl p-5 sm:p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900">{form.title}</h3>
                  {form.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{form.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-gray-400">{form.steps?.length || 0} stappen</span>
                    <span className="text-xs text-gray-400">{totalFields(form)} velden</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleDuplicate(form)}
                    className="p-2 text-gray-400 hover:text-primary rounded-lg hover:bg-primary/5 transition-colors" title="Dupliceren">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEdit(form)}
                    className="p-2 text-gray-400 hover:text-primary rounded-lg hover:bg-primary/5 transition-colors" title="Bewerken">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(form.id)}
                    className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors" title="Verwijderen">
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
