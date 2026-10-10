import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Link2, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface Shortcut {
  id: string
  title: string
  url: string
  sort_order: number
}

const emptyForm = { title: '', url: '' }

// "hpanel.hostinger.com/x" -> "https://hpanel.hostinger.com/x"
const normalizeUrl = (url: string) => {
  const trimmed = url.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// Favicon van de site; lukt dat niet, dan de eerste letter van de naam
function ShortcutIcon({ shortcut }: { shortcut: Shortcut }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className="w-full h-full flex items-center justify-center text-sm font-bold text-primary">
        {shortcut.title.charAt(0).toUpperCase()}
      </span>
    )
  }
  return (
    <img src={`https://icons.duckduckgo.com/ip3/${hostOf(shortcut.url)}.ico`} alt="" loading="lazy"
      className="w-5 h-5" onError={() => setFailed(true)} />
  )
}

// Dashboard: snelkoppelingen naar tools die ik vaak gebruik (Sinosend, Inprivy, Hostinger, ...)
export default function DashboardShortcuts() {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [editing, setEditing] = useState<Shortcut | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('admin_shortcuts')
      .select('id, title, url, sort_order')
      .order('sort_order')
      .order('created_at')
    setShortcuts((data || []) as Shortcut[])
    setLoading(false)
  }, [])

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load])

  const openForm = (shortcut: Shortcut | null) => {
    setEditing(shortcut)
    setForm(shortcut ? { title: shortcut.title, url: shortcut.url } : emptyForm)
    setError('')
    setShowForm(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const url = normalizeUrl(form.url)
    try {
      new URL(url)
    } catch {
      setError('Dit is geen geldig webadres.')
      return
    }
    setSaving(true)
    setError('')
    const payload = { title: form.title.trim(), url }
    const nextOrder = shortcuts.length > 0 ? Math.max(...shortcuts.map(s => s.sort_order)) + 1 : 0
    const { error: err } = editing
      ? await supabase.from('admin_shortcuts').update(payload).eq('id', editing.id)
      : await supabase.from('admin_shortcuts').insert({ ...payload, sort_order: nextOrder })
    setSaving(false)
    if (err) {
      setError(`Opslaan mislukt: ${err.message}`)
      return
    }
    setShowForm(false)
    await load()
  }

  const remove = async (shortcut: Shortcut) => {
    if (!confirm(`Snelkoppeling "${shortcut.title}" verwijderen?`)) return
    await supabase.from('admin_shortcuts').delete().eq('id', shortcut.id)
    await load()
  }

  // Wisselt een tegel met zijn buur; daarna krijgt elke tegel zijn positie als volgorde
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= shortcuts.length) return
    const reordered = [...shortcuts]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    setShortcuts(reordered)
    await Promise.all(
      reordered
        .map((s, i) => ({ s, i }))
        .filter(({ s, i }) => s.sort_order !== i)
        .map(({ s, i }) => supabase.from('admin_shortcuts').update({ sort_order: i }).eq('id', s.id)),
    )
    await load()
  }

  const inputClass = 'w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all'

  return (
    <div className="mt-8 bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-gray-900">Snelkoppelingen</h2>
        </div>
        <div className="flex items-center gap-3">
          {shortcuts.length > 0 && (
            <button type="button" onClick={() => setEditMode(v => !v)}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors">
              {editMode ? 'Klaar' : 'Bewerken'}
            </button>
          )}
          <button type="button" onClick={() => openForm(null)}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Toevoegen
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
        </div>
      ) : shortcuts.length === 0 ? (
        <button type="button" onClick={() => openForm(null)}
          className="w-full rounded-xl border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-400 hover:border-primary/40 hover:text-primary transition-colors">
          Voeg je eerste snelkoppeling toe, bijvoorbeeld naar Hostinger, Sinosend of Inprivy.
        </button>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {shortcuts.map((shortcut, index) => (
            <div key={shortcut.id} className="group">
              <a href={shortcut.url} target="_blank" rel="noopener noreferrer"
                onClick={(e) => { if (editMode) e.preventDefault() }}
                className={`flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 transition-colors ${
                  editMode ? 'cursor-default' : 'hover:border-primary/30 hover:bg-primary/5'
                }`}>
                <span className="w-9 h-9 rounded-lg bg-white border border-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  <ShortcutIcon key={shortcut.url} shortcut={shortcut} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-medium text-gray-900">
                    <span className="truncate">{shortcut.title}</span>
                    {!editMode && <ExternalLink className="w-3 h-3 text-gray-300 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />}
                  </span>
                  <span className="block text-[11px] text-gray-400 truncate">{hostOf(shortcut.url)}</span>
                </span>
              </a>
              {editMode && (
                <div className="mt-1 flex items-center justify-center gap-0.5">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} title="Naar links"
                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded-md">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => openForm(shortcut)} title="Wijzigen"
                    className="p-1 text-gray-400 hover:text-primary rounded-md">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => remove(shortcut)} title="Verwijderen"
                    className="p-1 text-gray-400 hover:text-red-500 rounded-md">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === shortcuts.length - 1} title="Naar rechts"
                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded-md">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 pt-[12vh] overflow-y-auto" onClick={() => setShowForm(false)}>
          <form onSubmit={save} className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">{editing ? 'Snelkoppeling wijzigen' : 'Snelkoppeling toevoegen'}</h3>
              <button type="button" onClick={() => setShowForm(false)} aria-label="Sluiten" className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Naam *</label>
                <input type="text" required maxLength={40} autoFocus value={form.title} className={inputClass} placeholder="Hostinger"
                  onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Webadres *</label>
                <input type="text" required inputMode="url" value={form.url} className={inputClass} placeholder="hpanel.hostinger.com"
                  onChange={(e) => setForm(f => ({ ...f, url: e.target.value }))} />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 pb-5">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Annuleren</button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary-600 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editing ? 'Opslaan' : 'Toevoegen'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
