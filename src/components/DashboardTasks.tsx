import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ListChecks, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { dueClass, dueLabel, dueState } from '../lib/tasks'

interface TaskRow {
  id: string
  project_id: string
  title: string
  status: string
  assignee: 'me' | 'client'
  due_date: string | null
  is_feedback: boolean
  feedback_author: string
  client_done_at: string | null
  created_at: string
  project: { name: string } | null
}

const LIMIT = 6
const SOON_DAYS = 7

// Dashboard: openstaande taken over alle domeinen. Wat bij klanten ligt (te laat eerst),
// nieuwe feedback en mijn eigen taken met een datum die eraan komt.
export default function DashboardTasks() {
  const [rows, setRows] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('project_tasks')
        .select('id, project_id, title, status, assignee, due_date, is_feedback, feedback_author, client_done_at, created_at, project:projects(name)')
        .neq('status', 'done')
        .order('created_at', { ascending: false })
      setRows((data || []) as unknown as TaskRow[])
      setLoading(false)
    }
    load()
  }, [])

  const soon = new Date()
  soon.setDate(soon.getDate() + SOON_DAYS)
  const soonISO = soon.toLocaleDateString('en-CA')

  const atClient = rows
    .filter(t => t.assignee === 'client')
    .sort((a, b) => Number(!!b.client_done_at) - Number(!!a.client_done_at) || (a.due_date || '9999').localeCompare(b.due_date || '9999'))
  const feedback = rows.filter(t => t.is_feedback && t.status === 'todo' && t.assignee === 'me')
  const mine = rows
    .filter(t => t.assignee === 'me' && !t.is_feedback && t.due_date && t.due_date <= soonISO)
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))

  const groups = [
    { key: 'client', title: 'Bij klanten', empty: 'Er ligt niets bij klanten.', items: atClient },
    { key: 'feedback', title: 'Nieuwe feedback', empty: 'Geen nieuwe feedback.', items: feedback },
    { key: 'mine', title: `Mijn taken (komende ${SOON_DAYS} dagen)`, empty: 'Geen taken met een datum die eraan komt.', items: mine },
  ]

  return (
    <div className="mt-8 bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 mb-4">
        <ListChecks className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-gray-900">Taken</h2>
      </div>
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {groups.map((group) => (
            <div key={group.key} className="min-w-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{group.title}</h3>
                {group.items.length > 0 && <span className="text-xs text-gray-400">{group.items.length}</span>}
              </div>
              {group.items.length === 0 ? (
                <p className="text-xs text-gray-400">{group.empty}</p>
              ) : (
                <ul className="space-y-1.5">
                  {group.items.slice(0, LIMIT).map((task) => {
                    const state = dueState(task.due_date)
                    return (
                      <li key={task.id}>
                        <Link to={`/admin/projecten/${task.project_id}`}
                          className="block rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 hover:border-primary/30 hover:bg-primary/5 transition-colors">
                          <p className="text-sm text-gray-800 truncate">{task.title}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] text-gray-400 truncate">
                              {task.project?.name || 'Onbekend domein'}
                              {task.is_feedback && task.feedback_author ? ` · ${task.feedback_author}` : ''}
                            </span>
                            {task.client_done_at ? (
                              <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-medium">Aangeleverd, nakijken</span>
                            ) : state && task.due_date ? (
                              <span className={`px-1.5 py-0.5 rounded-md border text-[10px] font-medium ${dueClass[state]}`}>{dueLabel(task.due_date)}</span>
                            ) : null}
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                  {group.items.length > LIMIT && (
                    <li className="text-[11px] text-gray-400 px-1">en nog {group.items.length - LIMIT}</li>
                  )}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
