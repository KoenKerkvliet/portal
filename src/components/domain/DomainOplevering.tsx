import { Link } from 'react-router-dom'
import { ExternalLink, FileText, Globe, Loader2, Send, Star } from 'lucide-react'
import type { Invoice, Project } from '../../types'
import HelpTip from '../HelpTip'
import { DocRow } from './DomainIntake'

export type DeliveryKind = 'live' | 'invoice' | 'review'

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Regel voor een mail zonder document: uitleg, wat er verstuurd wordt, en de knop
function MailRow({ icon: Icon, label, help, detail, sentAt, sending, sendResult, blockedReason, onSend }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  help: string
  detail: React.ReactNode
  sentAt: string | null | undefined
  sending: boolean
  sendResult?: string
  blockedReason?: React.ReactNode
  onSend: () => void
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{label}</span>
        <HelpTip text={help} />
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0 text-sm text-gray-700">{detail}</div>
        <button type="button" onClick={onSend} disabled={!!blockedReason || sending}
          className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-white bg-primary hover:bg-primary-600 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {sentAt ? 'Opnieuw mailen' : 'Mail sturen'}
        </button>
      </div>
      {blockedReason ? (
        <p className="mt-1.5 text-[11px] text-amber-600">{blockedReason}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-gray-500">{sentAt ? `Gemaild op ${formatDateTime(sentAt)}` : 'Nog niet gemaild'}</p>
      )}
      {sendResult && <p className="mt-1 text-[11px] text-green-600">{sendResult}</p>}
    </div>
  )
}

export default function DomainOplevering({
  project,
  invoices,
  linkedInvoiceId,
  reviewUrl,
  saving,
  sendingKind,
  sendResults,
  onSelectInvoice,
  onSend,
}: {
  project: Project
  invoices: Invoice[]
  linkedInvoiceId: string
  reviewUrl: string | null
  saving: boolean
  sendingKind: DeliveryKind | null
  sendResults: Partial<Record<DeliveryKind, string>>
  onSelectInvoice: (id: string) => void
  onSend: (kind: DeliveryKind) => void
}) {
  const selectable = invoices
    .filter(inv => !inv.is_recurring)
    .sort((a, b) => Number(b.is_remainder_invoice) - Number(a.is_remainder_invoice))
  const linkedInvoice = invoices.find(inv => inv.id === linkedInvoiceId)

  return (
    <div className="divide-y divide-gray-100">
      <MailRow
        icon={Globe}
        label="Website live"
        help="Mailt de klant dat de website live staat, met een knop naar de website die bij Algemeen staat. Gaat naar gekoppelde klanten met 'Portaalmails' aan."
        detail={project.url ? (
          <a href={project.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:text-primary-600 truncate max-w-full">
            <span className="truncate">{project.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </a>
        ) : <span className="text-gray-400">Geen website ingevuld</span>}
        sentAt={project.live_sent_at}
        sending={sendingKind === 'live'}
        sendResult={sendResults.live}
        blockedReason={project.url ? undefined : 'Vul eerst de website in bij Algemeen.'}
        onSend={() => onSend('live')}
      />

      <DocRow
        kind="invoice"
        label="Restfactuur"
        help="Kies de (rest)factuur voor de oplevering. Koppelen stuurt niets. Met 'Mail sturen' krijgt de klant de factuur als PDF-bijlage plus een link om hem online te bekijken, zonder in te loggen."
        icon={FileText}
        value={linkedInvoiceId}
        options={selectable.map(inv => ({ id: inv.id, label: `${inv.number} — €${inv.amount.toFixed(2)}${inv.is_remainder_invoice ? ' (restfactuur)' : ''}` }))}
        doc={linkedInvoice}
        sending={sendingKind === 'invoice'}
        sendResult={sendResults.invoice}
        sendBlockedReason={linkedInvoice?.has_temp_number ? 'Deze restfactuur heeft nog een tijdelijk nummer. Ken eerst het definitieve nummer toe op de Facturen-pagina.' : undefined}
        onSelect={onSelectInvoice}
        onSend={() => onSend('invoice')}
      />

      <MailRow
        icon={Star}
        label="Review-verzoek"
        help="Vraagt de klant om een review, met 6 gratis strippen als bedankje. De klant laat je weten wanneer de review geplaatst is; de strippen schenk je zelf bij Onderhoud. Gaat naar gekoppelde klanten met 'Portaalmails' aan."
        detail={reviewUrl ? (
          <span className="text-gray-500">Vraagt om een review, met 6 gratis strippen als bedankje</span>
        ) : <span className="text-gray-400">Geen reviewlink ingesteld</span>}
        sentAt={project.review_requested_at}
        sending={sendingKind === 'review'}
        sendResult={sendResults.review}
        blockedReason={reviewUrl ? undefined : (
          <>Stel eerst je reviewlink in bij <Link to="/admin/instellingen" className="underline">Instellingen → Facturen → Bedrijfsgegevens</Link>.</>
        )}
        onSend={() => onSend('review')}
      />
      {saving && <p className="pt-2 text-xs text-primary">Opslaan...</p>}
    </div>
  )
}
