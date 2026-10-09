import type { ProjectPhase, PhaseStep } from '../../types'

export const phases: ProjectPhase[] = ['intake', 'design', 'development', 'oplevering', 'onderhoud']

export const phaseLabels: Record<ProjectPhase, string> = {
  intake: 'Intake',
  design: 'Design',
  development: 'Development',
  oplevering: 'Oplevering',
  onderhoud: 'Onderhoud',
}

export const phaseColors: Record<ProjectPhase, string> = {
  intake: 'bg-blue-100 text-blue-700',
  design: 'bg-purple-100 text-purple-700',
  development: 'bg-yellow-100 text-yellow-700',
  oplevering: 'bg-green-100 text-green-700',
  onderhoud: 'bg-emerald-100 text-emerald-700',
}

export const phaseDots: Record<ProjectPhase, string> = {
  intake: 'bg-blue-500',
  design: 'bg-purple-500',
  development: 'bg-yellow-500',
  oplevering: 'bg-green-500',
  onderhoud: 'bg-emerald-500',
}

export type DesignApproval = {
  status?: string
  declined_reason?: string
  declined_name?: string
  declined_at?: string
  accepted_at?: string
  accepted_name?: string
}

export interface PhaseCustomData {
  content?: string
  steps?: PhaseStep[]
  linked_quote_id?: string
  linked_invoice_id?: string
  linked_assignment_id?: string
  design_html?: string
  design_html_styleguide?: string
  design_html_homepage?: string
  design_html_tweede?: string
  design_image_styleguide?: string
  design_image_homepage?: string
  design_image_tweede?: string
  design_approvals?: Record<string, DesignApproval>
  design_sent_at?: Record<string, string>
  design_deadlines?: Record<string, string> // uiterlijke reactiedatum per design (YYYY-MM-DD)
  design_sent_image?: Record<string, string> // welk bestand (URL) per design als laatste is gemaild
  show_file_footer?: boolean
  show_feedback_footer?: boolean
}

export interface ProjectPhaseInstance {
  id: string
  project_id: string
  phase: string
  template_id: string | null
  custom_data: PhaseCustomData | null
  status: string
  public_token?: string | null
}

export interface IntakeLinks {
  quote_id: string
  invoice_id: string
  assignment_id: string
}

export const emptyIntakeLinks: IntakeLinks = { quote_id: '', invoice_id: '', assignment_id: '' }

export type DesignImageKey = 'styleguide' | 'homepage' | 'tweede'

export type DesignImages = Record<DesignImageKey, string>

export const emptyDesignImages: DesignImages = { styleguide: '', homepage: '', tweede: '' }

// De derde afbeelding heet in de data 'tweede', maar is de contactpagina
export const designFields: { key: DesignImageKey; label: string; approvalType: string }[] = [
  { key: 'styleguide', label: 'Styleguide', approvalType: 'styleguide' },
  { key: 'homepage', label: 'Homepage', approvalType: 'homepage' },
  { key: 'tweede', label: 'Contactpagina', approvalType: 'contactpage' },
]

export const withHttps = (url: string | null | undefined) => {
  const trimmed = url?.trim() || null
  if (trimmed && !trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return `https://${trimmed}`
  return trimmed
}

const toDateInput = (d: Date) => {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Vandaag als YYYY-MM-DD (lokale tijd)
export const todayDate = () => toDateInput(new Date())

// Datum (YYYY-MM-DD) een aantal werkdagen na vandaag; zaterdag en zondag tellen niet mee
export const workdaysFromToday = (workdays: number) => {
  const d = new Date()
  let added = 0
  while (added < workdays) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) added++
  }
  return toDateInput(d)
}

export const DESIGN_FEEDBACK_WORKDAYS = 5

// Is de versie die er nu staat al gemaild? send-design-ready-email legt vast welk
// bestand gemaild is. Bij mails van vóór die registratie vergelijken we de tijd: de
// bestandsnaam bevat het uploadmoment (…/homepage_1791546503961.jpg).
export const designVersionMailed = (data: PhaseCustomData | null | undefined, approvalType: string, imageUrl: string) => {
  const sentAt = data?.design_sent_at?.[approvalType]
  if (!sentAt || !imageUrl) return false
  const sentImage = data?.design_sent_image?.[approvalType]
  if (sentImage) return sentImage === imageUrl
  const uploadedMs = imageUrl.match(/_(\d{13})\.\w+$/)?.[1]
  return !uploadedMs || new Date(sentAt).getTime() >= Number(uploadedMs)
}

export const toDatetimeLocal =(isoString: string | null) => {
  if (!isoString) return ''
  const d = new Date(isoString)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
