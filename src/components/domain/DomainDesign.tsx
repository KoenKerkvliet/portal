import { CheckCircle, ExternalLink, Loader2, Palette, RefreshCw, Send, Trash2, Upload, MessageSquare } from 'lucide-react'
import HelpTip from '../HelpTip'
import { designFields, type DesignImageKey, type DesignImages, type ProjectPhaseInstance } from './domainShared'

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function DomainDesign({
  instance,
  images,
  uploadingKey,
  saving,
  sendingKey,
  sendResults,
  onUpload,
  onRemove,
  onSend,
}: {
  instance: ProjectPhaseInstance | null
  images: DesignImages
  uploadingKey: DesignImageKey | null
  saving: boolean
  sendingKey: DesignImageKey | null
  sendResults: Partial<Record<DesignImageKey, string>>
  onUpload: (key: DesignImageKey, file: File) => void
  onRemove: (key: DesignImageKey) => void
  onSend: (key: DesignImageKey) => void
}) {
  const approvals = instance?.custom_data?.design_approvals || {}
  const sentAt = instance?.custom_data?.design_sent_at || {}

  const fileInput = (key: DesignImageKey) => (
    <input
      type="file"
      accept="image/*"
      className="hidden"
      disabled={uploadingKey === key}
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) onUpload(key, file)
        e.target.value = ''
      }}
    />
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Ontwerpen</span>
        <HelpTip text="Uploaden en vervangen gaat stil: de klant krijgt niets. Met 'Mail sturen' krijgt de klant een link om het ontwerp zonder inloggen te bekijken en goed te keuren of feedback te geven. De mail gaat naar gekoppelde klanten met 'Portaalmails' aan." />
      </div>
      <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
        {designFields.map(({ key, label, approvalType }) => {
          const approval = approvals[approvalType]
          const status = approval?.status
          const imageUrl = images[key]
          const lastSent = sentAt[approvalType]
          const isUploading = uploadingKey === key
          const canSend = !!imageUrl && status !== 'accepted' && status !== 'declined'
          const sendTitle = !imageUrl ? 'Upload eerst een afbeelding'
            : status === 'accepted' ? 'Al goedgekeurd'
            : status === 'declined' ? 'Upload eerst een nieuwe versie'
            : undefined
          return (
            <div key={key} className="flex items-start gap-3 p-3 flex-wrap sm:flex-nowrap">
              {/* Miniatuur of uploadvak */}
              {imageUrl ? (
                <a href={imageUrl} target="_blank" rel="noopener noreferrer" title="Open op ware grootte"
                  className={`flex-shrink-0 w-28 h-20 rounded-md overflow-hidden border-2 bg-gray-50 ${
                    status === 'accepted' ? 'border-green-400' : status === 'declined' ? 'border-red-400' : 'border-gray-200'
                  }`}>
                  <img src={imageUrl} alt={label} className="w-full h-full object-cover object-top" />
                </a>
              ) : (
                <label className={`flex-shrink-0 w-28 h-20 rounded-md border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
                  isUploading ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary hover:bg-gray-50'
                }`}>
                  {isUploading ? <Loader2 className="w-4 h-4 text-primary animate-spin" /> : <Upload className="w-4 h-4 text-gray-400" />}
                  <span className="text-[10px] text-gray-500">{isUploading ? 'Uploaden...' : 'Uploaden'}</span>
                  {fileInput(key)}
                </label>
              )}

              {/* Naam en status */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm font-medium text-gray-800">{label}</span>
                </div>
                <div className="mt-1 space-y-0.5 text-[11px] text-gray-500">
                  {!imageUrl ? (
                    <p className="text-gray-400">Nog geen afbeelding</p>
                  ) : status === 'accepted' ? (
                    <p className="flex items-center gap-1 text-green-700">
                      <CheckCircle className="w-3 h-3" />
                      Goedgekeurd{approval?.accepted_name ? ` door ${approval.accepted_name}` : ''}{approval?.accepted_at ? ` op ${formatDateTime(approval.accepted_at)}` : ''}
                    </p>
                  ) : status === 'declined' ? (
                    <div className="text-red-600">
                      <p className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        Aanpassing gevraagd{approval?.declined_name ? ` door ${approval.declined_name}` : ''} — upload een nieuwe versie
                      </p>
                      {approval?.declined_reason && <p className="mt-0.5 text-gray-600 italic">"{approval.declined_reason}"</p>}
                    </div>
                  ) : status === 'new_version' ? (
                    <p className="flex items-center gap-1 text-blue-700"><RefreshCw className="w-3 h-3" />Nieuwe versie klaar</p>
                  ) : null}
                  {imageUrl && <p>{lastSent ? `Gemaild op ${formatDateTime(lastSent)}` : 'Nog niet gemaild'}</p>}
                  {imageUrl && instance?.public_token && (
                    <a href={`/d/design/${instance.public_token}?type=${approvalType}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:text-primary-600">
                      Bekijk als klant <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {sendResults[key] && <p className="text-green-600">{sendResults[key]}</p>}
                </div>
              </div>

              {/* Acties */}
              <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                {imageUrl && (
                  <>
                    <label className="p-1.5 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100 cursor-pointer transition-colors" title="Nieuwe versie uploaden">
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {fileInput(key)}
                    </label>
                    <button type="button" onClick={() => { if (confirm(`${label} verwijderen?`)) onRemove(key) }}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors" title="Verwijderen">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button type="button" onClick={() => onSend(key)} disabled={!canSend || sendingKey === key} title={sendTitle}
                  className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-white bg-primary hover:bg-primary-600 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {sendingKey === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {lastSent && status !== 'new_version' ? 'Opnieuw mailen' : 'Mail sturen'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {saving && <p className="text-xs text-primary">Opslaan...</p>}
    </div>
  )
}
