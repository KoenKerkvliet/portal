import { Loader2, Send } from 'lucide-react'
import FieldInput from '../FieldInput'

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Linkveld dat stil opslaat, met ernaast een knop die de link naar de klant mailt
export default function LinkMailField({
  label,
  help,
  placeholder,
  value,
  sentAt,
  sending,
  sendResult,
  onSave,
  onSend,
}: {
  label: string
  help: string
  placeholder: string
  value: string | null
  sentAt: string | null | undefined
  sending: boolean
  sendResult?: string
  onSave: (url: string) => Promise<void> | void
  onSend: () => void
}) {
  return (
    <div>
      <div className="flex items-end gap-3">
        <div className="flex-1 min-w-0">
          <FieldInput label={label} type="url" placeholder={placeholder} linkable value={value || ''} onSave={onSave} help={help} />
        </div>
        <button type="button" onClick={onSend} disabled={!value || sending}
          title={value ? undefined : 'Vul eerst de link in'}
          className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-white bg-primary hover:bg-primary-600 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {sentAt ? 'Opnieuw mailen' : 'Mail sturen'}
        </button>
      </div>
      {value && (
        <p className="mt-1.5 text-[11px] text-gray-500">{sentAt ? `Gemaild op ${formatDateTime(sentAt)}` : 'Nog niet gemaild'}</p>
      )}
      {sendResult && <p className="mt-1 text-[11px] text-green-600">{sendResult}</p>}
    </div>
  )
}
