import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Project, ProjectPhase, PhaseStep, CardElement, Form, FormSubmission } from '../../types'
import { Sparkles, ArrowRight, Calendar, ExternalLink, ChevronLeft, ChevronRight, Check, Loader2 } from 'lucide-react'
import { getIconComponent } from '../../components/CardElementEditor'

const phases: ProjectPhase[] = ['intake', 'design', 'development', 'oplevering', 'onderhoud']

const phaseLabels: Record<ProjectPhase, string> = {
  intake: 'Intake',
  design: 'Design',
  development: 'Development',
  oplevering: 'Oplevering',
  onderhoud: 'Onderhoud',
}

// Multi-step form viewer for clients
function FormView({ formId, projectId }: { formId: string; projectId: string }) {
  const [form, setForm] = useState<Form | null>(null)
  const [submission, setSubmission] = useState<FormSubmission | null>(null)
  const [formData, setFormData] = useState<Record<string, string | string[] | boolean>>({})
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const fetchData = useCallback(async () => {
    // Fetch form definition
    const { data: formData } = await supabase
      .from('forms')
      .select('*')
      .eq('id', formId)
      .single()

    if (formData) setForm(formData)

    // Fetch existing submission for this project
    const { data: sub } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('form_id', formId)
      .eq('project_id', projectId)
      .limit(1)
      .single()

    if (sub) {
      setSubmission(sub)
      setFormData(sub.data || {})
      if (sub.submitted_at) setSubmitted(true)
    }

    setLoading(false)
  }, [formId, projectId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const updateField = (fieldId: string, value: string | string[] | boolean) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }))
  }

  const toggleCheckboxOption = (fieldId: string, optionId: string) => {
    setFormData(prev => {
      const current = (prev[fieldId] as string[]) || []
      const updated = current.includes(optionId)
        ? current.filter(id => id !== optionId)
        : [...current, optionId]
      return { ...prev, [fieldId]: updated }
    })
  }

  const handleSave = async (submit: boolean) => {
    setSaving(true)
    const payload = {
      form_id: formId,
      project_id: projectId,
      data: formData,
      submitted_at: submit ? new Date().toISOString() : null,
    }

    if (submission) {
      await supabase
        .from('form_submissions')
        .update(payload)
        .eq('id', submission.id)
    } else {
      const { data } = await supabase
        .from('form_submissions')
        .insert(payload)
        .select()
        .single()
      if (data) setSubmission(data)
    }

    if (submit) setSubmitted(true)
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!form || !form.steps || form.steps.length === 0) return null

  // Already submitted — show confirmation
  if (submitted) {
    return (
      <div className="bg-green-50 border border-green-100 rounded-xl p-5 text-center">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <Check className="w-5 h-5 text-green-600" />
        </div>
        <p className="text-sm font-semibold text-green-800 mb-1">Formulier verzonden</p>
        <p className="text-xs text-green-600">Bedankt! Je antwoorden zijn opgeslagen.</p>
      </div>
    )
  }

  const steps = form.steps
  const step = steps[currentStep]
  const isLastStep = currentStep === steps.length - 1
  const isFirstStep = currentStep === 0

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Form header */}
      <div className="bg-gray-50 border-b border-gray-100 px-5 py-3">
        <p className="text-sm font-semibold text-gray-800">{form.title}</p>
        {steps.length > 1 && (
          <div className="flex items-center gap-2 mt-2">
            {steps.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                i <= currentStep ? 'bg-primary' : 'bg-gray-200'
              }`} />
            ))}
          </div>
        )}
      </div>

      {/* Step content */}
      <div className="p-5">
        {step.title && (
          <h4 className="text-base font-semibold text-gray-900 mb-4">{step.title}</h4>
        )}

        <div className="space-y-4">
          {step.fields.map((field) => {
            if (field.type === 'heading') {
              return (
                <h5 key={field.id} className="text-sm font-bold text-gray-700 pt-2">
                  {field.label}
                </h5>
              )
            }

            const value = formData[field.id] ?? ''

            return (
              <div key={field.id}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label}
                  {field.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>

                {field.type === 'text' && (
                  <input
                    type="text"
                    value={value as string}
                    onChange={(e) => updateField(field.id, e.target.value)}
                    placeholder={field.placeholder || ''}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                  />
                )}

                {field.type === 'textarea' && (
                  <textarea
                    value={value as string}
                    onChange={(e) => updateField(field.id, e.target.value)}
                    placeholder={field.placeholder || ''}
                    rows={4}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all resize-none"
                  />
                )}

                {field.type === 'email' && (
                  <input
                    type="email"
                    value={value as string}
                    onChange={(e) => updateField(field.id, e.target.value)}
                    placeholder={field.placeholder || 'naam@voorbeeld.nl'}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                  />
                )}

                {field.type === 'phone' && (
                  <input
                    type="tel"
                    value={value as string}
                    onChange={(e) => updateField(field.id, e.target.value)}
                    placeholder={field.placeholder || '06 12345678'}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                  />
                )}

                {field.type === 'number' && (
                  <input
                    type="number"
                    value={value as string}
                    onChange={(e) => updateField(field.id, e.target.value)}
                    placeholder={field.placeholder || ''}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                  />
                )}

                {field.type === 'date' && (
                  <input
                    type="date"
                    value={value as string}
                    onChange={(e) => updateField(field.id, e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                  />
                )}

                {field.type === 'select' && field.options && (
                  <select
                    value={value as string}
                    onChange={(e) => updateField(field.id, e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                  >
                    <option value="">{field.placeholder || 'Maak een keuze...'}</option>
                    {field.options.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                )}

                {field.type === 'radio' && field.options && (
                  <div className="space-y-2 mt-1">
                    {field.options.map((opt) => (
                      <label key={opt.id} className="flex items-center gap-2.5 cursor-pointer group">
                        <input
                          type="radio"
                          name={field.id}
                          checked={value === opt.id}
                          onChange={() => updateField(field.id, opt.id)}
                          className="w-4 h-4 text-primary border-gray-300 focus:ring-primary/30"
                        />
                        <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                {field.type === 'checkbox' && field.options && (
                  <div className="space-y-2 mt-1">
                    {field.options.map((opt) => {
                      const checked = ((formData[field.id] as string[]) || []).includes(opt.id)
                      return (
                        <label key={opt.id} className="flex items-center gap-2.5 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCheckboxOption(field.id, opt.id)}
                            className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/30"
                          />
                          <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">{opt.label}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Navigation footer */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-t border-gray-100">
        <div>
          {!isFirstStep && (
            <button
              type="button"
              onClick={() => setCurrentStep(currentStep - 1)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Vorige
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {steps.length > 1 && (
            <span className="text-xs text-gray-400">
              Stap {currentStep + 1} van {steps.length}
            </span>
          )}
          {isLastStep ? (
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Verzenden
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { handleSave(false); setCurrentStep(currentStep + 1) }}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Volgende
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Render a single card element for the client view
function CardElementView({ element, project }: { element: CardElement; project: Project }) {
  switch (element.type) {
    case 'icon': {
      const IconComp = getIconComponent(element.data.name || 'star')
      return (
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${element.data.color || '#9e86ff'}15` }}>
            <IconComp className="w-6 h-6" style={{ color: element.data.color || '#9e86ff' }} />
          </div>
        </div>
      )
    }
    case 'text': {
      return element.data.content ? (
        <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap text-center">{element.data.content}</p>
      ) : null
    }
    case 'dynamic': {
      const field = element.data.field
      let displayValue = ''

      if (field === 'start_meeting_at' && project.start_meeting_at) {
        const d = new Date(project.start_meeting_at)
        displayValue = d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) +
          ' om ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) + ' uur'
      } else if (field === 'due_date' && project.due_date) {
        displayValue = new Date(project.due_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
      } else if (field === 'project_name') {
        displayValue = project.name
      } else if (field === 'client_name') {
        displayValue = (project.client as unknown as { name: string })?.name || ''
      }

      if (!displayValue) return null

      return (
        <div className="flex flex-col items-center gap-1.5 bg-gray-50 rounded-xl px-4 py-3">
          {element.data.label && (
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">{element.data.label}</p>
          )}
          <p className="text-sm font-semibold text-gray-800">{displayValue}</p>
        </div>
      )
    }
    case 'link': {
      if (!element.data.url) return null
      return (
        <div className="flex justify-center">
          <a href={element.data.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-600 font-medium transition-colors">
            {element.data.label || element.data.url}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )
    }
    case 'button': {
      if (!element.data.url) return null
      const isPrimary = element.data.variant !== 'outline'
      return (
        <div className="flex justify-center pt-2">
          <a href={element.data.url} target="_blank" rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              isPrimary
                ? 'bg-primary hover:bg-primary-600 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}>
            {element.data.label || 'Bekijk'}
          </a>
        </div>
      )
    }
    case 'form': {
      if (!element.data.formId) return null
      return <FormView formId={element.data.formId} projectId={project.id} />
    }
    default:
      return null
  }
}

export default function ClientPortal() {
  const { profile } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [phaseContent, setPhaseContent] = useState<string>('')
  const [phaseSteps, setPhaseSteps] = useState<PhaseStep[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchProject = async () => {
      if (!profile) return

      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('profile_id', profile.id)
        .single()

      if (!client) {
        setLoading(false)
        return
      }

      const { data: projectData } = await supabase
        .from('projects')
        .select('*, client:clients(id, name, email)')
        .eq('client_id', client.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (projectData) {
        setProject(projectData)

        // First try to load domain-specific instance from project_phases
        const { data: phaseInstance } = await supabase
          .from('project_phases')
          .select('*')
          .eq('project_id', projectData.id)
          .eq('phase', projectData.current_phase)
          .limit(1)
          .single()

        if (phaseInstance?.custom_data) {
          setPhaseContent(phaseInstance.custom_data.content || '')
          setPhaseSteps(phaseInstance.custom_data.steps || [])
        } else {
          // Fallback: load from template directly
          const { data: templateData } = await supabase
            .from('phase_templates')
            .select('*')
            .eq('phase', projectData.current_phase)
            .limit(1)
            .single()

          if (templateData) {
            setPhaseContent(templateData.content || templateData.description || '')
            setPhaseSteps(templateData.steps || [])
          }
        }
      }

      setLoading(false)
    }

    fetchProject()
  }, [profile])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  // No project linked — welcome message
  if (!project) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 sm:py-24 px-4">
        <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-primary/5 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <Sparkles className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
          Welkom, {profile?.full_name || 'daar'}!
        </h2>
        <p className="text-gray-500 leading-relaxed">
          Jouw account is aangemaakt. Op dit moment wordt je account gekoppeld aan het juiste project.
          Dit duurt meestal niet lang — heb nog even geduld.
        </p>
        <div className="mt-8 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-sm text-gray-600 font-medium">Wachten op koppeling aan project...</p>
          </div>
        </div>
      </div>
    )
  }

  const currentPhaseIndex = phases.indexOf(project.current_phase)
  const nextPhase = currentPhaseIndex < phases.length - 1 ? phases[currentPhaseIndex + 1] : null
  const steps = phaseSteps
  const isOnderhoud = project.current_phase === 'onderhoud'

  // Format due date in Dutch
  const formattedDueDate = project.due_date
    ? new Date(project.due_date).toLocaleDateString('nl-NL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <div>
      {/* ============================================ */}
      {/* SECTION 1: White background — Hero / Overview */}
      {/* ============================================ */}
      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          {/* Project name */}
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">
            {project.name}
          </h1>

          {/* Phase content */}
          {phaseContent && (
            <p className="text-gray-500 text-center mt-4 sm:mt-6 leading-relaxed max-w-xl mx-auto text-sm sm:text-base">
              {phaseContent}
            </p>
          )}

          {/* 3 Info cards */}
          {!isOnderhoud && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 sm:mt-10">
              {/* Card 1: Huidige Fase */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
                  {phaseLabels[project.current_phase]}
                </p>
                <div className="bg-primary text-white text-sm font-medium py-2 px-4 rounded-xl">
                  Huidige Fase
                </div>
              </div>

              {/* Card 2: Volgende Fase */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
                  {nextPhase ? phaseLabels[nextPhase] : '—'}
                </p>
                <div className="flex items-center justify-center gap-1.5 text-sm text-gray-400 font-medium">
                  <ArrowRight className="w-4 h-4" />
                  Volgende Fase
                </div>
              </div>

              {/* Card 3: Verwachte Einddatum */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
                  {formattedDueDate || 'Nog onbekend'}
                </p>
                <div className="flex items-center justify-center gap-1.5 text-sm text-gray-400 font-medium">
                  <Calendar className="w-4 h-4" />
                  Verwachte Einddatum
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ============================================ */}
      {/* SECTION 2: Light background — Phase Cards */}
      {/* ============================================ */}
      {!isOnderhoud && (
        <section className="bg-[#f8f7fc] min-h-[400px]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
            {/* Phase title */}
            <h2 className="text-2xl sm:text-3xl font-light text-gray-700 text-center mb-10 sm:mb-12">
              {phaseLabels[project.current_phase]}
            </h2>

            {/* Step cards */}
            {steps.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                {steps.map((step) => {
                  const hasElements = step.elements && step.elements.length > 0

                  return (
                    <div
                      key={step.id}
                      className="relative bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                    >
                      {/* Completed badge */}
                      {step.completed && (
                        <div className="absolute -top-2.5 -left-2.5 w-7 h-7 bg-accent rounded-full flex items-center justify-center shadow-sm">
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}

                      {/* Card content */}
                      {hasElements ? (
                        // Render block-based elements
                        (() => {
                          // Extract icon element (always rendered above title)
                          const iconElement = step.elements!.find(el => el.type === 'icon')
                          const otherElements = step.elements!.filter(el => el.type !== 'icon')
                          return (
                            <div className="space-y-3 text-center">
                              {/* Icon always on top */}
                              {iconElement && (
                                <CardElementView key={iconElement.id} element={iconElement} project={project} />
                              )}
                              {/* Title */}
                              <h3 className="text-lg font-bold text-gray-900">
                                {step.title}
                              </h3>
                              {/* Remaining elements */}
                              {otherElements.map((element) => (
                                <CardElementView key={element.id} element={element} project={project} />
                              ))}
                            </div>
                          )
                        })()
                      ) : (
                        // Legacy: simple title + description
                        <>
                          <h3 className="text-lg font-bold text-gray-900 mt-2 mb-2 text-center">
                            {step.title}
                          </h3>
                          {step.description && (
                            <p className="text-sm text-gray-500 leading-relaxed text-center">
                              {step.description}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-400">Er zijn nog geen stappen ingesteld voor deze fase.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Onderhoud fase — simplified view */}
      {isOnderhoud && (
        <section className="bg-[#f8f7fc]">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center">
            <h2 className="text-2xl sm:text-3xl font-light text-gray-700 mb-4">
              Onderhoud
            </h2>
            <p className="text-gray-500 leading-relaxed">
              Jouw website is live! Wij zorgen voor onderhoud, updates en eventuele aanpassingen.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
