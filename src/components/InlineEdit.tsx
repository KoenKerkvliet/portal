import { useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'

// Klik-om-te-bewerken tekstveld: Enter of blur slaat op, Escape annuleert
export default function InlineEdit({
  value,
  onSave,
  type = 'text',
  placeholder,
  icon: Icon,
  displayValue,
  textClassName = 'text-sm text-gray-500 hover:text-gray-700',
}: {
  value: string
  onSave: (value: string) => void
  type?: string
  placeholder?: string
  icon?: React.ComponentType<{ className?: string }>
  displayValue?: string
  textClassName?: string
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  useEffect(() => { setEditValue(value) }, [value])

  const save = () => {
    setEditing(false)
    if (editValue !== value) onSave(editValue)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
        <input ref={inputRef} type={type} value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditValue(value); setEditing(false) } }}
          className="px-2 py-1 bg-white border border-primary/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-0"
          placeholder={placeholder} />
      </div>
    )
  }

  return (
    <button onClick={() => setEditing(true)}
      className={`flex items-center gap-1.5 group transition-colors text-left ${textClassName}`} title="Klik om te bewerken">
      {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
      <span>{displayValue || value || placeholder}</span>
      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0" />
    </button>
  )
}
