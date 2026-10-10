import { useEffect, useState } from 'react'
import { Check, CheckCircle2, ChevronDown, Clock, ExternalLink, ImagePlus, Loader2, MessageSquareText, Send, X } from 'lucide-react'
import { callPublicDocument, type PublicDocumentResult } from '../../lib/publicDocument'
import { columnOf, dueClass, dueLabel, dueState, type ProjectTask } from '../../lib/tasks'

interface PublicBoard {
  project: { name: string; phase: string; due_date: string | null; staging_url: string | null }
  tasks: ProjectTask[]
  feedback_open: boolean
}
type BoardResult = PublicDocumentResult<PublicBoard>

const COLUMNS = [
  { key: 'todo', label: 'Te doen' },
  { key: 'doing', label: 'Mee bezig' },
  { key: 'done', label: 'Klaar' },
] as const

const DONE_VISIBLE = 5
const MAX_SCREENSHOT = 5 * 1024 * 1024
const NAME_KEY = 'dp-feedback-name'

const formatLongDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

const readName = () => {
  try { return localStorage.getItem(NAME_KEY) || '' } catch { return '' }
}

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(file)
})

// Planning van een domein via de link in de mail, zonder inloggen: wat ik nog doe, waar ik
// mee bezig ben, wat klaar is en wat ik van de klant nodig heb. Met feedback op de testsite.
export default function PublicBoardPage({ token }: { token: string }) {
  const [result, setResult] = useState<BoardResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [openTask, setOpenTask] = useState<string | null>(null)
  const [showAllDone, setShowAllDone] = useState(false)
  const [delivering, setDelivering] = useState<string | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)
  const [thanks, setThanks] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setResult(await callPublicDocument<BoardResult>({ action: 'get', type: 'board', token }))
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : '')
      }
      setLoading(false)
    }
    load()
  }, [token])

  const markDelivered = async (task: ProjectTask) => {
    if (!confirm(`Heb je "${task.title}" aangeleverd? Ik krijg dan een seintje en kijk het na.`)) return
    setDelivering(task.id)
    try {
      setResult(await callPublicDocument<BoardResult>({ action: 'delivered', type: 'board', token, task_id: task.id }))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Er ging iets mis.')
    }
    setDelivering(null)
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  }
  if (!result) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <h1 className="text-lg font-semibold text-gray-900">Planning niet gevonden</h1>
        <p className="text-sm text-gray-500 mt-2">{loadError || 'Deze link is ongeldig of niet meer actief.'}</p>
      </div>
    )
  }

  const { project, tasks, feedback_open } = result.document
  const fromClient = tasks
    .filter(t => columnOf(t) === 'client')
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
  const doneCount = tasks.filter(t => t.status === 'done').length
  const percentage = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0

  const card = (task: ProjectTask, showDue = true) => {
    const state = showDue ? dueState(task.due_date, task.status === 'done') : null
    const expanded = openTask === task.id
    const hasDetails = !!(task.description && task.description !== task.title) || !!task.done_note || !!task.screenshot_url || !!task.feedback_page
    return (
      <div key={task.id} className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <button type="button" disabled={!hasDetails} onClick={() => setOpenTask(expanded ? null : task.id)}
          className="w-full text-left px-3.5 py-3 disabled:cursor-default">
          <div className="flex items-start gap-2">
            <p className={`flex-1 text-sm break-words ${task.status === 'done' ? 'text-gray-500' : 'text-gray-900'}`}>{task.title}</p>
            {hasDetails && <ChevronDown className={`w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />}
          </div>
          <div className="flex flex-wrap items-center gap-1 mt-1.5 empty:hidden">
            {task.is_feedback && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 text-[11px] font-medium">
                <MessageSquareText className="w-3 h-3" />
                Feedback{task.feedback_author ? ` van ${task.feedback_author}` : ''}
              </span>
            )}
            {state && task.due_date && (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-medium ${dueClass[state]}`}>
                <Clock className="w-3 h-3" />
                {task.assignee === 'client' && state !== 'overdue' ? `Uiterlijk ${dueLabel(task.due_date)}` : dueLabel(task.due_date)}
              </span>
            )}
          </div>
        </button>
        {expanded && (
          <div className="px-3.5 pb-3 space-y-2 text-sm text-gray-600">
            {task.description && task.description !== task.title && <p className="whitespace-pre-wrap">{task.description}</p>}
            {task.feedback_page && <p className="text-xs text-gray-400">Pagina: {task.feedback_page}</p>}
            {task.screenshot_url && (
              <a href={task.screenshot_url} target="_blank" rel="noopener noreferrer">
                <img src={task.screenshot_url} alt="Screenshot bij de feedback" className="max-h-48 rounded-lg border border-gray-100" />
              </a>
            )}
            {task.done_note && <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{task.done_note}</p>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Kop met voortgang */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
        <p className="text-xs font-medium text-primary uppercase tracking-wider">Planning</p>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{project.name}</h1>
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-gray-600">{doneCount} van {tasks.length} taken klaar</span>
            <span className="font-semibold text-gray-900">{percentage}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${percentage}%` }} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {project.due_date && (
            <span className="text-gray-600">Verwachte oplevering: <strong className="text-gray-900">{formatLongDate(project.due_date)}</strong></span>
          )}
          {project.staging_url && (
            <a href={project.staging_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:text-primary-600">
              Bekijk de testsite <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
        {feedback_open && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-primary/5 border border-primary/10 px-4 py-3">
            <p className="flex-1 min-w-[200px] text-sm text-gray-700">Zie je op de testsite iets wat anders moet? Geef het hier door, dan komt het op de planning.</p>
            <button type="button" onClick={() => { setShowFeedback(true); setThanks(false) }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary-600">
              <MessageSquareText className="w-4 h-4" /> Feedback geven
            </button>
          </div>
        )}
        {thanks && (
          <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="w-4 h-4" /> Bedankt! Je feedback staat op de planning onder Te doen.
          </p>
        )}
      </div>

      {/* Van jou nodig */}
      {fromClient.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-amber-900">Van jou nodig</h2>
          <p className="text-xs text-amber-800/80 mt-0.5">Hiervoor wacht ik op jou. Heb je het aangeleverd? Laat het me weten met de knop.</p>
          <div className="mt-3 space-y-2">
            {fromClient.map((task) => (
              <div key={task.id} className="flex flex-col sm:flex-row sm:items-start gap-2">
                <div className="flex-1 min-w-0">{card(task)}</div>
                {task.client_done_at ? (
                  <span className="inline-flex items-center gap-1.5 self-start px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg"
                    title={`Gemeld op ${formatDateTime(task.client_done_at)}`}>
                    <Check className="w-3.5 h-3.5" /> Aangeleverd, ik kijk het na
                  </span>
                ) : (
                  <button type="button" onClick={() => markDelivered(task)} disabled={delivering === task.id}
                    className="inline-flex items-center gap-1.5 self-start px-3 py-2 text-xs font-medium text-amber-900 bg-white border border-amber-200 hover:bg-amber-100 rounded-lg disabled:opacity-50">
                    {delivering === task.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Aangeleverd
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kolommen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((column) => {
          const columnTasks = tasks.filter(t => t.assignee !== 'client' || t.status === 'done').filter(t => columnOf(t) === column.key)
          const sorted = column.key === 'done'
            ? [...columnTasks].sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))
            : columnTasks
          const shown = column.key === 'done' && !showAllDone ? sorted.slice(0, DONE_VISIBLE) : sorted
          return (
            <div key={column.key} className="rounded-2xl bg-gray-100/70 p-3">
              <div className="flex items-center justify-between px-1 pb-2">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{column.label}</h2>
                <span className="text-xs text-gray-400">{columnTasks.length}</span>
              </div>
              <div className="space-y-2">
                {shown.length === 0 && <p className="px-1 py-2 text-xs text-gray-400">Niets op dit moment.</p>}
                {shown.map((task) => card(task, column.key !== 'done'))}
                {column.key === 'done' && sorted.length > DONE_VISIBLE && (
                  <button type="button" onClick={() => setShowAllDone(v => !v)}
                    className="w-full text-xs font-medium text-gray-500 hover:text-gray-700 py-1">
                    {showAllDone ? 'Toon minder' : `Toon alle ${sorted.length}`}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {showFeedback && (
        <FeedbackForm token={token} defaultPage={project.staging_url || ''}
          onClose={() => setShowFeedback(false)}
          onSent={(res) => { setResult(res); setShowFeedback(false); setThanks(true) }} />
      )}
    </div>
  )
}

function FeedbackForm({ token, defaultPage, onClose, onSent }: {
  token: string
  defaultPage: string
  onClose: () => void
  onSent: (result: BoardResult) => void
}) {
  const [text, setText] = useState('')
  const [page, setPage] = useState(defaultPage)
  const [name, setName] = useState(readName)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const pickFile = (f: File | null) => {
    setError('')
    if (!f) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) {
      setError('Kies een PNG-, JPG- of WebP-afbeelding.')
      return
    }
    if (f.size > MAX_SCREENSHOT) {
      setError('Deze afbeelding is te groot (maximaal 5 MB).')
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  // Een screenshot plakken (Ctrl+V) werkt ook
  const onPaste = (e: React.ClipboardEvent) => {
    const item = [...e.clipboardData.items].find(i => i.type.startsWith('image/'))
    const pasted = item?.getAsFile()
    if (pasted) {
      e.preventDefault()
      pickFile(pasted)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true)
    setError('')
    try {
      try { localStorage.setItem(NAME_KEY, name.trim()) } catch { /* niet onthouden is prima */ }
      const screenshot = file ? { data: await toBase64(file), type: file.type } : undefined
      onSent(await callPublicDocument<BoardResult>({ action: 'feedback', type: 'board', token, text, page, name, screenshot }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er ging iets mis.')
      setSending(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 pt-[6vh] overflow-y-auto" onClick={onClose}>
      <form onSubmit={submit} onPaste={onPaste} className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Feedback geven</h2>
          <button type="button" onClick={onClose} aria-label="Sluiten" className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Wat moet er anders? *</label>
            <textarea required rows={4} autoFocus maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} className={inputClass}
              placeholder="Bijv. Op de contactpagina klopt het telefoonnummer niet, dat moet 06 12 34 56 78 zijn." />
            <p className="text-[11px] text-gray-400 mt-1">Eén punt per keer werkt het prettigst: dan zie je elk punt apart op de planning.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Op welke pagina?</label>
            <input value={page} maxLength={300} onChange={(e) => setPage(e.target.value)} className={inputClass}
              placeholder="Plak de link van de pagina, of bijv. Contact" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Je naam</label>
            <input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Zodat ik weet van wie het komt" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Screenshot (optioneel)</label>
            {preview ? (
              <div className="relative inline-block">
                <img src={preview} alt="" className="max-h-40 rounded-lg border border-gray-100" />
                <button type="button" onClick={() => { setFile(null); setPreview(null) }} aria-label="Screenshot weghalen"
                  className="absolute -top-2 -right-2 p-1 bg-white border border-gray-200 rounded-full text-gray-500 hover:text-red-500 shadow-sm">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-gray-200 text-sm text-gray-500 hover:border-primary/40 hover:text-primary cursor-pointer transition-colors">
                <ImagePlus className="w-4 h-4" />
                Kies een afbeelding of plak hem hier (Ctrl+V)
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0] || null)} />
              </label>
            )}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Annuleren</button>
          <button type="submit" disabled={sending || !text.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary-600 disabled:opacity-50">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Versturen
          </button>
        </div>
      </form>
    </div>
  )
}
