import { useCallback, useEffect, useState } from 'react'
import { CalendarOff, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ANNOUNCE_DAYS, absenceHeadline, absenceState, formatAbsenceDay, type Absence } from '../lib/absence'

const emptyForm = { starts_on: '', ends_on: '', message: '', emergency: '' }

const stateLabel: Record<string, { label: string; className: string }> = {
  active: { label: 'Nu afwezig', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  announced: { label: 'Wordt getoond', className: 'bg-primary/10 text-primary border-primary/20' },
  later: { label: 'Gepland', className: 'bg-gray-50 text-gray-600 border-gray-200' },
  past: { label: 'Voorbij', className: 'bg-gray-50 text-gray-400 border-gray-200' },
}

// Dashboard: afwezigheid plannen. Klanten zien een melding vanaf 14 dagen voor de start
// tot en met de laatste dag (portaal, links uit mails, kennisbank, chat-assistent).
export default function AbsenceManager() {
  const [absences, setAbsences] = useState<Absence[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Absence | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('absences').select('*').order('starts_on', { ascending: false }).limit(20)
    setAbsences((data || []) as Absence[])
  }, [])

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load])

  const upcoming = [...absences].filter(a => absenceState(a) !== 'past').sort((x, y) => x.starts_on.localeCompare(y.starts_on))
  const past = absences.filter(a => absenceState(a) === 'past').slice(0, 3)
  const next = upcoming[0]

  const startNew = () => {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowForm(true)
  }

  const startEdit = (a: Absence) => {
    setEditing(a)
    setForm({ starts_on: a.starts_on, ends_on: a.ends_on, message: a.message, emergency: a.emergency })
    setError('')
    setShowForm(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.ends_on < form.starts_on) {
      setError('De laatste dag ligt voor de eerste dag.')
      return
    }
    setSaving(true)
    setError('')
    const payload = { starts_on: form.starts_on, ends_on: form.ends_on, message: form.message.trim(), emergency: form.emergency.trim() }
    const { error: err } = editing
      ? await supabase.from('absences').update(payload).eq('id', editing.id)
      : await supabase.from('absences').insert(payload)
    setSaving(false)
    if (err) {
      setError(`Opslaan mislukt: ${err.message}`)
      return
    }
    setShowForm(false)
    await load()
  }

  const remove = async (a: Absence) => {
    if (!confirm('Deze afwezigheid verwijderen? Klanten zien de melding dan niet meer.')) return
    await supabase.from('absences').delete().eq('id', a.id)
    await load()
  }

  const inputClass = 'w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all'

  const row = (a: Absence) => {
    const state = absenceState(a)
    const s = stateLabel[state]
    return (
      <li key={a.id} className="flex items-start gap-3 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">
              {a.starts_on === a.ends_on ? formatAbsenceDay(a.starts_on) : `${formatAbsenceDay(a.starts_on)} t/m ${formatAbsenceDay(a.ends_on)}`}
            </span>
            <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${s.className}`}>{s.label}</span>
          </div>
          {(a.message || a.emergency) && (
            <p className="text-xs text-gray-500 mt-0.5">{[a.message, a.emergency && `Spoed: ${a.emergency}`].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        {state !== 'past' && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button type="button" onClick={() => startEdit(a)} title="Wijzigen" className="p-1.5 text-gray-400 hover:text-primary rounded-lg hover:bg-primary/5">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => remove(a)} title="Verwijderen" className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </li>
    )
  }

  return (
    <>
      {/* Compacte status naast de titel van het dashboard */}
      <button type="button" onClick={() => setOpen(true)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
          next && absenceState(next) === 'active' ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
          : next ? 'bg-primary/5 border-primary/20 text-primary hover:bg-primary/10'
          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}>
        <CalendarOff className="w-4 h-4" />
        {next
          ? absenceState(next) === 'active'
            ? `Afwezig t/m ${formatAbsenceDay(next.ends_on)}`
            : `Afwezig vanaf ${formatAbsenceDay(next.starts_on)}`
          : 'Afwezigheid plannen'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 pt-[8vh] overflow-y-auto" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Afwezigheid</h2>
                <p className="text-xs text-gray-500 mt-0.5">Klanten zien een melding vanaf {ANNOUNCE_DAYS} dagen vooraf tot en met je laatste dag.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Sluiten" className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {showForm ? (
                <form onSubmit={save} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Eerste dag *</label>
                      <input type="date" required value={form.starts_on} className={inputClass}
                        onChange={(e) => setForm(f => ({ ...f, starts_on: e.target.value, ends_on: f.ends_on && f.ends_on >= e.target.value ? f.ends_on : e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Laatste dag *</label>
                      <input type="date" required min={form.starts_on || undefined} value={form.ends_on} className={inputClass}
                        onChange={(e) => setForm(f => ({ ...f, ends_on: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Toelichting (optioneel)</label>
                    <input type="text" maxLength={200} value={form.message} className={inputClass} placeholder="bijv. Ik ben op vakantie. Na terugkomst reageer ik zo snel mogelijk."
                      onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Bij spoed (optioneel)</label>
                    <input type="text" maxLength={200} value={form.emergency} className={inputClass} placeholder="bijv. Bel 06 45 35 24 87; ik kijk dagelijks even naar mijn mail."
                      onChange={(e) => setForm(f => ({ ...f, emergency: e.target.value }))} />
                  </div>
                  {form.starts_on && form.ends_on && (
                    <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-600">
                      <span className="font-medium text-gray-700">Voorbeeld tijdens je afwezigheid: </span>
                      {absenceHeadline({ ...form, id: '', created_at: '' }, form.starts_on)}
                      {form.message && ` ${form.message.trim()}`}
                      {form.emergency && ` Spoed? ${form.emergency.trim()}`}
                    </div>
                  )}
                  {error && <p className="text-xs text-red-600">{error}</p>}
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Annuleren</button>
                    <button type="submit" disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary-600 disabled:opacity-50">
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                      {editing ? 'Opslaan' : 'Inplannen'}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {upcoming.length === 0 ? (
                    <p className="text-sm text-gray-500">Er is geen afwezigheid gepland.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100">{upcoming.map(row)}</ul>
                  )}
                  <button type="button" onClick={startNew}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-600">
                    <Plus className="w-4 h-4" />
                    Afwezigheid plannen
                  </button>
                  {past.length > 0 && (
                    <div className="pt-2">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Eerder</p>
                      <ul className="divide-y divide-gray-100">{past.map(row)}</ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
