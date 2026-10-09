// Gedeeld door de pagina Werkzaamheden en de onderhoudssectie op de domeinpagina
import type { WorkLogCategory } from '../types'

export const WORK_LOG_CATEGORIES: { value: WorkLogCategory; label: string; className: string }[] = [
  { value: 'onderhoud', label: 'Onderhoud', className: 'bg-emerald-50 text-emerald-700' },
  { value: 'update', label: 'Update', className: 'bg-blue-50 text-blue-700' },
  { value: 'bugfix', label: 'Bugfix', className: 'bg-red-50 text-red-600' },
  { value: 'content', label: 'Content', className: 'bg-amber-50 text-amber-700' },
  { value: 'design', label: 'Design', className: 'bg-pink-50 text-pink-700' },
  { value: 'development', label: 'Development', className: 'bg-indigo-50 text-indigo-700' },
  { value: 'seo', label: 'SEO', className: 'bg-teal-50 text-teal-700' },
  { value: 'beveiliging', label: 'Beveiliging', className: 'bg-orange-50 text-orange-700' },
  { value: 'overleg', label: 'Overleg', className: 'bg-purple-50 text-purple-700' },
  { value: 'overig', label: 'Overig', className: 'bg-gray-100 text-gray-600' },
]

export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120]

export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const formatDuration = (minutes: number) => {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h}u ${m}m`
  if (h) return `${h}u`
  return `${m}m`
}

// Oudere logs zijn als platte tekst opgeslagen; nieuwe als HTML uit de editor
export const isHtml = (text: string) => /<\/?[a-z][\s\S]*>/i.test(text)

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const toEditorHtml = (text: string) => {
  if (!text || isHtml(text)) return text
  return text
    .split('\n')
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')
}

export const htmlToText = (html: string) =>
  isHtml(html) ? new DOMParser().parseFromString(html, 'text/html').body.textContent || '' : html
