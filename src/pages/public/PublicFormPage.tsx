import { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, CloudOff, Loader2, Send, XCircle } from 'lucide-react'
import { callPublicDocument, type PublicDocumentResult } from '../../lib/publicDocument'
import FormStepFields from '../../components/FormStepFields'
import { answerText, missingRequired, type FormAnswers } from '../../lib/formAnswers'
import type { FormStep } from '../../types'

interface PublicForm {
  form: { title: string; description: string; steps: FormStep[] }
  data: FormAnswers
  submitted_at: string | null
}

type FormResult = PublicDocumentResult<PublicForm>
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const AUTOSAVE_MS = 800

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Vragenlijst invullen via de link in de mail, zonder inloggen. Antwoorden worden
// tussendoor bewaard, zodat de klant later via dezelfde link verder kan.
export default function PublicFormPage({ token }: { token: string }) {
  const [result, setResult] = useState<FormResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [values, setValues] = useState<FormAnswers>({})
  const [currentStep, setCurrentStep] = useState(0)
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const topRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await callPublicDocument<FormResult>({ action: 'get', type: 'form', token })
        setResult(res)
        setValues(res.document.data || {})
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : '')
      }
      setLoading(false)
    }
    load()
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [token])

  const save = async (data: FormAnswers) => {
    if (timer.current) clearTimeout(timer.current)
    setSaveState('saving')
    try {
      await callPublicDocument({ action: 'save', type: 'form', token, data })
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  const change = (fieldId: string, value: string | string[] | boolean) => {
    const next = { ...values, [fieldId]: value }
    setValues(next)
    if (missing.has(fieldId)) setMissing(prev => { const s = new Set(prev); s.delete(fieldId); return s })
    // Automatisch opslaan kort na de laatste wijziging
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => save(next), AUTOSAVE_MS)
  }

  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
  }

  if (!result) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <XCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-lg font-medium text-gray-900">Vragenlijst niet gevonden</h2>
        <p className="mt-2 text-sm text-gray-500">{loadError || 'Deze link is ongeldig of niet meer actief.'}</p>
      </div>
    )
  }

  const { form, submitted_at } = result.document
  const steps = form.steps || []

  // Ingestuurd: bedankt + overzicht van de antwoorden (alleen-lezen)
  if (submitted_at) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-6 h-6 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Bedankt voor het invullen!</h1>
          <p className="text-sm text-gray-500 mt-2">
            Je antwoorden op <strong>{form.title}</strong> zijn op {formatDateTime(submitted_at)} bij mij binnengekomen.
            Wil je nog iets aanvullen of wijzigen? Laat het me gerust weten.
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 space-y-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Je antwoorden</h2>
          {steps.map(step => (
            <div key={step.id} className="space-y-3">
              {step.title && <h3 className="text-base font-semibold text-gray-900">{step.title}</h3>}
              {step.fields.filter(f => f.type !== 'heading').map(field => (
                <div key={field.id}>
                  <p className="text-xs font-medium text-gray-500">{field.label}</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{answerText(field, values[field.id]) || '—'}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (steps.length === 0) {
    return <div className="max-w-5xl mx-auto py-12 text-center text-sm text-gray-500">Deze vragenlijst bevat nog geen vragen.</div>
  }

  const step = steps[currentStep]
  const isLastStep = currentStep === steps.length - 1

  const goTo = (index: number) => {
    save(values)
    setCurrentStep(index)
    setSubmitError('')
    scrollTop()
  }

  const next = () => {
    const open = missingRequired(step.fields, values)
    if (open.length > 0) {
      setMissing(new Set(open))
      return
    }
    goTo(currentStep + 1)
  }

  const submit = async () => {
    // Eerst alle stappen controleren; spring naar de eerste stap met een open verplichte vraag
    for (let i = 0; i < steps.length; i++) {
      const open = missingRequired(steps[i].fields, values)
      if (open.length > 0) {
        setMissing(new Set(open))
        setCurrentStep(i)
        setSubmitError('Er staan nog verplichte vragen open.')
        scrollTop()
        return
      }
    }
    if (timer.current) clearTimeout(timer.current)
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await callPublicDocument<FormResult>({ action: 'submit', type: 'form', token, data: values })
      setResult(res)
      scrollTop()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Insturen mislukt. Probeer het opnieuw.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div ref={topRef} className="max-w-5xl mx-auto scroll-mt-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 sm:px-8 py-5 sm:py-6 border-b border-gray-100">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">Vragenlijst{result.project_name ? ` · ${result.project_name}` : ''}</p>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold text-gray-900">{form.title}</h1>
          {form.description && <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{form.description}</p>}
          <p className="text-xs text-gray-400 mt-2">Wat je invult, wordt vanzelf bewaard. Je kunt stoppen en later via dezelfde link verder.</p>

          {steps.length > 1 && (
            <div className="flex items-center gap-2 mt-4">
              {steps.map((s, i) => (
                <button type="button" key={s.id} onClick={() => goTo(i)} title={s.title || `Stap ${i + 1}`}
                  className={`h-1.5 flex-1 rounded-full transition-colors cursor-pointer ${
                    i === currentStep ? 'bg-primary' : i < currentStep ? 'bg-primary/40' : 'bg-gray-200 hover:bg-gray-300'
                  }`} />
              ))}
            </div>
          )}
        </div>

        <div className="px-6 sm:px-8 py-6 sm:py-8">
          {step.title && <h2 className="text-lg font-semibold text-gray-900 mb-5">{step.title}</h2>}
          <FormStepFields fields={step.fields} values={values} onChange={change} missing={missing} />
          {submitError && <p className="mt-5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{submitError}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 sm:px-8 py-4 bg-gray-50 border-t border-gray-100">
          <div>
            {currentStep > 0 && (
              <button type="button" onClick={() => goTo(currentStep - 1)}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors">
                <ChevronLeft className="w-4 h-4" />
                Vorige
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {saveState === 'saving' && <span className="text-xs text-gray-400">Opslaan...</span>}
            {saveState === 'saved' && <span className="flex items-center gap-1 text-xs text-green-600"><Check className="w-3.5 h-3.5" />Bewaard</span>}
            {saveState === 'error' && <span className="flex items-center gap-1 text-xs text-amber-600"><CloudOff className="w-3.5 h-3.5" />Niet bewaard</span>}
            {steps.length > 1 && <span className="hidden sm:inline text-xs text-gray-400">Stap {currentStep + 1} van {steps.length}</span>}
            {isLastStep ? (
              <button type="button" onClick={submit} disabled={submitting}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Insturen
              </button>
            ) : (
              <button type="button" onClick={next}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-xl transition-colors">
                Volgende
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
