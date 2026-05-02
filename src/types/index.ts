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

export type ClientStatus = 'active' | 'archived'

export interface Client {
  id: string
  name: string
  email: string
  email_extra: string[]
  phone: string | null
  company: string | null
  profile_id: string | null
  status: ClientStatus
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
  file_sharing_url: string | null
  feedback_title: string | null
  feedback_url: string | null
  staging_url: string | null
  api_key: string | null
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

export type CardElementType = 'text' | 'icon' | 'dynamic' | 'link' | 'button'

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
  faded?: boolean
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

export interface ProjectClient {
  id: string
  project_id: string
  client_id: string
  notify_invoices: boolean
  notify_quotes: boolean
  notify_portal: boolean
  notify_tickets: boolean
  notify_punch_cards: boolean
  created_at: string
  client?: Client
}

export interface Invoice {
  id: string
  project_id: string
  client_id: string
  number: string
  amount: number
  status: InvoiceStatus
  due_date: string
  is_test: boolean
  invoice_date: string | null
  client_name: string | null
  client_email: string | null
  client_address: string | null
  items: QuoteItem[]
  discount_percent: number
  btw_percent: number
  notes: string
  subtotal: number
  is_deposit_invoice: boolean
  is_remainder_invoice: boolean
  has_temp_number: boolean
  deposit_percentage: number | null
  parent_invoice_id: string | null
  created_at: string
  project?: Project
  client?: Client
}

// Form builder types
export type FormFieldType = 'heading' | 'text' | 'textarea' | 'email' | 'phone' | 'select' | 'checkbox' | 'radio' | 'date' | 'number'

export interface FormFieldOption {
  id: string
  label: string
}

export interface FormField {
  id: string
  type: FormFieldType
  label: string
  placeholder?: string
  required?: boolean
  options?: FormFieldOption[]  // for select, radio, checkbox
}

export interface FormStep {
  id: string
  title: string
  fields: FormField[]
}

export interface Form {
  id: string
  title: string
  description: string
  steps: FormStep[]
  created_at: string
}

export interface FormSubmission {
  id: string
  form_id: string
  project_id: string
  data: Record<string, string | string[] | boolean>
  submitted_at: string | null
  created_at: string
}

export type YearFormat = 'YY' | 'YYYY'

export interface InvoiceSettings {
  id: string
  company_name: string
  address_line1: string
  address_line2: string
  postal_code: string
  city: string
  country: string
  iban: string
  btw_number: string
  kvk_number: string
  kor_enabled: boolean
  invoice_prefix: string
  year_format: YearFormat
  start_number: number
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  code: string
  name: string
  description: string
  quantity_value: number
  quantity_unit: string
  price: number
  is_recurring: boolean
  created_at: string
}

export interface QuoteSettings {
  id: string
  quote_prefix: string
  year_format: YearFormat
  start_number: number
  created_at: string
  updated_at: string
}

export type QuoteItemType = 'product' | 'title' | 'divider'

export interface QuoteItem {
  id: string
  type: QuoteItemType
  product_id?: string
  name?: string
  description?: string
  quantity?: number
  unit?: string
  price?: number
  is_recurring?: boolean
  title?: string
}

export interface Quote {
  id: string
  project_id: string
  client_id: string
  number: string
  amount: number
  status: QuoteStatus
  valid_until: string
  is_test: boolean
  items: QuoteItem[]
  discount_percent: number
  btw_percent: number
  notes: string
  accepted_at: string | null
  accepted_name: string | null
  accepted_signature: string | null
  accepted_remarks: string | null
  declined_at: string | null
  declined_reason: string | null
  created_at: string
  project?: Project
  client?: Client
}

export interface Expense {
  id: string
  expense_date: string
  vendor: string | null
  description: string
  category: string | null
  amount_excl_btw: number
  btw_percent: number
  btw_amount: number
  amount_incl_btw: number
  invoice_number: string | null
  notes: string
  currency: string
  created_at: string
}

export type TransactionCategory = 'private_deposit' | 'private_withdrawal' | 'private_purchase'

export interface BankTransaction {
  id: string
  bunq_payment_id: number
  bunq_account_id: number
  booked_at: string
  amount: number
  currency: string
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  payment_type: string | null
  invoice_id: string | null
  expense_id: string | null
  category: TransactionCategory | null
  created_at: string
}

export type NotificationType = 'quote' | 'invoice' | 'assignment' | 'card_update' | 'general'

export interface ClientNotification {
  id: string
  project_id: string
  client_id: string
  type: NotificationType
  title: string
  message: string
  link_url: string | null
  read: boolean
  created_at: string
}

export type AssignmentStatus = 'draft' | 'sent' | 'accepted' | 'declined'

export interface Assignment {
  id: string
  project_id: string
  client_id: string
  title: string
  content: string
  status: AssignmentStatus
  accepted_at: string | null
  accepted_name: string | null
  accepted_signature: string | null
  accepted_remarks: string | null
  declined_at: string | null
  declined_reason: string | null
  created_at: string
  project?: Project
  client?: Client
}

export interface PunchCard {
  id: string
  project_id: string
  number: number
  total_punches: number
  used_punches: number
  is_gift: boolean
  price: number
  status: 'active' | 'used_up'
  purchased_at: string
  expires_at: string | null
  created_at: string
}

export interface PunchCardUse {
  id: string
  punch_card_id: string
  punch_index: number
  description: string
  duration_minutes: number
  used_at: string
  created_at: string
}

export type TicketStatus = 'open' | 'in_progress' | 'resolved'

export interface Ticket {
  id: string
  number: number
  project_id: string
  created_by: string
  created_by_name: string
  title: string
  description: string
  status: TicketStatus
  attachment_url: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  project?: Project
  reply_count?: number
}

export interface TicketReply {
  id: string
  ticket_id: string
  author_id: string
  author_name: string
  author_role: 'admin' | 'client'
  content: string
  attachment_url: string | null
  created_at: string
}
