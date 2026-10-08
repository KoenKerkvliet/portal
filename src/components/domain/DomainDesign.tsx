import { AlertTriangle, CheckCircle, Palette, Upload, Trash2 } from 'lucide-react'
import type { DesignImageKey, DesignImages, ProjectPhaseInstance } from './domainShared'

const fields: { key: DesignImageKey; label: string; approvalType: string }[] = [
  { key: 'styleguide', label: 'Styleguide', approvalType: 'styleguide' },
  { key: 'homepage', label: 'Homepage', approvalType: 'homepage' },
  { key: 'tweede', label: 'Contactpagina', approvalType: 'contactpage' },
]

export default function DomainDesign({
  instance,
  images,
  uploadingKey,
  saving,
  onUpload,
  onRemove,
}: {
  instance: ProjectPhaseInstance | null
  images: DesignImages
  uploadingKey: DesignImageKey | null
  saving: boolean
  onUpload: (key: DesignImageKey, file: File) => void
  onRemove: (key: DesignImageKey) => void
}) {
  const approvals = instance?.custom_data?.design_approvals || {}

  const fileInput = (key: DesignImageKey, disabled = false) => (
    <input
      type="file"
      accept="image/*"
      className="hidden"
      disabled={disabled}
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) onUpload(key, file)
        e.target.value = ''
      }}
    />
  )

  return (
    <div className="space-y-2">
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
        Let op: een afbeelding in een leeg vak uploaden, of een afgekeurd design vervangen, stuurt de klant direct een mail.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {fields.map(({ key, label, approvalType }) => {
          const approval = approvals[approvalType]
          const isDeclined = approval?.status === 'declined'
          const isAccepted = approval?.status === 'accepted'
          const imageUrl = images[key]
          const isUploading = uploadingKey === key
          return (
            <div key={key}>
              <div className="flex items-center gap-1.5 mb-2">
                {isDeclined ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                ) : isAccepted ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Palette className="w-3.5 h-3.5 text-gray-400" />
                )}
                <span className={`text-[11px] font-medium uppercase tracking-wider ${isDeclined ? 'text-red-500' : isAccepted ? 'text-green-500' : 'text-gray-400'}`}>{label}</span>
                {isDeclined && (
                  <span className="text-[10px] font-medium text-red-500 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">Afgekeurd</span>
                )}
                {isAccepted && (
                  <span className="text-[10px] font-medium text-green-600 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">Goedgekeurd</span>
                )}
              </div>
              {isDeclined && approval?.declined_reason && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-red-700">
                    <p className="font-medium">Feedback van {approval.declined_name || 'klant'}:</p>
                    <p className="mt-0.5">{approval.declined_reason}</p>
                  </div>
                </div>
              )}
              {imageUrl ? (
                <div className={`relative rounded-lg overflow-hidden border-2 ${
                  isDeclined ? 'border-red-500' : isAccepted ? 'border-green-500' : 'border-gray-200'
                }`}>
                  <img src={imageUrl} alt={label} className="w-full h-auto max-h-48 object-cover object-top" />
                  <div className="absolute top-2 right-2 flex gap-1">
                    <label className="p-1.5 bg-white/90 rounded-lg shadow-sm cursor-pointer hover:bg-white transition-colors" title="Vervangen">
                      <Upload className="w-3.5 h-3.5 text-gray-600" />
                      {fileInput(key)}
                    </label>
                    <button
                      onClick={() => onRemove(key)}
                      className="p-1.5 bg-white/90 rounded-lg shadow-sm hover:bg-red-50 transition-colors"
                      title="Verwijderen"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
              ) : (
                <label className={`flex flex-col items-center justify-center gap-1.5 w-full h-16 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                  isUploading ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary hover:bg-gray-50'
                }`}>
                  {isUploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="text-[11px] text-primary">Uploaden...</span>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Upload className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-[11px] text-gray-500">Klik om afbeelding te uploaden</span>
                    </div>
                  )}
                  {fileInput(key, isUploading)}
                </label>
              )}
            </div>
          )
        })}
      </div>
      {saving && <p className="text-xs text-primary">Opslaan...</p>}
    </div>
  )
}
