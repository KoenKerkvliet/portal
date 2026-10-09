import type { FormField } from '../types'

export type FormAnswers = Record<string, string | string[] | boolean>

const isEmpty = (v: FormAnswers[string] | undefined) =>
  v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0)

// Verplichte vragen in een lijst velden die nog geen antwoord hebben
export function missingRequired(fields: FormField[], values: FormAnswers): string[] {
  return fields.filter(f => f.required && f.type !== 'heading' && isEmpty(values[f.id])).map(f => f.id)
}

// Antwoord als leesbare tekst (keuzes als labels in plaats van ids), voor overzicht en PDF
export function answerText(field: FormField, value: FormAnswers[string] | undefined): string {
  if (value === undefined || isEmpty(value)) return ''
  const labelOf = (id: string) => field.options?.find(o => o.id === id)?.label || id
  if (Array.isArray(value)) return value.map(labelOf).join(', ')
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nee'
  if (field.type === 'select' || field.type === 'radio') return labelOf(value)
  if (field.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  return value
}
