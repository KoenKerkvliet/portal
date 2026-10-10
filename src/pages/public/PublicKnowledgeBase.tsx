import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { BookOpenText, ChevronRight, LifeBuoy, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import KbSearch from '../../components/KbSearch'
import AbsenceBanner from '../../components/AbsenceBanner'
import { articlePath, categoryPath, categorySlug, KB_CATEGORIES, type KbArticle } from '../../lib/knowledgeBase'
import KbCategoryIcon from '../../components/KbCategoryIcon'
import { trackArticleView } from '../../lib/tracking'

// Openbare kennisbank, zonder inloggen: /kennisbank (zoeken + categorieën),
// /kennisbank/categorie/:category (artikelen van één categorie) en /kennisbank/:slug
// (één artikel). De links kun je in mails aan klanten zetten.
export default function PublicKnowledgeBase() {
  const { slug, category } = useParams<{ slug?: string; category?: string }>()

  // Niet in zoekmachines: de kennisbank is voor klanten
  useEffect(() => {
    const tag = document.createElement('meta')
    tag.name = 'robots'
    tag.content = 'noindex, nofollow'
    document.head.appendChild(tag)
    return () => tag.remove()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
          <Link to="/kennisbank" className="text-lg font-bold tracking-tight">
            <span className="text-primary">Design</span>
            <span className="text-gray-900">Pixels</span>
            <span className="ml-2 text-sm font-medium text-gray-400">Kennisbank</span>
          </Link>
          <Link to="/" className="text-sm font-medium text-gray-500 hover:text-primary transition-colors">Naar het portaal</Link>
        </div>
      </header>
      <AbsenceBanner />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {category ? <Category key={category} slug={category} /> : slug ? <Article key={slug} slug={slug} /> : <Index />}
      </main>
    </div>
  )
}

function Index() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <BookOpenText className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Kennisbank</h1>
        <p className="text-gray-500 mt-2">Antwoorden op veelgestelde vragen en uitleg over je website.</p>
      </div>
      <KbSearch autoFocus />
    </div>
  )
}

// Kruimelpad: Kennisbank › Categorie (› artikel)
function Breadcrumb({ category }: { category?: string }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-gray-500 flex-wrap" aria-label="Kruimelpad">
      <Link to="/kennisbank" className="font-medium hover:text-primary transition-colors">Kennisbank</Link>
      {category && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <Link to={categoryPath(category)} className="font-medium hover:text-primary transition-colors">{category}</Link>
        </>
      )}
    </nav>
  )
}

function Category({ slug }: { slug: string }) {
  const [articles, setArticles] = useState<KbArticle[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('kb_articles').select('*').eq('published', true).order('title')
      const inCategory = ((data || []) as KbArticle[]).filter(a => categorySlug(a.category || 'Algemeen') === slug)
      setArticles(inCategory)
      setName(inCategory[0]?.category || '')
      if (inCategory[0]) document.title = `${inCategory[0].category} · DesignPixels Kennisbank`
      setLoading(false)
    }
    load()
  }, [slug])

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>

  if (articles.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-lg font-medium text-gray-900">Categorie niet gevonden</h1>
        <p className="mt-2 text-sm text-gray-500">Deze categorie bestaat niet (meer). Zoek hieronder verder.</p>
        <div className="mt-8"><KbSearch /></div>
      </div>
    )
  }

  const description = KB_CATEGORIES.find(c => c.name === name)?.description

  return (
    <div className="space-y-6">
      <Breadcrumb />
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <KbCategoryIcon category={name} className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{name}</h1>
          <p className="text-gray-500 mt-1">
            {description ? `${description} · ` : ''}{articles.length} {articles.length === 1 ? 'artikel' : 'artikelen'}
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map(a => (
          <Link key={a.id} to={articlePath(a.slug)}
            className="group flex flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all">
            <h2 className="font-semibold text-gray-900 group-hover:text-primary transition-colors leading-snug">{a.title}</h2>
            {a.summary && <p className="text-sm text-gray-500 mt-2 leading-snug flex-1">{a.summary}</p>}
            <span className="inline-flex items-center gap-1 mt-4 text-sm font-medium text-primary">
              Lees het artikel
              <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function Article({ slug }: { slug: string }) {
  const [article, setArticle] = useState<KbArticle | null>(null)
  const [related, setRelated] = useState<KbArticle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('kb_articles').select('*').eq('slug', slug).eq('published', true).maybeSingle()
      setArticle(data as KbArticle | null)
      if (data) {
        document.title = `${data.title} · DesignPixels Kennisbank`
        trackArticleView(slug)
        const { data: others } = await supabase.from('kb_articles').select('*')
          .eq('published', true).eq('category', data.category).neq('id', data.id).order('title').limit(5)
        setRelated((others || []) as KbArticle[])
      }
      setLoading(false)
    }
    load()
  }, [slug])

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>

  if (!article) {
    return (
      <div className="text-center py-12">
        <h1 className="text-lg font-medium text-gray-900">Artikel niet gevonden</h1>
        <p className="mt-2 text-sm text-gray-500">Dit artikel bestaat niet (meer). Zoek hieronder verder.</p>
        <div className="mt-8"><KbSearch /></div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Breadcrumb category={article.category} />

      <article className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-10">
        <p className="text-xs font-semibold text-primary uppercase tracking-wider">{article.category}</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">{article.title}</h1>
        {article.summary && <p className="mt-3 text-gray-500">{article.summary}</p>}
        <div className="mt-6 prose-kb" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.content) }} />
        <p className="mt-8 text-xs text-gray-400">
          Bijgewerkt op {new Date(article.updated_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </article>

      <div className="flex items-start gap-3 bg-primary/5 border border-primary/10 rounded-2xl p-5">
        <LifeBuoy className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-sm text-gray-700">
          <p className="font-semibold text-gray-900">Kom je er niet uit?</p>
          <p className="mt-0.5">Doe een aanvraag via Support in je portaal of mail me gerust. Ik help je graag verder.</p>
          <Link to="/support" className="inline-block mt-2 font-medium text-primary hover:text-primary-600">Naar Support</Link>
        </div>
      </div>

      {related.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Meer over {article.category}</h2>
            <Link to={categoryPath(article.category)} className="text-xs font-medium text-primary hover:text-primary-600">Alle artikelen</Link>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
            {related.map(r => (
              <Link key={r.id} to={articlePath(r.slug)} className="block px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50 hover:text-primary transition-colors">
                {r.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
