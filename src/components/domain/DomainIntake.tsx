import type { Project, Quote, Invoice, Assignment } from '../../types'
import { Calendar, Clock, ClipboardCheck, FileCheck, FileText, AlertTriangle } from 'lucide-react'
import { toDatetimeLocal, type IntakeLinks, type ProjectPhaseInstance } from './domainShared'

export default function DomainIntake({
  project,
  instance,
  links,
  quotes,
  invoices,
  assignments,
  saving,
  onChangeLinks,
  updateProject,
}: {
  project: Project
  instance: ProjectPhaseInstance | null
  links: IntakeLinks
  quotes: Quote[]
  invoices: Invoice[]
  assignments: Assignment[]
  saving: boolean
  onChangeLinks: (links: IntakeLinks) => void
  updateProject: (updates: Partial<Project>) => void
}) {
  const fadedWarnings: string[] = []
  for (const step of instance?.custom_data?.steps || []) {
    if (!step.faded || !step.elements) continue
    for (const el of step.elements) {
      if (el.type !== 'button') continue
      if (el.data.action === 'quote' && links.quote_id) fadedWarnings.push(`"${step.title || 'Naamloos'}" bevat een offerte-knop`)
      if (el.data.action === 'assignment' && links.assignment_id) fadedWarnings.push(`"${step.title || 'Naamloos'}" bevat een opdracht-knop`)
    }
  }

  const selectClass = 'flex-1 min-w-0 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex items-center gap-3 bg-gray-50 rounded-lg border border-gray-100 px-3 py-2">
          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Opleverdatum</p>
            <input type="date" value={project.due_date || ''}
              onChange={(e) => updateProject({ due_date: e.target.value || null })}
              className="text-sm text-gray-700 bg-transparent border-none p-0 focus:outline-none focus:ring-0 cursor-pointer hover:text-primary transition-colors w-full" />
          </div>
        </div>
        <div className="flex items-center gap-3 bg-gray-50 rounded-lg border border-gray-100 px-3 py-2">
          <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Startgesprek</p>
            <input type="datetime-local" value={toDatetimeLocal(project.start_meeting_at)}
              onChange={(e) => updateProject({ start_meeting_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
              className="text-sm text-gray-700 bg-transparent border-none p-0 focus:outline-none focus:ring-0 cursor-pointer hover:text-primary transition-colors w-full" />
          </div>
        </div>
      </div>

      {/* Koppelingen worden in de intake-fase opgeslagen, dus pas mogelijk als die is ingericht */}
      {!instance ? (
        <p className="text-xs text-gray-400">Richt de intake-fase hieronder in om een opdracht, offerte of factuur te koppelen.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Let op: een offerte of factuur koppelen stuurt de klant direct een mail en zet de offerte of factuur op &lsquo;verzonden&rsquo;.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Opdracht</label>
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <select value={links.assignment_id}
                  onChange={(e) => onChangeLinks({ ...links, assignment_id: e.target.value })}
                  className={selectClass}>
                  <option value="">Geen opdracht</option>
                  {assignments.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Offerte</label>
              <div className="flex items-center gap-2">
                <FileCheck className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <select value={links.quote_id}
                  onChange={(e) => onChangeLinks({ ...links, quote_id: e.target.value })}
                  className={selectClass}>
                  <option value="">Geen offerte</option>
                  {quotes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.number} — €{((q.items || []).reduce((sum, it) => sum + (it.quantity || 0) * (it.price || 0), 0)).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Factuur</label>
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <select value={links.invoice_id}
                  onChange={(e) => onChangeLinks({ ...links, invoice_id: e.target.value })}
                  className={selectClass}>
                  <option value="">Geen factuur</option>
                  {invoices.filter((inv) => !inv.is_remainder_invoice).map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.number} — €{inv.amount.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          {fadedWarnings.length > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700">
                <p className="font-medium mb-0.5">Stappen niet zichtbaar voor klant:</p>
                {fadedWarnings.map((w, i) => (
                  <p key={i}>• {w}</p>
                ))}
                <p className="mt-1 text-amber-600">Maak deze stappen zichtbaar zodat de klant ze kan zien.</p>
              </div>
            </div>
          )}
          {saving && <p className="text-xs text-primary">Opslaan...</p>}
        </div>
      )}
    </div>
  )
}
