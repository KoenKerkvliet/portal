export type UserRole = 'admin' | 'client'

export type ProjectPhase = 'intake' | 'design' | 'development' | 'oplevering' | 'onderhoud'

export type ProjectStatus = 'active' | 'archived'

export type InvoiceStatus = 'draft' | 'sent' | 'paid'

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined'

export type PhaseStatus = 'pending' | 'active' | 'completed'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  avatar_url: string | null
  created_at: string
}

export interface Client {
  id: string
  name: string
  email: string
  phone: string | null
  company: string | null
  profile_id: string | null
  created_at: string
}

export interface Project {
  id: string
  name: string
  url: string | null
  client_id: string | null
  current_phase: ProjectPhase
  status: ProjectStatus
  due_date: string | null
  start_meeting_at: string | null
  created_at: string
  client?: Client
}

export interface PhaseTemplate {
  id: string
  phase: ProjectPhase
  title: string
  description: string
  content: string
  steps: PhaseStep[]
  created_at: string
}

export type CardElementType = 'text' | 'icon' | 'dynamic' | 'link' | 'button' | 'form'

export interface CardElement {
  id: string
  type: CardElementType
  data: Record<string, string>
}

export interface PhaseStep {
  id: string
  title: string
  description: string
  completed: boolean
  elements?: CardElement[]
}

export interface ProjectPhaseRecord {
  id: string
  project_id: string
  phase: ProjectPhase
  status: PhaseStatus
  template_id: string | null
  custom_data: Record<string, unknown> | null
  started_at: string | null
  completed_at: string | null
  template?: PhaseTemplate
}

export interface Invoice {
  id: string
  project_id: string
  client_id: string
  number: string
  amount: number
  status: InvoiceStatus
  due_date: string
  created_at: string
  project?: Project
  client?: Client
}

export interface Quote {
  id: string
  project_id: string
  client_id: string
  number: string
  amount: number
  status: QuoteStatus
  valid_until: string
  created_at: string
  project?: Project
  client?: Client
}
