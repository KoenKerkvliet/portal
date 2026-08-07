import { randomUUID } from 'node:crypto'

// ============================================================
// FORMS — vult ontbrekende id's aan zodat bestaande velden hun
// id behouden bij update (consistent met submissions).
// ============================================================

export interface FormFieldInput {
  id?: string
  type: 'heading' | 'text' | 'textarea' | 'email' | 'phone' | 'select' | 'checkbox' | 'radio' | 'date' | 'number'
  label?: string
  placeholder?: string
  required?: boolean
  options?: { id?: string; label: string }[]
}

export interface FormStepInput {
  id?: string
  title?: string
  fields?: FormFieldInput[]
}

export function normalizeFormSteps(steps: FormStepInput[] | undefined) {
  return (steps ?? []).map((step) => ({
    id: step.id ?? randomUUID(),
    title: step.title ?? 'Stap',
    fields: (step.fields ?? []).map((f) => {
      const base: Record<string, unknown> = {
        id: f.id ?? randomUUID(),
        type: f.type,
        label: f.label ?? '',
      }
      if (f.placeholder !== undefined) base.placeholder = f.placeholder
      if (f.required !== undefined) base.required = f.required
      if (f.options) {
        base.options = f.options.map((o) => ({
          id: o.id ?? randomUUID(),
          label: o.label,
        }))
      }
      return base
    }),
  }))
}

// ============================================================
// TEMPLATES — PhaseStep met optionele CardElement[]
// ============================================================

export interface CardElementInput {
  id?: string
  type: 'text' | 'icon' | 'dynamic' | 'link' | 'button'
  data: Record<string, string>
}

export interface PhaseStepInput {
  id?: string
  title?: string
  description?: string
  completed?: boolean
  faded?: boolean
  elements?: CardElementInput[]
}

export function normalizePhaseSteps(steps: PhaseStepInput[] | undefined) {
  return (steps ?? []).map((step) => {
    const out: Record<string, unknown> = {
      id: step.id ?? randomUUID(),
      title: step.title ?? '',
      description: step.description ?? '',
      completed: step.completed ?? false,
    }
    if (step.faded !== undefined) out.faded = step.faded
    if (step.elements) {
      out.elements = step.elements.map((e) => ({
        id: e.id ?? randomUUID(),
        type: e.type,
        data: e.data ?? {},
      }))
    }
    return out
  })
}
