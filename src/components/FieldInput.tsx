import { useEffect, useRef, useState } from 'react'
import { Check, ExternalLink } from 'lucide-react'
import HelpTip from './HelpTip'

// Compact invoerveld dat opslaat bij verlaten van het veld (of Enter); Escape zet terug
export default function FieldInput({
  label,
  help,
  helpAlign,
  value,
  onSave,
  type = 'text',
  placeholder,
  hint,
  linkable = false,
}: {
  label: string
  help?: string
  helpAlign?: 'left' | 'center' | 'right'
  value: string
  onSave: (value: string) => Promise<void> | void
  type?: string
  placeholder?: string
  hint?: React.ReactNode
  linkable?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [saved, setSaved] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const commit = async () => {
    if (draft.trim() === value.trim()) return
    await onSave(draft)
    setSaved(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{label}</label>
        {help && <HelpTip text={help} align={helpAlign} />}
        {saved && <Check className="w-3.5 h-3.5 text-green-500" aria-label="Opgeslagen" />}
      </div>
      <div className="flex items-center gap-1">
        <input
          type={type}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur() }
          }}
          className="w-full min-w-0 h-8 px-2.5 text-sm text-gray-800 bg-white border border-gray-200 rounded-md placeholder:text-gray-300 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
        />
        {linkable && value && (
          <a href={value} target="_blank" rel="noopener noreferrer" title="Openen in nieuw tabblad"
            className="flex-shrink-0 p-1.5 text-gray-400 hover:text-primary rounded-md hover:bg-primary/5 transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
      {hint && <div className="mt-1 text-[11px]">{hint}</div>}
    </div>
  )
}
