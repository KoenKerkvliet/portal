import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { CardElement, CardElementType, Form } from '../types'
import { supabase } from '../lib/supabase'
import {
  Plus, Trash2, Type, Image, Zap, Link2, MousePointer, FileText,
  Calendar, Clock, User, Mail, Phone, Globe, Star, Heart, CheckCircle,
  AlertCircle, Info, MessageSquare, MapPin, Briefcase, Home, Shield,
  GripVertical, ChevronUp, ChevronDown,
} from 'lucide-react'

// Available dynamic data fields
export const dynamicFields: { key: string; label: string; icon: typeof Calendar }[] = [
  { key: 'start_meeting_at', label: 'Startgesprek (datum & tijd)', icon: Calendar },
  { key: 'due_date', label: 'Opleverdatum', icon: Clock },
  { key: 'project_name', label: 'Domeinnaam', icon: Globe },
  { key: 'client_name', label: 'Klantnaam', icon: User },
]

// Icon picker options
const iconOptions = [
  { name: 'calendar', icon: Calendar, label: 'Kalender' },
  { name: 'clock', icon: Clock, label: 'Klok' },
  { name: 'user', icon: User, label: 'Gebruiker' },
  { name: 'mail', icon: Mail, label: 'E-mail' },
  { name: 'phone', icon: Phone, label: 'Telefoon' },
  { name: 'globe', icon: Globe, label: 'Website' },
  { name: 'star', icon: Star, label: 'Ster' },
  { name: 'heart', icon: Heart, label: 'Hart' },
  { name: 'check-circle', icon: CheckCircle, label: 'Vinkje' },
  { name: 'alert-circle', icon: AlertCircle, label: 'Waarschuwing' },
  { name: 'info', icon: Info, label: 'Info' },
  { name: 'message-square', icon: MessageSquare, label: 'Bericht' },
  { name: 'map-pin', icon: MapPin, label: 'Locatie' },
  { name: 'briefcase', icon: Briefcase, label: 'Werk' },
  { name: 'home', icon: Home, label: 'Huis' },
  { name: 'shield', icon: Shield, label: 'Beveiliging' },
  { name: 'file-text', icon: FileText, label: 'Document' },
  { name: 'link', icon: Link2, label: 'Link' },
]

export function getIconComponent(name: string) {
  return iconOptions.find(o => o.name === name)?.icon || Star
}

const elementTypes: { type: CardElementType; label: string; icon: typeof Type; description: string }[] = [
  { type: 'icon', label: 'Icoon', icon: Image, description: 'Kies een icoon' },
  { type: 'text', label: 'Tekstveld', icon: Type, description: 'Vrij tekstveld' },
  { type: 'dynamic', label: 'Dynamische data', icon: Zap, description: 'Toon projectdata' },
  { type: 'link', label: 'Link', icon: Link2, description: 'Klikbare link' },
  { type: 'button', label: 'Knop', icon: MousePointer, description: 'Call-to-action knop' },
  { type: 'form', label: 'Formulier', icon: FileText, description: 'Koppel een formulier' },
]

function createDefaultElement(type: CardElementType): CardElement {
  const base = { id: crypto.randomUUID(), type, data: {} as Record<string, string> }
  switch (type) {
    case 'icon': return { ...base, data: { name: 'star', color: '#9e86ff' } }
    case 'text': return { ...base, data: { content: '' } }
    case 'dynamic': return { ...base, data: { field: 'start_meeting_at' } }
    case 'link': return { ...base, data: { url: '', label: '' } }
    case 'button': return { ...base, data: { url: '', label: '', variant: 'primary' } }
    case 'form': return { ...base, data: { formId: '' } }
  }
}

// Portal dropdown — renders at document.body level so it's never clipped
function PortalDropdown({ anchorRef, open, onClose, children }: {
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  const [pos, setPos] = useState({ top: 0, left: 0, openUp: false })
  const dropdownRef = useRef<HTMLDivElement>(null)

  const updatePos = useCallback(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const estimatedHeight = 320 // approximate dropdown height
      const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow

      setPos({
        top: openUp ? rect.top - 4 : rect.bottom + 4,
        left: rect.left + rect.width / 2,
        openUp,
      })
    }
  }, [anchorRef])

  useEffect(() => {
    if (open) updatePos()
  }, [open, updatePos])

  if (!open) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        ref={dropdownRef}
        className="fixed z-[9999] overflow-y-auto"
        style={{
          top: pos.openUp ? undefined : pos.top,
          bottom: pos.openUp ? `${window.innerHeight - pos.top}px` : undefined,
          left: pos.left,
          transform: 'translateX(-50%)',
          maxHeight: `${Math.min(400, pos.openUp ? pos.top - 8 : window.innerHeight - pos.top - 8)}px`,
        }}
      >
        {children}
      </div>
    </>,
    document.body
  )
}

// Insert menu that appears between elements
function InsertMenu({ onInsert }: { onInsert: (type: CardElementType) => void }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="relative flex items-center justify-center py-0.5 group/insert">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="w-5 h-5 rounded-full bg-gray-100 hover:bg-primary hover:text-white text-gray-400 flex items-center justify-center transition-all opacity-0 group-hover/insert:opacity-100 focus:opacity-100 z-10"
        title="Element toevoegen"
      >
        <Plus className="w-3 h-3" />
      </button>
      <div className="absolute left-0 right-0 h-px bg-gray-200 opacity-0 group-hover/insert:opacity-100 transition-opacity" />

      <PortalDropdown anchorRef={btnRef} open={open} onClose={() => setOpen(false)}>
        <div className="bg-white rounded-xl shadow-2xl border border-gray-100 py-2 min-w-[220px]">
          <p className="px-3 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Element toevoegen</p>
          {elementTypes.map((et) => (
            <button
              type="button"
              key={et.type}
              onClick={() => { onInsert(et.type); setOpen(false) }}
              disabled={false}
              className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                <et.icon className="w-4 h-4 text-gray-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">{et.label}</p>
                <p className="text-[11px] text-gray-400">{et.description}</p>
              </div>
            </button>
          ))}
        </div>
      </PortalDropdown>
    </div>
  )
}

// Individual element editor
function ElementEditor({
  element,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  element: CardElement
  onChange: (data: Record<string, string>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}) {
  const typeInfo = elementTypes.find(t => t.type === element.type)

  return (
    <div className="group/element relative bg-white border border-gray-200 rounded-lg">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-100 rounded-t-lg">
        <GripVertical className="w-3 h-3 text-gray-300 flex-shrink-0" />
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {typeInfo && <typeInfo.icon className="w-3 h-3 text-gray-400" />}
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{typeInfo?.label}</span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover/element:opacity-100 transition-opacity">
          <button type="button" onClick={onMoveUp} disabled={isFirst}
            className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors" title="Omhoog">
            <ChevronUp className="w-3 h-3" />
          </button>
          <button type="button" onClick={onMoveDown} disabled={isLast}
            className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors" title="Omlaag">
            <ChevronDown className="w-3 h-3" />
          </button>
          <button type="button" onClick={onRemove}
            className="p-0.5 text-gray-400 hover:text-red-500 transition-colors" title="Verwijderen">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Content editor based on type */}
      <div className="p-3">
        {element.type === 'icon' && (
          <IconEditor data={element.data} onChange={onChange} />
        )}
        {element.type === 'text' && (
          <TextEditor data={element.data} onChange={onChange} />
        )}
        {element.type === 'dynamic' && (
          <DynamicEditor data={element.data} onChange={onChange} />
        )}
        {element.type === 'link' && (
          <LinkEditor data={element.data} onChange={onChange} />
        )}
        {element.type === 'button' && (
          <ButtonEditor data={element.data} onChange={onChange} />
        )}
        {element.type === 'form' && (
          <FormEditor data={element.data} onChange={onChange} />
        )}
      </div>
    </div>
  )
}

// --- Type-specific editors ---

function IconEditor({ data, onChange }: { data: Record<string, string>; onChange: (d: Record<string, string>) => void }) {
  const [showPicker, setShowPicker] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const SelectedIcon = getIconComponent(data.name || 'star')

  return (
    <div>
      <div className="flex items-center gap-3">
        <div>
          <button type="button" ref={btnRef} onClick={() => setShowPicker(!showPicker)}
            className="w-12 h-12 rounded-xl border-2 border-dashed border-gray-200 hover:border-primary flex items-center justify-center transition-colors"
            style={{ color: data.color || '#9e86ff' }}>
            <SelectedIcon className="w-6 h-6" />
          </button>
          <PortalDropdown anchorRef={btnRef} open={showPicker} onClose={() => setShowPicker(false)}>
            <div className="bg-white rounded-xl shadow-2xl border border-gray-100 p-2 grid grid-cols-6 gap-1 w-[220px]">
              {iconOptions.map((opt) => (
                <button type="button" key={opt.name} onClick={() => { onChange({ ...data, name: opt.name }); setShowPicker(false) }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${data.name === opt.name ? 'bg-primary/10 text-primary' : 'hover:bg-gray-100 text-gray-500'}`}
                  title={opt.label}>
                  <opt.icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </PortalDropdown>
        </div>
        <div className="flex-1">
          <label className="block text-[11px] text-gray-400 mb-1">Kleur</label>
          <input type="color" value={data.color || '#9e86ff'}
            onChange={(e) => onChange({ ...data, color: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer border border-gray-200" />
        </div>
      </div>
    </div>
  )
}

function TextEditor({ data, onChange }: { data: Record<string, string>; onChange: (d: Record<string, string>) => void }) {
  return (
    <textarea value={data.content || ''}
      onChange={(e) => onChange({ ...data, content: e.target.value })}
      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm resize-none"
      rows={3} placeholder="Tekst invoeren..." />
  )
}

function DynamicEditor({ data, onChange }: { data: Record<string, string>; onChange: (d: Record<string, string>) => void }) {
  return (
    <div>
      <label className="block text-[11px] text-gray-400 mb-1">Databron</label>
      <select value={data.field || 'start_meeting_at'}
        onChange={(e) => {
          const selected = dynamicFields.find(f => f.key === e.target.value)
          onChange({ ...data, field: e.target.value, label: selected?.label || '' })
        }}
        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm">
        {dynamicFields.map((f) => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </select>
    </div>
  )
}

function LinkEditor({ data, onChange }: { data: Record<string, string>; onChange: (d: Record<string, string>) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <label className="block text-[11px] text-gray-400 mb-1">Label</label>
        <input type="text" value={data.label || ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
          placeholder="Klik hier" />
      </div>
      <div>
        <label className="block text-[11px] text-gray-400 mb-1">URL</label>
        <input type="url" value={data.url || ''}
          onChange={(e) => onChange({ ...data, url: e.target.value })}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
          placeholder="https://..." />
      </div>
    </div>
  )
}

function ButtonEditor({ data, onChange }: { data: Record<string, string>; onChange: (d: Record<string, string>) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <label className="block text-[11px] text-gray-400 mb-1">Knoptekst</label>
        <input type="text" value={data.label || ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
          placeholder="Bekijk meer" />
      </div>
      <div>
        <label className="block text-[11px] text-gray-400 mb-1">URL</label>
        <input type="url" value={data.url || ''}
          onChange={(e) => onChange({ ...data, url: e.target.value })}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
          placeholder="https://..." />
      </div>
      <div>
        <label className="block text-[11px] text-gray-400 mb-1">Stijl</label>
        <div className="flex gap-2">
          {[
            { value: 'primary', label: 'Primair', cls: 'bg-primary text-white' },
            { value: 'outline', label: 'Outline', cls: 'bg-white text-gray-700 border border-gray-300' },
          ].map((v) => (
            <button type="button" key={v.value} onClick={() => onChange({ ...data, variant: v.value })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${v.cls} ${data.variant === v.value ? 'ring-2 ring-primary/30 ring-offset-1' : 'opacity-60 hover:opacity-100'}`}>
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function FormEditor({ data, onChange }: { data: Record<string, string>; onChange: (d: Record<string, string>) => void }) {
  const [forms, setForms] = useState<Form[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchForms = async () => {
      const { data: formsData } = await supabase.from('forms').select('*').order('title')
      setForms(formsData || [])
      setLoading(false)
    }
    fetchForms()
  }, [])

  if (loading) return <p className="text-xs text-gray-400">Laden...</p>

  return (
    <div>
      <label className="block text-[11px] text-gray-400 mb-1">Formulier</label>
      {forms.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Geen formulieren beschikbaar. Maak er eerst een aan via Content &gt; Formulieren.</p>
      ) : (
        <select value={data.formId || ''}
          onChange={(e) => {
            const selected = forms.find(f => f.id === e.target.value)
            onChange({ ...data, formId: e.target.value, formTitle: selected?.title || '' })
          }}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm">
          <option value="">Kies een formulier...</option>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>{f.title} ({f.steps?.length || 0} stappen)</option>
          ))}
        </select>
      )}
    </div>
  )
}

// --- Main exported component ---

export default function CardElementsEditor({
  elements,
  onChange,
}: {
  elements: CardElement[]
  onChange: (elements: CardElement[]) => void
}) {
  const insertAt = (index: number, type: CardElementType) => {
    const newEl = createDefaultElement(type)
    const updated = [...elements]
    updated.splice(index, 0, newEl)
    onChange(updated)
  }

  const updateElement = (index: number, data: Record<string, string>) => {
    const updated = [...elements]
    updated[index] = { ...updated[index], data }
    onChange(updated)
  }

  const removeElement = (index: number) => {
    onChange(elements.filter((_, i) => i !== index))
  }

  const moveElement = (index: number, direction: 'up' | 'down') => {
    const updated = [...elements]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= updated.length) return
    ;[updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]]
    onChange(updated)
  }

  return (
    <div className="space-y-0">
      {/* Insert point before first element */}
      <InsertMenu onInsert={(type) => insertAt(0, type)} />

      {elements.map((element, index) => (
        <div key={element.id}>
          <ElementEditor
            element={element}
            onChange={(data) => updateElement(index, data)}
            onRemove={() => removeElement(index)}
            onMoveUp={() => moveElement(index, 'up')}
            onMoveDown={() => moveElement(index, 'down')}
            isFirst={index === 0}
            isLast={index === elements.length - 1}
          />
          {/* Insert point after each element */}
          <InsertMenu onInsert={(type) => insertAt(index + 1, type)} />
        </div>
      ))}

      {elements.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-2">Hover boven het plusje om elementen toe te voegen</p>
      )}
    </div>
  )
}
