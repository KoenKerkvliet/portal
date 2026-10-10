import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Image as ImageIcon, Loader2, Lock, MessageSquareText, Plus, Send, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  BOARD_URL, columnOf, dueClass, dueLabel, dueState, newBoardToken, patchForColumn,
  type BoardColumn, type ProjectTask, type TaskAssignee, type TaskStatus,
} from '../../lib/tasks'

const COLUMNS: { key: BoardColumn; label: string; hint: string }[] = [
  { key: 'client', label: 'Van de klant nodig', hint: 'De klant ziet dit bovenaan als "Van jou nodig"' },
  { key: 'todo', label: 'Te doen', hint: '' },
  { key: 'doing', label: 'Mee bezig', hint: '' },
  { key: 'done', label: 'Klaar', hint: '' },
]

const DONE_VISIBLE = 6

interface Draft {
  title: string
  description: string
  assignee: TaskAssignee
  status: TaskStatus
  due_date: string
  private: boolean
  done_note: string
}

const draftOf = (task: ProjectTask): Draft => ({
  title: task.title,
  description: task.description,
  assignee: task.assignee,
  status: task.status,
  due_date: task.due_date || '',
  private: !!task.private,
  done_note: task.done_note,
})

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

// Domeinpagina (development en oplevering): takenbord met de link voor de klant
export default function DomainTasks({ projectId, boardToken, boardSentAt, onProjectChanged }: {
  projectId: string
  boardToken: string | null | undefined
  boardSentAt: string | null | undefined
  onProjectChanged: () => Promise<unknown> | void
}) {
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [loading, setLoading] = useState(true)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropColumn, setDropColumn] = useState<BoardColumn | null>(null)
  const [adding, setAdding] = useState<BoardColumn | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [editing, setEditing] = useState<ProjectTask | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showAllDone, setShowAllDone] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState('')
  const [showTemplate, setShowTemplate] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order')
      .order('created_at')
    setTasks((data || []) as ProjectTask[])
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load])

  const nextOrder = () => (tasks.length > 0 ? Math.max(...tasks.map(t => t.sort_order ?? 0)) + 1 : 0)

  const update = async (task: ProjectTask, patch: Partial<ProjectTask>) => {
    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, ...patch } : t)))
    await supabase.from('project_tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', task.id)
  }

  const moveTo = async (taskId: string, column: BoardColumn) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task || columnOf(task) === column) return
    await update(task, { ...patchForColumn(column), sort_order: nextOrder() })
  }

  const addTask = async (column: BoardColumn) => {
    const title = newTitle.trim()
    if (!title) {
      setAdding(null)
      return
    }
    const { assignee = 'me', status = 'todo' } = patchForColumn(column)
    await supabase.from('project_tasks').insert({ project_id: projectId, title, assignee, status, sort_order: nextOrder() })
    setNewTitle('')
    await load()
  }

  const addTemplate = async () => {
    const { data } = await supabase.from('task_template_items').select('title, assignee, sort_order').order('sort_order')
    const start = nextOrder()
    const rows = (data || []).map((item, i) => ({ project_id: projectId, title: item.title, assignee: item.assignee, status: 'todo', sort_order: start + i }))
    if (rows.length > 0) await supabase.from('project_tasks').insert(rows)
    await load()
  }

  const openTask = async (task: ProjectTask) => {
    setEditing(task)
    setDraft(draftOf(task))
    setScreenshotUrl(null)
    if (task.screenshot_path) {
      const { data } = await supabase.storage.from('task-feedback').createSignedUrl(task.screenshot_path, 60 * 60)
      setScreenshotUrl(data?.signedUrl || null)
    }
  }

  const closeTask = () => {
    setEditing(null)
    setDraft(null)
  }

  const saveTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing || !draft || !draft.title.trim()) return
    setSaving(true)
    const becameDone = draft.status === 'done' && editing.status !== 'done'
    await update(editing, {
      title: draft.title.trim(),
      description: draft.description,
      assignee: draft.assignee,
      status: draft.status,
      due_date: draft.due_date || null,
      private: draft.private,
      done_note: draft.done_note.trim(),
      completed_at: draft.status === 'done' ? (becameDone ? new Date().toISOString() : editing.completed_at) : null,
    })
    setSaving(false)
    closeTask()
  }

  const deleteTask = async () => {
    if (!editing || !confirm(`Taak "${editing.title}" verwijderen?`)) return
    if (editing.screenshot_path) await supabase.storage.from('task-feedback').remove([editing.screenshot_path])
    await supabase.from('project_tasks').delete().eq('id', editing.id)
    closeTask()
    await load()
  }

  // De link bestaat pas als hij nodig is (kopiëren of mailen)
  const ensureToken = async () => {
    if (boardToken) return boardToken
    const token = newBoardToken()
    await supabase.from('projects').update({ board_token: token }).eq('id', projectId)
    await onProjectChanged()
    return token
  }

  const copyLink = async () => {
    const token = await ensureToken()
    await navigator.clipboard.writeText(`${BOARD_URL}/${token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openLink = async () => {
    const token = await ensureToken()
    window.open(`${BOARD_URL}/${token}`, '_blank', 'noopener')
  }

  const sendMail = async () => {
    const again = boardSentAt ? `\n\nLet op: de link is al eerder gemaild op ${formatDateTime(boardSentAt)}.` : ''
    if (!confirm(`De link naar de planning naar de klant mailen? Openstaande klanttaken staan in de mail.${again}`)) return
    setSending(true)
    setSendResult('')
    const { data, error } = await supabase.functions.invoke('send-board-email', { body: { project_id: projectId } })
    setSending(false)
    if (error || !data?.success) {
      setSendResult(`Niet verstuurd: ${data?.error || error?.message || 'onbekende fout'}`)
      return
    }
    setSendResult(data.sent_to?.length ? `Gemaild naar ${data.sent_to.join(', ')}` : 'Geen klanten met portaalmails aan, er is niets verstuurd.')
    await onProjectChanged()
  }

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
  }

  const visibleTasks = tasks
  const inputClass = 'w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all'

  return (
    <div className="space-y-4">
      {/* Link voor de klant */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-600">Planning voor de klant</p>
          <p className="text-[11px] text-gray-400">
            Link zonder inloggen. De klant ziet alle taken behalve die "Alleen voor mij" en kan er feedback geven.
            {boardSentAt && <> Gemaild op {formatDateTime(boardSentAt)}.</>}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={copyLink}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-primary rounded-lg hover:bg-white transition-colors">
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Gekopieerd' : 'Link kopiëren'}
          </button>
          <button type="button" onClick={openLink} title="Bekijken zoals de klant"
            className="p-1.5 text-gray-400 hover:text-primary rounded-lg hover:bg-white transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={sendMail} disabled={sending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary-600 rounded-lg disabled:opacity-50 transition-colors">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Mail sturen
          </button>
        </div>
        {sendResult && <p className="w-full text-xs text-gray-500">{sendResult}</p>}
      </div>

      {visibleTasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center">
          <p className="text-sm text-gray-500">Nog geen taken voor dit domein.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={addTemplate}
              className="px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary-600 rounded-lg">
              Standaardtaken toevoegen
            </button>
            <button type="button" onClick={() => setAdding('todo')}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg">
              Zelf beginnen
            </button>
            <button type="button" onClick={() => setShowTemplate(true)}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700">
              Standaardlijst bewerken
            </button>
          </div>
        </div>
      ) : null}

      {(visibleTasks.length > 0 || adding) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {COLUMNS.map((column) => {
            const columnTasks = visibleTasks.filter(t => columnOf(t) === column.key)
            const sorted = column.key === 'done'
              ? [...columnTasks].sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))
              : column.key === 'client'
                ? [...columnTasks].sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
                : columnTasks
            const shown = column.key === 'done' && !showAllDone ? sorted.slice(0, DONE_VISIBLE) : sorted
            return (
              <div key={column.key}
                onDragOver={(e) => { e.preventDefault(); setDropColumn(column.key) }}
                onDragLeave={() => setDropColumn(c => (c === column.key ? null : c))}
                onDrop={(e) => {
                  e.preventDefault()
                  setDropColumn(null)
                  if (dragId) moveTo(dragId, column.key)
                  setDragId(null)
                }}
                className={`rounded-xl border p-2.5 min-w-0 transition-colors ${
                  dropColumn === column.key ? 'border-primary/40 bg-primary/5' : column.key === 'client' ? 'border-amber-100 bg-amber-50/40' : 'border-gray-100 bg-gray-50'
                }`}>
                <div className="flex items-center justify-between px-1 pb-2" title={column.hint || undefined}>
                  <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{column.label}</h4>
                  <span className="text-[11px] text-gray-400">{columnTasks.length}</span>
                </div>
                <div className="space-y-1.5">
                  {shown.map((task) => {
                    const state = dueState(task.due_date, task.status === 'done')
                    return (
                      <button key={task.id} type="button" draggable
                        onDragStart={(e) => { setDragId(task.id); e.dataTransfer.effectAllowed = 'move' }}
                        onDragEnd={() => { setDragId(null); setDropColumn(null) }}
                        onClick={() => openTask(task)}
                        className={`w-full text-left bg-white rounded-lg border px-2.5 py-2 hover:border-primary/30 transition-colors cursor-grab active:cursor-grabbing ${
                          dragId === task.id ? 'opacity-50' : ''
                        } ${task.client_done_at && task.status !== 'done' ? 'border-emerald-200' : 'border-gray-100'}`}>
                        <p className={`text-sm break-words ${task.status === 'done' ? 'text-gray-500' : 'text-gray-800'}`}>{task.title}</p>
                        <div className="flex flex-wrap items-center gap-1 mt-1 empty:hidden">
                          {task.is_feedback && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 text-[10px] font-medium">
                              <MessageSquareText className="w-2.5 h-2.5" />
                              Feedback{task.feedback_author ? ` · ${task.feedback_author}` : ''}
                            </span>
                          )}
                          {task.screenshot_path && <ImageIcon className="w-3 h-3 text-gray-400" />}
                          {task.private && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[10px] font-medium">
                              <Lock className="w-2.5 h-2.5" /> Alleen voor mij
                            </span>
                          )}
                          {task.client_done_at && task.status !== 'done' && (
                            <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-medium">Aangeleverd, nakijken</span>
                          )}
                          {state && task.due_date && (
                            <span className={`px-1.5 py-0.5 rounded-md border text-[10px] font-medium ${dueClass[state]}`}>{dueLabel(task.due_date)}</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                  {column.key === 'done' && sorted.length > DONE_VISIBLE && (
                    <button type="button" onClick={() => setShowAllDone(v => !v)}
                      className="w-full text-[11px] font-medium text-gray-500 hover:text-gray-700 py-1">
                      {showAllDone ? 'Toon minder' : `Toon alle ${sorted.length}`}
                    </button>
                  )}
                  {column.key !== 'done' && (adding === column.key ? (
                    <form onSubmit={(e) => { e.preventDefault(); addTask(column.key) }}>
                      <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                        onBlur={() => addTask(column.key)}
                        onKeyDown={(e) => { if (e.key === 'Escape') { setNewTitle(''); setAdding(null) } }}
                        placeholder={column.key === 'client' ? 'Wat moet de klant doen?' : 'Nieuwe taak'}
                        className="w-full px-2.5 py-2 text-sm bg-white border border-primary/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </form>
                  ) : (
                    <button type="button" onClick={() => { setAdding(column.key); setNewTitle('') }}
                      className="w-full flex items-center gap-1 px-1.5 py-1.5 text-xs text-gray-400 hover:text-primary rounded-lg transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Taak toevoegen
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {visibleTasks.length > 0 && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setShowTemplate(true)} className="text-[11px] text-gray-400 hover:text-gray-600">
            Standaardlijst bewerken
          </button>
        </div>
      )}

      {/* Taak bewerken */}
      {editing && draft && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 pt-[6vh] overflow-y-auto" onClick={closeTask}>
          <form onSubmit={saveTask} className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Taak</h3>
              <button type="button" onClick={closeTask} aria-label="Sluiten" className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {editing.is_feedback && (
                <div className="rounded-lg bg-sky-50 border border-sky-100 px-3 py-2 text-xs text-sky-800 space-y-0.5">
                  <p>Feedback van <strong>{editing.feedback_author || 'de klant'}</strong> op {formatDateTime(editing.created_at)}</p>
                  {editing.feedback_page && <p>Pagina: {editing.feedback_page}</p>}
                </div>
              )}
              {editing.client_done_at && editing.status !== 'done' && (
                <p className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-800">
                  De klant meldde op {formatDateTime(editing.client_done_at)} dat dit is aangeleverd. Klopt het? Zet de taak dan op Klaar.
                </p>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Taak *</label>
                <input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Toelichting</label>
                <textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={inputClass} />
              </div>
              {screenshotUrl && (
                <a href={screenshotUrl} target="_blank" rel="noopener noreferrer" className="block">
                  <img src={screenshotUrl} alt="Screenshot bij de feedback" className="max-h-56 rounded-lg border border-gray-100" />
                </a>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Wie</label>
                  <select value={draft.assignee} onChange={(e) => setDraft({ ...draft, assignee: e.target.value as TaskAssignee })} className={inputClass}>
                    <option value="me">Ik</option>
                    <option value="client">De klant</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as TaskStatus })} className={inputClass}>
                    <option value="todo">Te doen</option>
                    <option value="doing">Mee bezig</option>
                    <option value="done">Klaar</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{draft.assignee === 'client' ? 'Uiterlijk aanleveren' : 'Gepland op'}</label>
                  <input type="date" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} className={inputClass} />
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={draft.private} onChange={(e) => setDraft({ ...draft, private: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30" />
                  Alleen voor mij
                </label>
              </div>
              {draft.status === 'done' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Toelichting voor de klant (optioneel)</label>
                  <input value={draft.done_note} onChange={(e) => setDraft({ ...draft, done_note: e.target.value })} className={inputClass}
                    placeholder="Bijv. Besproken: we laten dit zo" />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 px-5 pb-5">
              <button type="button" onClick={deleteTask} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50">
                <Trash2 className="w-4 h-4" /> Verwijderen
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={closeTask} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Annuleren</button>
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary-600 disabled:opacity-50">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Opslaan
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {showTemplate && <TemplateEditor onClose={() => setShowTemplate(false)} />}
    </div>
  )
}

interface TemplateItem {
  id?: string
  title: string
  assignee: TaskAssignee
}

// De standaardlijst waarmee een leeg bord gevuld wordt
function TemplateEditor({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<TemplateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('task_template_items').select('id, title, assignee').order('sort_order')
      setItems((data || []) as TemplateItem[])
      setLoading(false)
    }
    load()
  }, [])

  const save = async () => {
    setSaving(true)
    const keep = items.filter(i => i.title.trim())
    const keepIds = keep.map(i => i.id).filter(Boolean) as string[]
    const { data: existing } = await supabase.from('task_template_items').select('id')
    const removed = (existing || []).map(r => r.id as string).filter(id => !keepIds.includes(id))
    if (removed.length > 0) await supabase.from('task_template_items').delete().in('id', removed)
    for (const [i, item] of keep.entries()) {
      const row = { title: item.title.trim(), assignee: item.assignee, sort_order: i }
      if (item.id) await supabase.from('task_template_items').update(row).eq('id', item.id)
      else await supabase.from('task_template_items').insert(row)
    }
    setSaving(false)
    onClose()
  }

  const inputClass = 'w-full px-2.5 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 pt-[6vh] overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Standaardlijst</h3>
            <p className="text-xs text-gray-500 mt-0.5">Hiermee vul je een leeg bord met één klik. Bestaande borden veranderen niet.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Sluiten" className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-2">
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
          ) : items.map((item, index) => (
            <div key={item.id || `new-${index}`} className="flex items-center gap-2">
              <input value={item.title} className={inputClass}
                onChange={(e) => setItems(prev => prev.map((it, i) => (i === index ? { ...it, title: e.target.value } : it)))} />
              <select value={item.assignee} className={`${inputClass} w-28 flex-shrink-0`}
                onChange={(e) => setItems(prev => prev.map((it, i) => (i === index ? { ...it, assignee: e.target.value as TaskAssignee } : it)))}>
                <option value="me">Ik</option>
                <option value="client">Klant</option>
              </select>
              <button type="button" onClick={() => setItems(prev => prev.filter((_, i) => i !== index))} title="Verwijderen"
                className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {!loading && (
            <button type="button" onClick={() => setItems(prev => [...prev, { title: '', assignee: 'me' }])}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-600 pt-1">
              <Plus className="w-3.5 h-3.5" /> Taak toevoegen
            </button>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Annuleren</button>
          <button type="button" onClick={save} disabled={saving || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary-600 disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Opslaan
          </button>
        </div>
      </div>
    </div>
  )
}
