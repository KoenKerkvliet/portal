import type { Project, Quote, Invoice, Assignment } from '../../types'
import { Calendar, Clock, ClipboardCheck, FileCheck, FileText, Send, Loader2, ExternalLink } from 'lucide-react'
import HelpTip from '../HelpTip'
import { toDatetimeLocal, type IntakeLinks } from './domainShared'

export type IntakeDocKind = 'assignment' | 'quote' | 'invoice'

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })

const quoteTotal = (q: Quote) =>
  (q.items || []).reduce((sum, it) => sum + (it.quantity || 0) * (it.price || 0), 0)

type DocStatus = { label: string; className: string; detail?: string }

const statusBadge: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-50 text-blue-700',
  accepted: 'bg-green-50 text-green-700',
  declined: 'bg-red-50 text-red-600',
  paid: 'bg-green-50 text-green-700',
}

function docStatus(doc: Quote | Invoice | Assignment): DocStatus {
  const status = doc.status as string
  const className = statusBadge[status] || 'bg-gray-100 text-gray-600'
  if (status === 'accepted' && 'accepted_at' in doc && doc.accepted_at) {
    return { label: 'Geaccepteerd', className, detail: `door ${doc.accepted_name || 'de klant'} op ${formatDate(doc.accepted_at)}` }
  }
  if (status === 'declined' && 'declined_reason' in doc) {
    return { label: 'Afgewezen', className, detail: doc.declined_reason ? `"${doc.declined_reason}"` : undefined }
  }
  if (status === 'paid') return { label: 'Betaald', className }
  if (status === 'sent') return { label: 'Verzonden', className }
  return { label: 'Concept', className }
}

const publicPath: Record<IntakeDocKind, string> = { assignment: 'opdracht', quote: 'offerte', invoice: 'factuur' }

function DocRow({
  kind,
  label,
  help,
  icon: Icon,
  value,
  options,
  doc,
  sending,
  sendResult,
  onSelect,
  onSend,
}: {
  kind: IntakeDocKind
  label: string
  help: string
  icon: React.ComponentType<{ className?: string }>
  value: string
  options: { id: string; label: string }[]
  doc: Quote | Invoice | Assignment | undefined
  sending: boolean
  sendResult?: string
  onSelect: (id: string) => void
  onSend: () => void
}) {
  const status = doc ? docStatus(doc) : null
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{label}</span>
        <HelpTip text={help} />
      </div>
      <div className="flex items-center gap-2">
        <select value={value} onChange={(e) => onSelect(e.target.value)}
          className="flex-1 min-w-0 h-8 px-2 text-sm text-gray-800 bg-white border border-gray-200 rounded-md hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors">
          <option value="">Niet gekoppeld</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <button type="button" onClick={onSend} disabled={!doc || sending}
          className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-white bg-primary hover:bg-primary-600 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {doc?.last_sent_at ? 'Opnieuw mailen' : 'Mail sturen'}
        </button>
      </div>
      {doc && status && (
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1.5 text-[11px] text-gray-500">
          <span className={`px-1.5 py-0.5 rounded font-medium ${status.className}`}>{status.label}</span>
          {status.detail && <span className="truncate max-w-full">{status.detail}</span>}
          <span>{doc.last_sent_at ? `Gemaild op ${formatDateTime(doc.last_sent_at)}` : 'Nog niet gemaild'}</span>
          {doc.public_token && (
            <a href={`/d/${publicPath[kind]}/${doc.public_token}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:text-primary-600">
              Bekijk als klant
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
      {sendResult && <p className="mt-1 text-[11px] text-green-600">{sendResult}</p>}
    </div>
  )
}

export default function DomainIntake({
  project,
  links,
  quotes,
  invoices,
  assignments,
  saving,
  sendingKind,
  sendResults,
  onChangeLinks,
  onSend,
  updateProject,
}: {
  project: Project
  links: IntakeLinks
  quotes: Quote[]
  invoices: Invoice[]
  assignments: Assignment[]
  saving: boolean
  sendingKind: IntakeDocKind | null
  sendResults: Partial<Record<IntakeDocKind, string>>
  onChangeLinks: (links: IntakeLinks) => void
  onSend: (kind: IntakeDocKind) => void
  updateProject: (updates: Partial<Project>) => void
}) {
  return (
    <div className="space-y-5">
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

      <div className="divide-y divide-gray-100">
        <DocRow
          kind="assignment"
          label="Opdracht"
          help="Kies de opdrachtomschrijving voor dit domein. Koppelen stuurt niets. Met 'Mail sturen' krijgt de klant een link om de opdracht te lezen en te accepteren, zonder in te loggen."
          icon={ClipboardCheck}
          value={links.assignment_id}
          options={assignments.map(a => ({ id: a.id, label: a.title }))}
          doc={assignments.find(a => a.id === links.assignment_id)}
          sending={sendingKind === 'assignment'}
          sendResult={sendResults.assignment}
          onSelect={(id) => onChangeLinks({ ...links, assignment_id: id })}
          onSend={() => onSend('assignment')}
        />
        <DocRow
          kind="quote"
          label="Offerte"
          help="Kies de offerte voor dit domein. Koppelen stuurt niets. Met 'Mail sturen' krijgt de klant een link om de offerte te bekijken en te accepteren of af te wijzen, zonder in te loggen."
          icon={FileCheck}
          value={links.quote_id}
          options={quotes.map(q => ({ id: q.id, label: `${q.number} — €${quoteTotal(q).toFixed(2)}` }))}
          doc={quotes.find(q => q.id === links.quote_id)}
          sending={sendingKind === 'quote'}
          sendResult={sendResults.quote}
          onSelect={(id) => onChangeLinks({ ...links, quote_id: id })}
          onSend={() => onSend('quote')}
        />
        <DocRow
          kind="invoice"
          label="Factuur"
          help="Kies de factuur voor dit domein. Koppelen stuurt niets. Met 'Mail sturen' krijgt de klant de factuur als PDF-bijlage plus een link om hem online te bekijken, zonder in te loggen."
          icon={FileText}
          value={links.invoice_id}
          options={invoices.filter(inv => !inv.is_remainder_invoice && !inv.is_recurring).map(inv => ({ id: inv.id, label: `${inv.number} — €${inv.amount.toFixed(2)}` }))}
          doc={invoices.find(inv => inv.id === links.invoice_id)}
          sending={sendingKind === 'invoice'}
          sendResult={sendResults.invoice}
          onSelect={(id) => onChangeLinks({ ...links, invoice_id: id })}
          onSend={() => onSend('invoice')}
        />
      </div>
      {saving && <p className="text-xs text-primary">Opslaan...</p>}
    </div>
  )
}
