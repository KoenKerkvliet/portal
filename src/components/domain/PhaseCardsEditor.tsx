import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ProjectPhase, PhaseTemplate, PhaseStep, CardElement } from '../../types'
import { Plus, Trash2, ChevronDown, Layers, Save, RotateCcw, CheckCircle, Eye, EyeOff } from 'lucide-react'
import CardElementsEditor from '../CardElementEditor'
import { phaseLabels, preservedCustomDataKeys, type IntakeLinks, type PhaseCustomData, type ProjectPhaseInstance } from './domainShared'

interface Draft {
  content: string
  steps: PhaseStep[]
  show_file_footer?: boolean
  show_feedback_footer?: boolean
}

const fromInstance = (instance: ProjectPhaseInstance): Draft => {
  const customData = instance.custom_data || { content: '', steps: [] }
  return {
    content: customData.content || '',
    steps: customData.steps || [],
    show_file_footer: customData.show_file_footer || false,
    show_feedback_footer: customData.show_feedback_footer || false,
  }
}

const cloneSteps = (steps: PhaseStep[]): PhaseStep[] =>
  steps.map(s => ({ ...s, elements: s.elements?.map(el => ({ ...el, data: { ...el.data } })) }))

const fetchFreshCustomData = async (instanceId: string): Promise<PhaseCustomData | null> => {
  const { data } = await supabase.from('project_phases').select('custom_data').eq('id', instanceId).single()
  return (data?.custom_data as PhaseCustomData | null) ?? null
}

export default function PhaseCardsEditor({
  projectId,
  phase,
  instance,
  templates,
  intakeLinks,
  onChanged,
  onDirtyChange,
  notify,
}: {
  projectId: string
  phase: ProjectPhase
  instance: ProjectPhaseInstance | null
  templates: PhaseTemplate[]
  intakeLinks?: IntakeLinks
  onChanged: () => Promise<void>
  onDirtyChange: (phase: ProjectPhase, dirty: boolean) => void
  notify: (title: string, message: string) => void
}) {
  const [draft, setDraft] = useState<Draft | null>(instance ? fromInstance(instance) : null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null)
  const [reloadOpen, setReloadOpen] = useState(false)
  const reloadRef = useRef<HTMLDivElement>(null)

  // Nieuwe data uit de database overnemen, behalve als er onopgeslagen wijzigingen zijn
  useEffect(() => {
    if (!dirty) setDraft(instance ? fromInstance(instance) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance])

  useEffect(() => { onDirtyChange(phase, dirty) }, [dirty, phase, onDirtyChange])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (reloadRef.current && !reloadRef.current.contains(e.target as Node)) setReloadOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const edit = (next: Draft) => {
    setDraft(next)
    setDirty(true)
  }

  const loadTemplate = async (template: PhaseTemplate) => {
    const customData: PhaseCustomData = {
      content: template.content || '',
      steps: template.steps.map(s => ({ ...s, id: crypto.randomUUID() })),
      show_file_footer: (template as unknown as { show_file_footer?: boolean }).show_file_footer || false,
      show_feedback_footer: (template as unknown as { show_feedback_footer?: boolean }).show_feedback_footer || false,
    }

    if (instance) {
      // Koppelingen en design-afbeeldingen horen niet bij de template en blijven staan
      const fresh = (await fetchFreshCustomData(instance.id)) || instance.custom_data || {}
      const preserved: PhaseCustomData = {}
      for (const key of preservedCustomDataKeys) {
        if (fresh[key] !== undefined) (preserved as Record<string, unknown>)[key] = fresh[key]
      }
      await supabase.from('project_phases').update({
        template_id: template.id,
        custom_data: { ...preserved, ...customData },
      }).eq('id', instance.id)
    } else {
      await supabase.from('project_phases').insert({
        project_id: projectId,
        phase,
        template_id: template.id,
        custom_data: customData,
        status: 'active',
      })
    }
    setDirty(false)
    await onChanged()
  }

  const save = async () => {
    if (!draft || !instance) return
    setSaving(true)

    const steps = cloneSteps(draft.steps)
    const dataToSave: Record<string, unknown> = { ...draft, steps }
    if (phase === 'intake' && intakeLinks) {
      dataToSave.linked_quote_id = intakeLinks.quote_id || undefined
      dataToSave.linked_invoice_id = intakeLinks.invoice_id || undefined
      dataToSave.linked_assignment_id = intakeLinks.assignment_id || undefined

      // Gekoppelde offerte/opdracht/factuur doorzetten naar de knoppen + die stappen zichtbaar maken
      for (const step of steps) {
        if (!step.elements) continue
        for (const el of step.elements) {
          if (el.type === 'button' && el.data.action === 'quote' && intakeLinks.quote_id) {
            el.data.quoteId = intakeLinks.quote_id
            if (step.faded) step.faded = false
          }
          if (el.type === 'button' && el.data.action === 'invoice' && intakeLinks.invoice_id) {
            el.data.invoiceId = intakeLinks.invoice_id
            if (step.faded) step.faded = false
          }
          if (el.type === 'button' && el.data.action === 'assignment' && intakeLinks.assignment_id) {
            el.data.assignmentId = intakeLinks.assignment_id
            if (step.faded) step.faded = false
          }
        }
      }
    }

    // Vers ophalen en samenvoegen, zodat design-afbeeldingen en goedkeuringen van de klant blijven staan
    const fresh = (await fetchFreshCustomData(instance.id)) || instance.custom_data || {}
    await supabase.from('project_phases').update({
      custom_data: { ...fresh, ...dataToSave },
    }).eq('id', instance.id)

    // Gekoppelde offertes/facturen op 'verzonden' zetten
    const quoteIds: string[] = []
    const invoiceIds: string[] = []
    for (const step of steps) {
      if (!step.elements) continue
      for (const el of step.elements) {
        if (el.type === 'button' && el.data.action === 'quote' && el.data.quoteId) quoteIds.push(el.data.quoteId)
        if (el.type === 'button' && el.data.action === 'invoice' && el.data.invoiceId) invoiceIds.push(el.data.invoiceId)
      }
    }
    if (quoteIds.length > 0) {
      await supabase.from('quotes').update({ status: 'sent' }).in('id', quoteIds).eq('status', 'draft')
    }
    if (invoiceIds.length > 0) {
      await supabase.from('invoices').update({ status: 'sent' }).in('id', invoiceIds).eq('status', 'draft')
    }

    setDirty(false)
    await onChanged()
    notify('Je portaal is bijgewerkt', `De ${phaseLabels[phase]}-fase is bijgewerkt.`)
    setSaving(false)
  }

  const discard = () => {
    if (!confirm('Onopgeslagen wijzigingen in deze fase weggooien?')) return
    setDraft(instance ? fromInstance(instance) : null)
    setDirty(false)
  }

  const toggleStepCompleted = async (stepId: string) => {
    if (!instance?.custom_data?.steps) return
    const step = instance.custom_data.steps.find(s => s.id === stepId)
    const action = step?.completed ? 'als niet voltooid markeren' : 'als voltooid markeren'
    if (!confirm(`Weet je zeker dat je "${step?.title || 'deze stap'}" wilt ${action}?`)) return

    const fresh = (await fetchFreshCustomData(instance.id)) || instance.custom_data
    const updatedSteps = (fresh.steps || []).map(s => s.id === stepId ? { ...s, completed: !s.completed } : s)
    await supabase.from('project_phases').update({
      custom_data: { ...fresh, steps: updatedSteps },
    }).eq('id', instance.id)

    if (dirty && draft) {
      setDraft({ ...draft, steps: draft.steps.map(s => s.id === stepId ? { ...s, completed: !s.completed } : s) })
    }
    await onChanged()
  }

  const updateStep = (index: number, field: string, value: string | boolean | CardElement[]) => {
    if (!draft) return
    const steps = [...draft.steps]
    steps[index] = { ...steps[index], [field]: value }
    edit({ ...draft, steps })
  }

  const addStep = () => {
    if (!draft) return
    edit({ ...draft, steps: [...draft.steps, { id: crypto.randomUUID(), title: '', description: '', completed: false, faded: false }] })
  }

  const removeStep = (index: number) => {
    if (!draft) return
    edit({ ...draft, steps: draft.steps.filter((_, i) => i !== index) })
  }

  const toggleStepFaded = (index: number) => {
    if (!draft) return
    const steps = [...draft.steps]
    steps[index] = { ...steps[index], faded: !steps[index].faded }
    edit({ ...draft, steps })
  }

  if (!instance || !draft) {
    return templates.length > 0 ? (
      <div>
        <p className="text-sm text-gray-500 mb-3">
          Nog niet ingericht. Kies een template voor de fase <span className="font-medium">{phaseLabels[phase]}</span>:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {templates.map((t) => (
            <button key={t.id} onClick={() => loadTemplate(t)}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-primary hover:bg-primary/5 transition-colors text-left">
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
      <div className="text-center py-4">
        <p className="text-sm text-gray-400">Geen templates beschikbaar voor de fase &quot;{phaseLabels[phase]}&quot;.</p>
        <p className="text-xs text-gray-400 mt-1">Maak eerst een template aan via het Templates menu.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-400">
          Inhoud die de klant ziet als het domein in de fase <span className="font-medium">{phaseLabels[phase]}</span> staat.
        </p>
        {templates.length > 0 && (
          <div className="relative flex-shrink-0" ref={reloadRef}>
            {templates.length === 1 ? (
              <button onClick={() => { if (confirm('Template opnieuw inladen? De cards en tekst van deze fase worden overschreven.')) loadTemplate(templates[0]) }}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary transition-colors whitespace-nowrap">
                <RotateCcw className="w-3 h-3" />
                Herlaad template
              </button>
            ) : (
              <>
                <button onClick={() => setReloadOpen(!reloadOpen)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary transition-colors whitespace-nowrap">
                  <RotateCcw className="w-3 h-3" />
                  Herlaad template
                </button>
                {reloadOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50 min-w-[180px]">
                    {templates.map((t) => (
                      <button key={t.id} onClick={() => { setReloadOpen(false); if (confirm(`Template "${t.title}" opnieuw inladen?`)) loadTemplate(t) }}
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

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Inhoud (zichtbaar voor klant)</label>
        <textarea value={draft.content}
          onChange={(e) => edit({ ...draft, content: e.target.value })}
          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm resize-none"
          rows={3} placeholder="Tekst of instructies voor de klant..." />
      </div>

      <label className="flex items-center gap-2 cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={draft.show_file_footer || false}
          onChange={(e) => edit({ ...draft, show_file_footer: e.target.checked })}
          className="w-3.5 h-3.5 rounded text-primary border-gray-300 focus:ring-primary/30"
        />
        <span className="text-xs text-gray-600">Bestanden delen footer</span>
      </label>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-500">Cards (zichtbaar voor klant)</label>
          <button type="button" onClick={addStep}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary-600 font-medium transition-colors">
            <Plus className="w-3 h-3" />
            Card toevoegen
          </button>
        </div>
        {draft.steps.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-400">Nog geen cards.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {draft.steps.map((step, index) => {
              const isStepExpanded = expandedStepId === step.id
              const elemCount = step.elements?.length || 0
              return (
                <div key={step.id} className={`border border-gray-200 rounded-lg overflow-hidden ${step.faded ? 'bg-amber-50/50 border-amber-200' : 'bg-gray-50'} ${step.completed ? 'ring-2 ring-green-200' : ''}`}>
                  <div className="flex gap-2 items-start p-3">
                    <div className="flex-1">
                      <input type="text" value={step.title}
                        onChange={(e) => updateStep(index, 'title', e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                        placeholder="Card titel" />
                    </div>
                    <div className="flex items-center gap-0.5 mt-1">
                      <button
                        type="button"
                        onClick={() => toggleStepCompleted(step.id)}
                        className={`p-1 rounded transition-colors ${step.completed ? 'text-green-500 hover:text-green-700 bg-green-50' : 'text-gray-400 hover:text-green-500 hover:bg-green-50'}`}
                        title={step.completed ? 'Markeer als niet voltooid' : 'Markeer als voltooid'}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStepFaded(index)}
                        className={`p-1 rounded transition-colors ${step.faded ? 'text-amber-500 hover:text-amber-700 bg-amber-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                        title={step.faded ? 'Zichtbaar maken' : 'Faden (nog niet aan de beurt)'}
                      >
                        {step.faded ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button type="button" onClick={() => removeStep(index)}
                        className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <button type="button" onClick={() => setExpandedStepId(isStepExpanded ? null : step.id)}
                    className="w-full flex items-center justify-between px-3 py-2 border-t border-gray-200 hover:bg-gray-100 transition-colors">
                    <span className="text-xs font-medium text-gray-500">
                      {elemCount} {elemCount === 1 ? 'element' : 'elementen'}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isStepExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {isStepExpanded && (
                    <div className="px-3 pb-3 pt-2 border-t border-gray-200 bg-white">
                      <CardElementsEditor
                        elements={step.elements || []}
                        onChange={(elements) => updateStep(index, 'elements', elements)}
                        projectId={projectId}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        {dirty && (
          <>
            <span className="text-xs font-medium text-amber-600">Niet opgeslagen</span>
            <button onClick={discard} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
              Annuleren
            </button>
          </>
        )}
        <button onClick={save}
          disabled={saving || !dirty}
          className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
          <Save className="w-4 h-4" />
          {saving ? 'Opslaan...' : 'Opslaan'}
        </button>
      </div>
    </div>
  )
}
