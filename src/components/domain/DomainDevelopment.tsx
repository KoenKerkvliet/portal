import { Loader2, Send } from 'lucide-react'
import type { Project } from '../../types'
import FieldInput from '../FieldInput'

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function DomainDevelopment({
  project,
  sending,
  sendResult,
  onSaveUrl,
  onSend,
}: {
  project: Project
  sending: boolean
  sendResult?: string
  onSaveUrl: (url: string) => Promise<void> | void
  onSend: () => void
}) {
  const hasUrl = Boolean(project.staging_url)
  return (
    <div>
      <div className="flex items-end gap-3">
        <div className="flex-1 min-w-0">
          <FieldInput label="Stagingsite" type="url" placeholder="https://staging..." linkable
            value={project.staging_url || ''} onSave={onSaveUrl}
            help="Testomgeving waar je de site bouwt voordat hij live gaat. De link invullen of wijzigen stuurt niets; met 'Mail sturen' krijgt de klant een mail met een knop naar de testsite. De mail gaat naar gekoppelde klanten met 'Portaalmails' aan." />
        </div>
        <button type="button" onClick={onSend} disabled={!hasUrl || sending}
          title={hasUrl ? undefined : 'Vul eerst de link in'}
          className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-white bg-primary hover:bg-primary-600 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {project.staging_sent_at ? 'Opnieuw mailen' : 'Mail sturen'}
        </button>
      </div>
      {hasUrl && (
        <p className="mt-1.5 text-[11px] text-gray-500">
          {project.staging_sent_at ? `Gemaild op ${formatDateTime(project.staging_sent_at)}` : 'Nog niet gemaild'}
        </p>
      )}
      {sendResult && <p className="mt-1 text-[11px] text-green-600">{sendResult}</p>}
    </div>
  )
}
