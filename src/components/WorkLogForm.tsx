import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { WorkLog, WorkLogCategory } from '../types'
import RichTextEditor from './RichTextEditor'
import { DURATION_PRESETS, WORK_LOG_CATEGORIES, formatDuration, htmlToText, toEditorHtml, todayISO } from '../lib/workLogs'

type ProjectOption = { id: string; name: string; status?: string }

// Formulier om een werkzaamheid vast te leggen of te bewerken. Met `projectId` staat het
// domein vast (domeinpagina); anders kies je het domein uit `projects`. Mount het formulier
// opnieuw (key) voor elke nieuwe invoer: de editor neemt zijn inhoud alleen bij mount over.
export default function WorkLogForm({
  projects = [],
  projectId,
  defaultProjectId = '',
  log = null,
  onSaved,
  onCancel,
}: {
  projects?: ProjectOption[]
  projectId?: string
  defaultProjectId?: string
  log?: WorkLog | null
  onSaved: () => void
  onCancel: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState(() => log ? {
    project_id: log.project_id,
    performed_at: log.performed_at,
    title: log.title,
    description: toEditorHtml(log.description),
    duration_minutes: String(log.duration_minutes),
    category: log.category,
    billable: log.billable,
  } : {
    project_id: projectId || defaultProjectId,
    performed_at: todayISO(),
    title: '',
    description: '',
    duration_minutes: '30',
    category: 'onderhoud' as WorkLogCategory,
    billable: false,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.project_id || !formData.title.trim()) return
    setSaving(true)

    const payload = {
      project_id: formData.project_id,
      performed_at: formData.performed_at,
      title: formData.title.trim(),
      description: htmlToText(formData.description).trim() ? formData.description : '',
      duration_minutes: parseInt(formData.duration_minutes) || 0,
      category: formData.category,
      billable: formData.billable,
    }

    const { error } = log
      ? await supabase.from('work_logs').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', log.id)
      : await supabase.from('work_logs').insert(payload)
    setSaving(false)
    if (error) {
      alert('Opslaan mislukt: ' + error.message)
      return
    }
    onSaved()
  }

  const inputClass = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all'

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">
          {log ? 'Werkzaamheid bewerken' : 'Nieuwe werkzaamheid vastleggen'}
        </h2>
        <button type="button" onClick={onCancel} aria-label="Sluiten" className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${projectId ? '' : 'lg:grid-cols-3'}`}>
        {!projectId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Domein</label>
            <select
              value={formData.project_id}
              onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
              className={inputClass}
              required
            >
              <option value="">Kies een domein...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.status === 'archived' ? ' (gearchiveerd)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Datum</label>
          <input
            type="date"
            value={formData.performed_at}
            onChange={(e) => setFormData({ ...formData, performed_at: e.target.value })}
            className={inputClass}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Categorie</label>
          <select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value as WorkLogCategory })}
            className={inputClass}
          >
            {WORK_LOG_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2 lg:col-span-full">
          <label className="block text-sm font-medium text-gray-700 mb-1">Titel</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className={inputClass}
            placeholder="Plugins bijgewerkt en cache geleegd"
            required
          />
        </div>

        <div className="md:col-span-2 lg:col-span-full">
          <label className="block text-sm font-medium text-gray-700 mb-1">Uitgevoerde werkzaamheden</label>
          <RichTextEditor
            value={formData.description}
            onChange={(html) => setFormData((prev) => ({ ...prev, description: html }))}
            placeholder="Wat heb je precies gedaan? Denk aan wat je over een jaar nog wilt weten."
          />
        </div>

        <div className={projectId ? '' : 'lg:col-span-2'}>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tijdsduur (minuten)</label>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              step={5}
              value={formData.duration_minutes}
              onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
              className="w-28 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
            />
            <div className="flex flex-wrap gap-1.5">
              {DURATION_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setFormData({ ...formData, duration_minutes: String(m) })}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                    formData.duration_minutes === String(m)
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {formatDuration(m)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Facturabel</label>
          <div className="flex gap-2 mt-0.5">
            {[
              { value: false, label: 'Nee' },
              { value: true, label: 'Ja' },
            ].map((opt) => (
              <button
                type="button"
                key={String(opt.value)}
                onClick={() => setFormData({ ...formData, billable: opt.value })}
                className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                  formData.billable === opt.value
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-5">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 bg-primary hover:bg-primary-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-medium transition-colors text-sm"
        >
          {saving ? 'Bezig...' : log ? 'Opslaan' : 'Vastleggen'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors">
          Annuleren
        </button>
      </div>
    </form>
  )
}
