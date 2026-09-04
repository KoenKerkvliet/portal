// Beheer van offertebijlages. Twee soorten:
//   - content: hier in het portaal geschreven. Gaat als extra pagina's mee in de
//     offerte-PDF, zodat de klant één bestand krijgt.
//   - file: geüpload bestand. Blijft een downloadlink bij de offerte.

import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { TableKit } from '@tiptap/extension-table'
import type { QuoteAttachment } from '../../types'
import {
  Plus,
  Paperclip,
  FileText,
  Trash2,
  X,
  Pencil,
  Save,
  Upload,
  Loader2,
  AlertCircle,
  Download,
  Eye,
  EyeOff,
  Table as TableIcon,
} from 'lucide-react'

interface FormData {
  title: string
  description: string
  content: string
}

const emptyForm: FormData = { title: '', description: '', content: '' }

function ToolbarButton({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 rounded text-xs transition-colors ${
        active ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

function BijlageEditor({
  content,
  onChange,
}: {
  content: string
  onChange: (html: string) => void
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  if (!editor) return null

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 bg-gray-50 border-b border-gray-200 px-2 py-1.5">
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <div className="w-px self-stretch bg-gray-200 mx-1" />
        <ToolbarButton
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <span className="font-bold">H2</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <span className="font-bold">H3</span>
        </ToolbarButton>
        <div className="w-px self-stretch bg-gray-200 mx-1" />
        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          &bull; Lijst
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. Lijst
        </ToolbarButton>
        <div className="w-px self-stretch bg-gray-200 mx-1" />
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
          title="Tabel invoegen"
        >
          <TableIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
        {editor.isActive('table') && (
          <>
            <ToolbarButton onClick={() => editor.chain().focus().addRowAfter().run()}>
              + rij
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().addColumnAfter().run()}>
              + kolom
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().deleteRow().run()}>
              &minus; rij
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().deleteColumn().run()}>
              &minus; kolom
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().deleteTable().run()}>
              Tabel weg
            </ToolbarButton>
          </>
        )}
        <div className="w-px self-stretch bg-gray-200 mx-1" />
        <ToolbarButton
          active={editor.isActive('link')}
          onClick={() => {
            const url = window.prompt('URL invoeren:')
            if (url) editor.chain().focus().setLink({ href: url }).run()
          }}
        >
          Link
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          Lijn
        </ToolbarButton>
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none px-4 py-3 min-h-[320px] focus-within:ring-2 focus-within:ring-primary/20 transition-all [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[300px] [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1"
      />
    </div>
  )
}

export default function Attachments() {
  const [attachments, setAttachments] = useState<QuoteAttachment[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchAttachments = async () => {
    const { data } = await supabase
      .from('quote_attachments')
      .select('*')
      .order('sort_order')
      .order('created_at')
    setAttachments(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchAttachments()
  }, [])

  const openNew = () => {
    setEditingId(null)
    setFormData(emptyForm)
    setError('')
    setShowForm(true)
  }

  const openEdit = (attachment: QuoteAttachment) => {
    setEditingId(attachment.id)
    setFormData({
      title: attachment.title,
      description: attachment.description,
      content: attachment.content || '',
    })
    setError('')
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formData.title.trim()) {
      setError('Geef de bijlage een titel.')
      return
    }
    setSaving(true)
    setError('')

    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      content: formData.content,
      kind: 'content',
    }

    const { error: saveError } = editingId
      ? await supabase.from('quote_attachments').update(payload).eq('id', editingId)
      : await supabase
          .from('quote_attachments')
          .insert({ ...payload, sort_order: attachments.length })

    setSaving(false)

    if (saveError) {
      setError(`Opslaan mislukt: ${saveError.message}`)
      return
    }

    setShowForm(false)
    setFormData(emptyForm)
    setEditingId(null)
    fetchAttachments()
  }

  const handleUpload = async (file: File) => {
    setError('')
    setUploading(true)

    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'pdf'
    const path = `${crypto.randomUUID()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('quote-attachments')
      .upload(path, file, { contentType: file.type || 'application/octet-stream' })

    if (uploadErr) {
      setError(`Uploaden mislukt: ${uploadErr.message}`)
      setUploading(false)
      return
    }

    const { error: insertErr } = await supabase.from('quote_attachments').insert({
      title: file.name.replace(/\.[^.]+$/, ''),
      kind: 'file',
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream',
      sort_order: attachments.length,
    })

    if (insertErr) {
      await supabase.storage.from('quote-attachments').remove([path])
      setError(`Opslaan van de bijlage mislukt: ${insertErr.message}`)
      setUploading(false)
      return
    }

    setUploading(false)
    fetchAttachments()
  }

  const toggleArchived = async (attachment: QuoteAttachment) => {
    const next = !attachment.is_active
    if (
      !next &&
      !confirm(
        `"${attachment.title}" uit de bibliotheek halen?\n\n` +
          'Je kunt hem dan niet meer aanvinken bij nieuwe offertes. Offertes die deze bijlage ' +
          'al hebben, blijven hem gewoon tonen.',
      )
    )
      return
    await supabase.from('quote_attachments').update({ is_active: next }).eq('id', attachment.id)
    fetchAttachments()
  }

  const openFile = async (attachment: QuoteAttachment) => {
    if (!attachment.file_path) return
    const { data } = await supabase.storage
      .from('quote-attachments')
      .createSignedUrl(attachment.file_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  }

  const visible = attachments.filter((a) => (showArchived ? true : a.is_active))

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bijlages</h1>
          <p className="text-sm text-gray-500 mt-1">
            Documenten die je bij een offerte kunt aanvinken. Wat je hier schrijft, komt achter de
            offerte in dezelfde PDF te staan.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleUpload(file)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Bestand uploaden
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nieuwe bijlage
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
          <Paperclip className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">
            Nog geen bijlages. Maak er een aan en schrijf de inhoud in het portaal.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((attachment) => (
            <div
              key={attachment.id}
              className={`flex items-start gap-4 bg-white rounded-2xl border shadow-sm px-5 py-4 ${
                attachment.is_active ? 'border-gray-100' : 'border-gray-200 opacity-60'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center shrink-0">
                {attachment.kind === 'file' ? (
                  <Paperclip className="w-4 h-4 text-primary" />
                ) : (
                  <FileText className="w-4 h-4 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-semibold text-gray-900">{attachment.title}</h2>
                  {attachment.kind === 'file' ? (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[11px] font-medium rounded-full">
                      Bestand &middot; alleen downloadlink
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 text-[11px] font-medium rounded-full">
                      Gaat mee in de PDF
                    </span>
                  )}
                  {!attachment.is_active && (
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[11px] font-medium rounded-full">
                      Gearchiveerd
                    </span>
                  )}
                </div>
                {attachment.description && (
                  <p className="text-xs text-gray-500 mt-1">{attachment.description}</p>
                )}
                <p className="text-[11px] text-gray-400 mt-1">
                  {attachment.kind === 'file'
                    ? `${attachment.file_name}${
                        attachment.file_size ? ` · ${(attachment.file_size / 1024).toFixed(0)} kB` : ''
                      }`
                    : `${(attachment.content || '').replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length} woorden`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {attachment.kind === 'file' ? (
                  <button
                    onClick={() => openFile(attachment)}
                    title="Bekijken"
                    className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => openEdit(attachment)}
                    title="Inhoud bewerken"
                    className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => toggleArchived(attachment)}
                  title={attachment.is_active ? 'Uit bibliotheek halen' : 'Terugzetten'}
                  className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                >
                  {attachment.is_active ? (
                    <Trash2 className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {attachments.some((a) => !a.is_active) && (
        <button
          onClick={() => setShowArchived((v) => !v)}
          className="flex items-center gap-1.5 mt-4 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          {showArchived ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showArchived ? 'Gearchiveerde bijlages verbergen' : 'Gearchiveerde bijlages tonen'}
        </button>
      )}

      {/* Editor */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                {editingId ? 'Bijlage bewerken' : 'Nieuwe bijlage'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Titel</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                  placeholder="Bijv. Kosten na oplevering"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Korte omschrijving <span className="text-gray-400 font-normal">(optioneel)</span>
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                  placeholder="Wordt onder de titel getoond bij de offerte"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Inhoud</label>
                <BijlageEditor
                  content={formData.content}
                  onChange={(html) => setFormData((prev) => ({ ...prev, content: html }))}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Opslaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
