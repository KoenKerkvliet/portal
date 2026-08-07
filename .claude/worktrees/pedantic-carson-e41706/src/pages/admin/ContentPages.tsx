import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, FileText, Trash2, X, Pencil, Eye, EyeOff, Save } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'

interface ContentPage {
  id: string
  title: string
  slug: string
  content: string
  status: 'draft' | 'published'
  created_at: string
  updated_at: string
}

interface FormData {
  title: string
  slug: string
  content: string
  status: 'draft' | 'published'
}

const emptyForm: FormData = { title: '', slug: '', content: '', status: 'draft' }

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function TiptapEditor({ content, onChange }: { content: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  if (!editor) return null

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-0.5 bg-gray-50 border-b border-gray-200 px-2 py-1.5">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
          className={`px-2 py-1 rounded text-xs font-bold transition-colors ${editor.isActive('bold') ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-100'}`}>
          B
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`px-2 py-1 rounded text-xs italic transition-colors ${editor.isActive('italic') ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-100'}`}>
          I
        </button>
        <div className="w-px bg-gray-200 mx-1" />
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`px-2 py-1 rounded text-xs font-bold transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-100'}`}>
          H2
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`px-2 py-1 rounded text-xs font-bold transition-colors ${editor.isActive('heading', { level: 3 }) ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-100'}`}>
          H3
        </button>
        <div className="w-px bg-gray-200 mx-1" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`px-2 py-1 rounded text-xs transition-colors ${editor.isActive('bulletList') ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-100'}`}>
          • Lijst
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`px-2 py-1 rounded text-xs transition-colors ${editor.isActive('orderedList') ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-100'}`}>
          1. Lijst
        </button>
        <div className="w-px bg-gray-200 mx-1" />
        <button type="button" onClick={() => {
          const url = window.prompt('URL invoeren:')
          if (url) editor.chain().focus().setLink({ href: url }).run()
        }}
          className={`px-2 py-1 rounded text-xs transition-colors ${editor.isActive('link') ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-100'}`}>
          Link
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`px-2 py-1 rounded text-xs transition-colors ${editor.isActive('blockquote') ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-100'}`}>
          Quote
        </button>
      </div>
      {/* Editor content */}
      <EditorContent editor={editor} className="prose prose-sm max-w-none px-4 py-3 min-h-[200px] focus-within:ring-2 focus-within:ring-primary/20 transition-all [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[180px]" />
    </div>
  )
}

export default function ContentPages() {
  const [pages, setPages] = useState<ContentPage[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)

  const fetchPages = async () => {
    const { data } = await supabase
      .from('content_pages')
      .select('*')
      .order('created_at', { ascending: false })
    setPages(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchPages() }, [])

  const openNew = () => {
    setEditingId(null)
    setFormData(emptyForm)
    setShowForm(true)
  }

  const openEdit = (page: ContentPage) => {
    setEditingId(page.id)
    setFormData({
      title: page.title,
      slug: page.slug,
      content: page.content,
      status: page.status,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formData.title.trim()) return
    setSaving(true)

    const slug = formData.slug || slugify(formData.title)
    const payload = {
      title: formData.title.trim(),
      slug,
      content: formData.content,
      status: formData.status,
      updated_at: new Date().toISOString(),
    }

    if (editingId) {
      await supabase.from('content_pages').update(payload).eq('id', editingId)
    } else {
      await supabase.from('content_pages').insert(payload)
    }

    setShowForm(false)
    setFormData(emptyForm)
    setEditingId(null)
    setSaving(false)
    fetchPages()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze contentpagina wilt verwijderen?')) return
    await supabase.from('content_pages').delete().eq('id', id)
    fetchPages()
  }

  const toggleStatus = async (page: ContentPage) => {
    const newStatus = page.status === 'published' ? 'draft' : 'published'
    await supabase.from('content_pages').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', page.id)
    fetchPages()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contentpagina&apos;s</h1>
          <p className="text-sm text-gray-500 mt-1">Maak pagina&apos;s met informatie die je via knoppen aan klanten kunt tonen.</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" />
          Nieuwe pagina
        </button>
      </div>

      {/* Editor modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center pt-8 sm:pt-16 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? 'Pagina bewerken' : 'Nieuwe pagina'}
              </h2>
              <button onClick={() => { setShowForm(false); setFormData(emptyForm); setEditingId(null) }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Titel</label>
                <input type="text" value={formData.title}
                  onChange={(e) => {
                    const title = e.target.value
                    setFormData(prev => ({
                      ...prev,
                      title,
                      slug: prev.slug === slugify(prev.title) || !prev.slug ? slugify(title) : prev.slug,
                    }))
                  }}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm"
                  placeholder="Bijv. Over WordPress" />
              </div>

              {/* Slug */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Slug (URL)</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">/content/</span>
                  <input type="text" value={formData.slug}
                    onChange={(e) => setFormData(prev => ({ ...prev, slug: slugify(e.target.value) }))}
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm"
                    placeholder="over-wordpress" />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setFormData(prev => ({ ...prev, status: 'draft' }))}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      formData.status === 'draft' ? 'bg-gray-200 text-gray-800' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                    }`}>
                    <EyeOff className="w-4 h-4" />
                    Concept
                  </button>
                  <button type="button" onClick={() => setFormData(prev => ({ ...prev, status: 'published' }))}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      formData.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                    }`}>
                    <Eye className="w-4 h-4" />
                    Gepubliceerd
                  </button>
                </div>
              </div>

              {/* Content editor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Inhoud</label>
                <TiptapEditor
                  key={editingId || 'new'}
                  content={formData.content}
                  onChange={(html) => setFormData(prev => ({ ...prev, content: html }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
              <button onClick={() => { setShowForm(false); setFormData(emptyForm); setEditingId(null) }}
                className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors">
                Annuleren
              </button>
              <button onClick={handleSave} disabled={!formData.title.trim() || saving}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                <Save className="w-4 h-4" />
                {saving ? 'Opslaan...' : editingId ? 'Bijwerken' : 'Aanmaken'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pages list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : pages.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Nog geen contentpagina&apos;s</h3>
          <p className="text-sm text-gray-500 mb-4">Maak je eerste pagina aan om informatie te delen met klanten.</p>
          <button onClick={openNew}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            Eerste pagina aanmaken
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {pages.map((page) => (
            <div key={page.id} className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{page.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">/content/{page.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleStatus(page)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      page.status === 'published'
                        ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                        : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                    }`}>
                    {page.status === 'published' ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    {page.status === 'published' ? 'Gepubliceerd' : 'Concept'}
                  </button>
                  <button onClick={() => openEdit(page)}
                    className="p-2 text-gray-400 hover:text-primary rounded-lg hover:bg-primary/5 transition-colors" title="Bewerken">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(page.id)}
                    className="p-2 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors" title="Verwijderen">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
