import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Assignment } from '../../types'
import { ArrowLeft, Loader2, ClipboardCheck, Download } from 'lucide-react'
import DOMPurify from 'dompurify'

export default function ClientAssignmentPage() {
  const { assignmentId } = useParams()
  const navigate = useNavigate()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    const fetchAssignment = async () => {
      if (!assignmentId) return
      const { data } = await supabase
        .from('assignments')
        .select('*, project:projects(name), client:clients(name, company)')
        .eq('id', assignmentId)
        .single()
      setAssignment(data)
      setLoading(false)
    }
    fetchAssignment()
  }, [assignmentId])

  const handleDownloadPdf = async () => {
    if (!assignment) return
    setDownloading(true)

    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    const contentWidth = pageWidth - margin * 2
    let y = 25

    // Header
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(40, 40, 40)
    doc.text('DesignPixels', margin, y)
    y += 15

    // Title
    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(158, 134, 255)
    doc.text('OPDRACHT', margin, y)
    y += 10

    doc.setFontSize(14)
    doc.setTextColor(40, 40, 40)
    const titleLines = doc.splitTextToSize(assignment.title, contentWidth)
    doc.text(titleLines, margin, y)
    y += titleLines.length * 7 + 5

    // Client info
    const client = assignment.client as unknown as { name: string; company: string }
    if (client) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 100, 100)
      doc.text(`Klant: ${client.company || client.name}`, margin, y)
      y += 5
    }

    doc.text(`Datum: ${new Date(assignment.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, y)
    y += 10

    // Divider
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageWidth - margin, y)
    y += 10

    // Content — strip HTML
    if (assignment.content) {
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = assignment.content
      const plainText = tempDiv.textContent || tempDiv.innerText || ''

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      const lines = doc.splitTextToSize(plainText, contentWidth)
      for (const line of lines) {
        if (y > 275) { doc.addPage(); y = 25 }
        doc.text(line, margin, y)
        y += 5
      }
    }

    // Footer
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(180, 180, 180)
      doc.text('DesignPixels — Opdrachtomschrijving', margin, 290)
      doc.text(`Pagina ${i} van ${pageCount}`, pageWidth - margin, 290, { align: 'right' })
    }

    doc.save(`Opdracht-${assignment.title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase()}.pdf`)
    setDownloading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!assignment) {
    return (
      <div className="bg-[#f8f7fc] min-h-[calc(100vh-64px)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6">
            <ArrowLeft className="w-4 h-4" /> Terug
          </button>
          <p className="text-gray-500">Opdracht niet gevonden.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#f8f7fc] min-h-[calc(100vh-64px)]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Terug
        </button>

        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-primary/5 to-primary/10 px-6 sm:px-8 py-6 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <ClipboardCheck className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{assignment.title}</h1>
                  <p className="text-sm text-gray-500 mt-1">
                    {new Date(assignment.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <button
                onClick={handleDownloadPdf}
                disabled={downloading}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download PDF
              </button>
            </div>
          </div>

          {/* Content */}
          {assignment.content && (
            <div className="px-6 sm:px-8 py-6">
              <div
                className="prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(assignment.content) }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
