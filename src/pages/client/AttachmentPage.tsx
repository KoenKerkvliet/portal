// Leespagina voor een content-bijlage bij een offerte. De klant komt hier via de
// link op de offertepagina. Wie de offerte als PDF downloadt, krijgt dezelfde
// inhoud achter de offerte in één bestand.

import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { QuoteAttachment } from '../../types'
import { ArrowLeft, Loader2, FileText, Printer } from 'lucide-react'

export default function AttachmentPage() {
  const { attachmentId } = useParams()
  const navigate = useNavigate()
  const [attachment, setAttachment] = useState<QuoteAttachment | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      if (!attachmentId) return
      const { data } = await supabase
        .from('quote_attachments')
        .select('*')
        .eq('id', attachmentId)
        .single()
      setAttachment(data || null)
      setLoading(false)
    }
    fetch()
  }, [attachmentId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!attachment) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">Bijlage niet gevonden</p>
        <Link to="/" className="text-primary hover:underline text-sm">
          Terug naar portaal
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 print:hidden">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Afdrukken
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-primary/5 to-primary/10 px-6 sm:px-8 py-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{attachment.title}</h1>
                {attachment.description && (
                  <p className="text-sm text-gray-500 mt-0.5">{attachment.description}</p>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 sm:px-8 py-6 sm:py-8">
            <div
              className="prose-quote prose-attachment max-w-none text-sm text-gray-700"
              dangerouslySetInnerHTML={{ __html: attachment.content }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
