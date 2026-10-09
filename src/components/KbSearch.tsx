import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Loader2, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { articlePath, groupByCategory, searchArticles, type KbArticle } from '../lib/knowledgeBase'

// Zoeken in de kennisbank, met daaronder de artikelen per categorie (of de zoekresultaten).
// Gebruikt bij Support in het portaal en op de openbare pagina /kennisbank.
export default function KbSearch({ autoFocus = false, compact = false }: { autoFocus?: boolean; compact?: boolean }) {
  const [articles, setArticles] = useState<KbArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('kb_articles').select('*').eq('published', true).order('title')
      setArticles((data || []) as KbArticle[])
      setLoading(false)
    }
    load()
  }, [])

  const results = searchArticles(articles, query)
  const searching = query.trim().length > 0

  const item = (a: KbArticle) => (
    <Link key={a.id} to={articlePath(a.slug)}
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group text-left">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 group-hover:text-primary transition-colors">{a.title}</p>
        {a.summary && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.summary}</p>}
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary flex-shrink-0 transition-colors" />
    </Link>
  )

  return (
    <div>
      <div className="relative max-w-xl mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus={autoFocus}
          placeholder="Waar kan ik je mee helpen? Bijv. 'openingstijden' of 'mail instellen'"
          className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all" />
      </div>

      <div className="mt-6 text-left">
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
        ) : articles.length === 0 ? (
          <p className="text-sm text-gray-400 text-center">De kennisbank wordt binnenkort gevuld.</p>
        ) : searching ? (
          results.length === 0 ? (
            <p className="text-sm text-gray-500 text-center">Geen artikelen gevonden voor "{query}". Probeer een ander woord, of doe een aanvraag.</p>
          ) : (
            <div className="rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden bg-white">
              {(compact ? results.slice(0, 6) : results).map(item)}
            </div>
          )
        ) : (
          <div className={`grid gap-4 ${compact ? 'sm:grid-cols-2' : 'md:grid-cols-2'}`}>
            {groupByCategory(articles).map(([category, items]) => (
              <div key={category} className="rounded-xl border border-gray-100 overflow-hidden bg-white">
                <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{category}</p>
                <div className="divide-y divide-gray-100">{(compact ? items.slice(0, 4) : items).map(item)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
