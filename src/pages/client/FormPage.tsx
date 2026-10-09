import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { getClientAndProjectIds } from '../../lib/clientProjects'
import { useAuth } from '../../contexts/AuthContext'
import type { Form, FormSubmission } from '../../types'
import { ChevronLeft, ChevronRight, Check, Loader2, ArrowLeft, Pencil } from 'lucide-react'
import FormStepFields from '../../components/FormStepFields'

export default function FormPage() {
  const { formId } = useParams<{ formId: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState<Form | null>(null)
  const [submission, setSubmission] = useState<FormSubmission | null>(null)
  const [formData, setFormData] = useState<Record<string, string | string[] | boolean>>({})
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!profile || !formId) return

    // Find the client's project (via project_clients of projects.client_id)
    const { projectIds } = await getClientAndProjectIds(profile.id)
    if (projectIds.length === 0) { setLoading(false); return }

    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .in('id', projectIds)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!project) { setLoading(false); return }
    setProjectId(project.id)

    // Fetch form definition
    const { data: formDef } = await supabase
      .from('forms')
      .select('*')
      .eq('id', formId)
      .single()

    if (formDef) setForm(formDef)

    // Fetch existing submission for this project
    const { data: sub } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('form_id', formId)
      .eq('project_id', project.id)
      .limit(1)
      .single()

    if (sub) {
      setSubmission(sub)
      setFormData(sub.data || {})
    }

    setLoading(false)
  }, [profile, formId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const updateField = (fieldId: string, value: string | string[] | boolean) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }))
    setSaved(false)
  }

  const handleSave = async (submit: boolean) => {
    if (!projectId || !formId) return
    setSaving(true)

    const payload = {
      form_id: formId,
      project_id: projectId,
      data: formData,
      submitted_at: submit ? new Date().toISOString() : null,
    }

    if (submission) {
      const { data } = await supabase
        .from('form_submissions')
        .update(payload)
        .eq('id', submission.id)
        .select()
        .single()
      if (data) setSubmission(data)
    } else {
      const { data } = await supabase
        .from('form_submissions')
        .insert(payload)
        .select()
        .single()
      if (data) setSubmission(data)
    }

    // Auto-complete the step that links to this form
    if (submit) {
      await markStepCompleted()
    }

    setSaving(false)
    setSaved(true)
  }

  const markStepCompleted = async () => {
    if (!projectId || !formId) return

    // Get the project's current phase
    const { data: project } = await supabase
      .from('projects')
      .select('current_phase')
      .eq('id', projectId)
      .single()

    if (!project) return

    // Get the project_phases record for the current phase
    const { data: phaseRecord } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', projectId)
      .eq('phase', project.current_phase)
      .limit(1)
      .single()

    if (!phaseRecord?.custom_data?.steps) return

    const steps = phaseRecord.custom_data.steps as Array<{
      id: string
      completed?: boolean
      elements?: Array<{ type: string; data: Record<string, string> }>
    }>

    // Find the step that has a button linking to this form
    let changed = false
    for (const step of steps) {
      if (step.completed) continue
      const hasFormButton = step.elements?.some(
        (el) => el.type === 'button' && el.data.action === 'form' && el.data.formId === formId
      )
      if (hasFormButton) {
        step.completed = true
        changed = true
      }
    }

    if (changed) {
      await supabase
        .from('project_phases')
        .update({ custom_data: { ...phaseRecord.custom_data, steps } })
        .eq('id', phaseRecord.id)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!form || !form.steps || form.steps.length === 0) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 px-4">
        <p className="text-gray-500">Dit formulier bestaat niet of bevat geen stappen.</p>
        <button type="button" onClick={() => navigate('/')}
          className="mt-4 text-sm text-primary hover:text-primary-600 font-medium">
          Terug naar portaal
        </button>
      </div>
    )
  }

  const steps = form.steps
  const step = steps[currentStep]
  const isLastStep = currentStep === steps.length - 1
  const isFirstStep = currentStep === 0
  const isSubmitted = !!submission?.submitted_at

  return (
    <div className="bg-[#f8f7fc] min-h-[calc(100vh-64px)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Back button */}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug naar portaal
        </button>

        {/* Form card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="px-6 sm:px-8 py-5 sm:py-6 border-b border-gray-100">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{form.title}</h1>
            {form.description && (
              <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{form.description}</p>
            )}

            {/* Status badge */}
            {isSubmitted && (
              <div className="flex items-center gap-2 mt-3">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-100 rounded-full">
                  <Check className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-xs font-medium text-green-700">Verzonden</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Pencil className="w-3 h-3" />
                  <span>Je kunt je antwoorden nog aanpassen</span>
                </div>
              </div>
            )}

            {/* Step progress */}
            {steps.length > 1 && (
              <div className="flex items-center gap-2 mt-4">
                {steps.map((s, i) => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => { handleSave(false); setCurrentStep(i) }}
                    className={`h-1.5 flex-1 rounded-full transition-colors cursor-pointer ${
                      i === currentStep
                        ? 'bg-primary'
                        : i < currentStep
                          ? 'bg-primary/40'
                          : 'bg-gray-200 hover:bg-gray-300'
                    }`}
                    title={s.title || `Stap ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Step content */}
          <div className="px-6 sm:px-8 py-6 sm:py-8">
            {step.title && (
              <h2 className="text-lg font-semibold text-gray-900 mb-5">{step.title}</h2>
            )}

            <FormStepFields fields={step.fields} values={formData} onChange={updateField} />
          </div>

          {/* Navigation footer */}
          <div className="flex items-center justify-between px-6 sm:px-8 py-4 bg-gray-50 border-t border-gray-100">
            <div>
              {!isFirstStep && (
                <button
                  type="button"
                  onClick={() => { handleSave(false); setCurrentStep(currentStep - 1) }}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Vorige
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Save feedback */}
              {saved && (
                <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                  <Check className="w-3.5 h-3.5" />
                  Opgeslagen
                </span>
              )}

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
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {isSubmitted ? 'Opnieuw opslaan' : 'Opslaan en voltooi stap'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { handleSave(false); setCurrentStep(currentStep + 1) }}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
                >
                  Volgende
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
