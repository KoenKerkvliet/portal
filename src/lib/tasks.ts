// Takenbord per domein (zie supabase/add-project-tasks.sql). De kolom volgt uit de taak:
// afgerond -> Klaar, anders klanttaak -> "Van jou nodig", anders Te doen / Mee bezig.

export type TaskStatus = 'todo' | 'doing' | 'done'
export type TaskAssignee = 'me' | 'client'
export type BoardColumn = 'client' | 'todo' | 'doing' | 'done'

export interface ProjectTask {
  id: string
  project_id?: string
  title: string
  description: string
  status: TaskStatus
  assignee: TaskAssignee
  due_date: string | null
  private?: boolean
  is_feedback: boolean
  feedback_page: string
  feedback_author: string
  screenshot_path?: string | null
  screenshot_url?: string | null
  client_done_at: string | null
  done_note: string
  sort_order?: number
  completed_at: string | null
  created_at: string
}

export const BOARD_URL = 'https://portal.designpixels.nl/d/planning'

export const columnOf = (task: Pick<ProjectTask, 'status' | 'assignee'>): BoardColumn =>
  task.status === 'done' ? 'done' : task.assignee === 'client' ? 'client' : task.status

// Wat er verandert als een taak naar een kolom wordt gesleept
export function patchForColumn(column: BoardColumn): Partial<ProjectTask> {
  const now = new Date().toISOString()
  if (column === 'client') return { assignee: 'client', status: 'todo', completed_at: null }
  if (column === 'todo') return { assignee: 'me', status: 'todo', completed_at: null }
  if (column === 'doing') return { assignee: 'me', status: 'doing', completed_at: null }
  return { status: 'done', completed_at: now }
}

const todayISO = () => new Date().toLocaleDateString('en-CA')

// Datum t.o.v. vandaag: te laat, binnenkort (binnen 3 dagen) of gewoon gepland
export function dueState(due: string | null, done = false): 'overdue' | 'soon' | 'planned' | null {
  if (!due || done) return null
  const today = todayISO()
  if (due < today) return 'overdue'
  const soon = new Date()
  soon.setDate(soon.getDate() + 3)
  return due <= soon.toLocaleDateString('en-CA') ? 'soon' : 'planned'
}

export const formatDue = (due: string) =>
  new Date(`${due}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })

// "2 dagen over de datum" / "vandaag" / "morgen"
export function dueLabel(due: string): string {
  const days = Math.round((Date.parse(`${due}T12:00:00`) - Date.parse(`${todayISO()}T12:00:00`)) / 86_400_000)
  if (days < -1) return `${-days} dagen over de datum`
  if (days === -1) return '1 dag over de datum'
  if (days === 0) return 'vandaag'
  if (days === 1) return 'morgen'
  return formatDue(due)
}

export const dueClass: Record<'overdue' | 'soon' | 'planned', string> = {
  overdue: 'bg-orange-50 text-orange-700 border-orange-200',
  soon: 'bg-amber-50 text-amber-700 border-amber-200',
  planned: 'bg-gray-50 text-gray-600 border-gray-200',
}

export function newBoardToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}
