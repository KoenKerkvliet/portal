import { useCallback, useEffect, useState } from 'react'
import { BookOpenText, Check, Copy, ExternalLink, Eye, EyeOff, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import RichTextEditor from '../../components/RichTextEditor'
import { KB_PUBLIC_URL, articlePath, groupByCategory, searchArticles, slugify, type KbArticle } from '../../lib/knowledgeBase'

const emptyForm = { title: '', slug: '', category: '', summary: '', content: '', published: false }

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })

// Kennisbank beheren: artikelen schrijven, publiceren en de link kopiëren voor in een mail
export default function KnowledgeBase() {
  const [articles, setArticles] = useState<KbArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<KbArticle | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  // Slug volgt de titel tot je hem zelf aanpast (of het artikel al bestaat)
  const [slugTouched, setSlugTouched] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('kb_articles').select('*').order('category').order('title')
    setArticles((data || []) as KbArticle[])
    setLoading(false)
  }, [])

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load])

  const categories = [...new Set(articles.map(a => a.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl'))

  const openNew = () => {
    setEditing(null)
    setForm(emptyForm)
    setSlugTouched(false)
    setError('')
    setFormKey(k => k + 1)
    setShowForm(true)
  }

  const openEdit = (a: KbArticle) => {
    setEditing(a)
    setForm({ title: a.title, slug: a.slug, category: a.category, summary: a.summary, content: a.content, published: a.published })
    setSlugTouched(true)
    setError('')
    setFormKey(k => k + 1)
    setShowForm(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const slug = slugify(form.slug || form.title)
    if (!form.title.trim() || !slug) return
    setSaving(true)
    setError('')
    const payload = {
      title: form.title.trim(),
      slug,
      category: form.category.trim() || 'Algemeen',
      summary: form.summary.trim(),
      content: form.content,
      published: form.published,
      updated_at: new Date().toISOString(),
    }
    const { error: err } = editing
      ? await supabase.from('kb_articles').update(payload).eq('id', editing.id)
      : await supabase.from('kb_articles').insert(payload)
    setSaving(false)
    if (err) {
      setError(err.code === '23505' ? 'Er is al een artikel met deze link. Kies een andere.' : `Opslaan mislukt: ${err.message}`)
      return
    }
    setShowForm(false)
    await load()
  }

  const togglePublished = async (a: KbArticle) => {
    await supabase.from('kb_articles').update({ published: !a.published, updated_at: new Date().toISOString() }).eq('id', a.id)
    await load()
  }

  const remove = async (a: KbArticle) => {
    if (!confirm(`Artikel "${a.title}" verwijderen?\n\nLinks naar dit artikel in eerder verstuurde mails werken daarna niet meer.`)) return
    await supabase.from('kb_articles').delete().eq('id', a.id)
    await load()
  }

  const copyLink = async (a: KbArticle) => {
    try {
      await navigator.clipboard.writeText(`${KB_PUBLIC_URL}/${a.slug}`)
      setCopiedId(a.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      prompt('Kopieer de link:', `${KB_PUBLIC_URL}/${a.slug}`)
    }
  }

  const visible = searchArticles(articles, search)
  const inputClass = 'w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all'

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kennisbank</h1>
          <p className="text-gray-500 mt-1">Artikelen die klanten bij Support kunnen zoeken. Elk gepubliceerd artikel heeft een eigen link die zonder inloggen werkt, handig in een mail.</p>
        </div>
        <button onClick={openNew}
          className="flex-shrink-0 flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors">
          <Plus className="w-4 h-4" />
          Nieuw artikel
        </button>
      </div>

      {showForm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[5vh] overflow-y-auto pointer-events-none">
            <form onSubmit={save} className="pointer-events-auto bg-white rounded-2xl shadow-xl w-full max-w-3xl">
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Artikel bewerken' : 'Nieuw artikel'}</h2>
                <button type="button" onClick={() => setShowForm(false)} aria-label="Sluiten" className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
                  <input type="text" required value={form.title} className={inputClass} placeholder="bijv. Openingstijden aanpassen op je website"
                    onChange={(e) => setForm(f => ({ ...f, title: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) }))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Categorie</label>
                    <input type="text" list="kb-categories" value={form.category} className={inputClass} placeholder="bijv. Je website bewerken"
                      onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} />
                    <datalist id="kb-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Link</label>
                    <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary">
                      <span className="pl-3 text-xs text-gray-400 whitespace-nowrap">/kennisbank/</span>
                      <input type="text" value={form.slug} className="w-full min-w-0 pr-3 py-2.5 bg-transparent text-sm focus:outline-none"
                        onChange={(e) => { setSlugTouched(true); setForm(f => ({ ...f, slug: e.target.value })) }}
                        onBlur={() => setForm(f => ({ ...f, slug: slugify(f.slug || f.title) }))} />
                    </div>
                    {editing && form.slug !== editing.slug && (
                      <p className="mt-1 text-[11px] text-amber-600">Let op: links naar de oude link in eerder verstuurde mails werken dan niet meer.</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Korte samenvatting</label>
                  <input type="text" value={form.summary} className={inputClass} maxLength={200}
                    placeholder="Eén zin die in de zoekresultaten staat"
                    onChange={(e) => setForm(f => ({ ...f, summary: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Artikel</label>
                  <RichTextEditor key={formKey} value={form.content}
                    onChange={(html) => setForm(f => ({ ...f, content: html }))}
                    placeholder="Leg stap voor stap uit hoe het werkt. Gebruik kopjes en opsommingen voor overzicht." />
                </div>
                <label className="flex items-center gap-2 cursor-pointer w-fit">
                  <input type="checkbox" checked={form.published} onChange={(e) => setForm(f => ({ ...f, published: e.target.checked }))}
                    className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/30" />
                  <span className="text-sm text-gray-700">Gepubliceerd (zichtbaar voor klanten en via de link)</span>
                </label>
                {error && <p className="text-sm text-red-600">{error}</p>}
              </div>
              <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors">
                  Annuleren
                </button>
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-50">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editing ? 'Opslaan' : 'Aanmaken'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {!loading && articles.length > 0 && (
        <div className="relative mb-5">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Zoek in je artikelen..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all" />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
      ) : articles.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 shadow-sm border border-gray-100 text-center">
          <BookOpenText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nog geen artikelen</h3>
          <p className="text-gray-500 mt-1">Schrijf je eerste artikel. Tip: bij Chatgesprekken zie je welke vragen klanten stellen.</p>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Geen artikelen gevonden.</p>
      ) : (
        <div className="space-y-6">
          {groupByCategory(visible).map(([category, items]) => (
            <div key={category}>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">{category}</h2>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100">
                {items.map(a => (
                  <div key={a.id} className="flex items-center gap-3 px-5 py-3.5 group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">{a.title}</h3>
                        <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${a.published ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {a.published ? 'Gepubliceerd' : 'Concept'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {a.summary || 'Geen samenvatting'} · bijgewerkt {formatDate(a.updated_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {a.published && (
                        <>
                          <button type="button" onClick={() => copyLink(a)} title="Link kopiëren voor in een mail"
                            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-primary rounded-lg hover:bg-primary/5 transition-colors">
                            {copiedId === a.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedId === a.id ? 'Gekopieerd' : 'Link'}
                          </button>
                          <a href={articlePath(a.slug)} target="_blank" rel="noopener noreferrer" title="Bekijken"
                            className="p-1.5 text-gray-400 hover:text-primary rounded-lg hover:bg-primary/5 transition-colors">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </>
                      )}
                      <button type="button" onClick={() => togglePublished(a)} title={a.published ? 'Terugzetten naar concept' : 'Publiceren'}
                        className="p-1.5 text-gray-400 hover:text-primary rounded-lg hover:bg-primary/5 transition-colors">
                        {a.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button type="button" onClick={() => openEdit(a)} title="Bewerken"
                        className="p-1.5 text-gray-400 hover:text-primary rounded-lg hover:bg-primary/5 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => remove(a)} title="Verwijderen"
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
