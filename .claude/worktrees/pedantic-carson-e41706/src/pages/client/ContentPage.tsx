import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Loader2, FileText } from 'lucide-react'

interface ContentPageData {
  id: string
  title: string
  content: string
}

export default function ContentPage() {
  const { slug } = useParams()
  const [page, setPage] = useState<ContentPageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      if (!slug) return
      const { data } = await supabase
        .from('content_pages')
        .select('id, title, content')
        .eq('slug', slug)
        .eq('status', 'published')
        .single()
      setPage(data || null)
      setLoading(false)
    }
    fetch()
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!page) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">Pagina niet gevonden</p>
        <Link to="/" className="text-primary hover:underline text-sm">Terug naar portaal</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Terug naar portaal
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary/5 to-primary/10 px-6 sm:px-8 py-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">{page.title}</h1>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 sm:px-8 py-6 sm:py-8">
            <div
              className="prose prose-sm sm:prose max-w-none prose-headings:text-gray-900 prose-p:text-gray-600 prose-a:text-primary prose-strong:text-gray-800 prose-li:text-gray-600"
              dangerouslySetInnerHTML={{ __html: page.content }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
