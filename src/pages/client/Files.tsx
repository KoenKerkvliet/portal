import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Form, FormSubmission, Quote, QuoteItem, InvoiceSettings } from '../../types'
import { FileText, Download, Pencil, Clock, Check, Loader2, FolderOpen, FileCheck, XCircle } from 'lucide-react'
// jsPDF loaded dynamically to keep bundle small

// Convert HTML to structured plain text for PDF
function htmlToPlainText(html: string): string {
  let text = html
  text = text.replace(/<li[^>]*>/gi, '• ')
  text = text.replace(/<\/li>/gi, '\n')
  text = text.replace(/<\/p>/gi, '\n')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/h[1-6]>/gi, '\n')
  text = text.replace(/<\/div>/gi, '\n')
  text = text.replace(/<[^>]*>/g, '')
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&euro;/g, '€').replace(/&middot;/g, '·')
  text = text.replace(/\n{3,}/g, '\n\n').trim()
  return text
}

interface FormWithSubmission {
  form: Form
  submission: FormSubmission
}

export default function ClientFiles() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<FormWithSubmission[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!profile) return

    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('profile_id', profile.id)
      .single()

    if (!client) { setLoading(false); return }

    const { data: project } = await supabase
      .from('projects')
      .select('id, name')
      .eq('client_id', client.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!project) { setLoading(false); return }

    // Fetch quotes (accepted or declined)
    const { data: quotesData } = await supabase
      .from('quotes')
      .select('*, client:clients(*), project:projects(*)')
      .eq('client_id', client.id)
      .in('status', ['accepted', 'declined'])
      .order('created_at', { ascending: false })

    if (quotesData) setQuotes(quotesData)

    // Fetch invoice settings for PDF generation
    const { data: settingsData } = await supabase
      .from('invoice_settings')
      .select('*')
      .limit(1)
      .single()

    if (settingsData) setInvoiceSettings(settingsData)

    // Fetch all submissions for this project
    const { data: submissions } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })

    if (!submissions || submissions.length === 0) {
      setLoading(false)
      return
    }

    // Fetch all related forms
    const formIds = [...new Set(submissions.map(s => s.form_id))]
    const { data: forms } = await supabase
      .from('forms')
      .select('*')
      .in('id', formIds)

    if (!forms) { setLoading(false); return }

    // Combine
    const combined: FormWithSubmission[] = submissions
      .map(sub => {
        const form = forms.find(f => f.id === sub.form_id)
        if (!form) return null
        return { form, submission: sub }
      })
      .filter(Boolean) as FormWithSubmission[]

    setItems(combined)
    setLoading(false)
  }, [profile])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const resolveFieldValue = (form: Form, fieldId: string, value: string | string[] | boolean): string => {
    // Find the field definition to resolve option labels
    for (const step of form.steps) {
      const field = step.fields.find(f => f.id === fieldId)
      if (!field) continue

      if (field.type === 'heading') return ''

      if (field.type === 'checkbox' && Array.isArray(value) && field.options) {
        return value
          .map(v => field.options?.find(o => o.id === v)?.label || v)
          .join(', ')
      }

      if (field.type === 'radio' && field.options) {
        return field.options.find(o => o.id === value)?.label || String(value)
      }

      if (field.type === 'select' && field.options) {
        return field.options.find(o => o.id === value)?.label || String(value)
      }

      if (typeof value === 'boolean') return value ? 'Ja' : 'Nee'

      return String(value || '-')
    }
    return String(value || '-')
  }

  const generatePdf = async (item: FormWithSubmission) => {
    setGeneratingPdf(item.submission.id)

    const { default: jsPDF } = await import('jspdf')
    const { form, submission } = item
    const doc = new jsPDF()

    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    const contentWidth = pageWidth - margin * 2
    let y = 25

    // Helper: check if we need a new page
    const checkPageBreak = (needed: number) => {
      if (y + needed > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage()
        y = 25
      }
    }

    // Header
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text('DesignPixels', margin, y)
    const dateStr = submission.submitted_at
      ? new Date(submission.submitted_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date(submission.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    doc.text(dateStr, pageWidth - margin, y, { align: 'right' })

    y += 12

    // Title
    doc.setFontSize(18)
    doc.setTextColor(30, 30, 30)
    doc.text(form.title, margin, y)
    y += 8

    if (form.description) {
      doc.setFontSize(10)
      doc.setTextColor(120, 120, 120)
      const descLines = doc.splitTextToSize(form.description, contentWidth)
      doc.text(descLines, margin, y)
      y += descLines.length * 5 + 4
    }

    // Divider
    doc.setDrawColor(230, 230, 230)
    doc.line(margin, y, pageWidth - margin, y)
    y += 10

    // Steps and fields
    for (const step of form.steps) {
      if (step.title) {
        checkPageBreak(15)
        doc.setFontSize(13)
        doc.setTextColor(60, 60, 60)
        doc.text(step.title, margin, y)
        y += 8
      }

      for (const field of step.fields) {
        if (field.type === 'heading') {
          checkPageBreak(12)
          doc.setFontSize(11)
          doc.setTextColor(80, 80, 80)
          doc.text(field.label, margin, y)
          y += 7
          continue
        }

        const value = submission.data[field.id]
        const displayValue = value !== undefined && value !== ''
          ? resolveFieldValue(form, field.id, value)
          : '-'

        checkPageBreak(16)

        // Label
        doc.setFontSize(9)
        doc.setTextColor(140, 140, 140)
        doc.text(field.label, margin, y)
        y += 5

        // Value
        doc.setFontSize(10)
        doc.setTextColor(40, 40, 40)
        const valueLines = doc.splitTextToSize(displayValue, contentWidth)
        doc.text(valueLines, margin, y)
        y += valueLines.length * 5 + 6
      }

      y += 4
    }

    // Footer line
    checkPageBreak(20)
    y += 5
    doc.setDrawColor(230, 230, 230)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8
    doc.setFontSize(7)
    doc.setTextColor(180, 180, 180)
    doc.text(`Gegenereerd via DesignPixels Klantportaal`, margin, y)

    // Download
    const filename = `${form.title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase()}.pdf`
    doc.save(filename)

    setGeneratingPdf(null)
  }

  const generateQuotePdf = async (quote: Quote) => {
    setGeneratingPdf(quote.id)

    const s = invoiceSettings || {
      company_name: '', address_line1: '', address_line2: '',
      postal_code: '', city: '', country: '', iban: '',
      btw_number: '', kvk_number: '', kor_enabled: false,
    } as Partial<InvoiceSettings>

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
    doc.text(s.company_name || 'DesignPixels', margin, y)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120, 120, 120)
    const companyLines = [
      s.address_line1, s.address_line2,
      `${s.postal_code || ''} ${s.city || ''}`.trim(),
      s.country,
      s.kvk_number ? `KVK: ${s.kvk_number}` : '',
      !s.kor_enabled && s.btw_number ? `BTW: ${s.btw_number}` : '',
      s.iban ? `IBAN: ${s.iban}` : '',
    ].filter((l): l is string => Boolean(l))
    companyLines.forEach((line, i) => {
      doc.text(line, pageWidth - margin, 20 + i * 4, { align: 'right' })
    })

    y += 15
    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(158, 134, 255)
    doc.text('OFFERTE', margin, y)
    y += 10

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`Offertenummer: ${quote.number}`, margin, y); y += 5
    doc.text(`Datum: ${new Date(quote.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, y); y += 5
    doc.text(`Geldig tot: ${new Date(quote.valid_until).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, y); y += 5

    const client = quote.client as unknown as { name: string; company: string; email: string }
    if (client) {
      doc.text(`Aan: ${client.company || client.name}`, margin, y); y += 5
      if (client.company && client.name) { doc.text(`t.a.v. ${client.name}`, margin, y); y += 5 }
    }
    y += 8

    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8

    // Items header
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(120, 120, 120)
    doc.text('OMSCHRIJVING', margin, y)
    doc.text('AANTAL', pageWidth - margin - 70, y, { align: 'right' })
    doc.text('PRIJS', pageWidth - margin - 35, y, { align: 'right' })
    doc.text('TOTAAL', pageWidth - margin, y, { align: 'right' })
    y += 3
    doc.setDrawColor(230, 230, 230)
    doc.line(margin, y, pageWidth - margin, y)
    y += 5

    const items = (quote.items || []) as QuoteItem[]
    items.forEach((item) => {
      if (y > 270) { doc.addPage(); y = 25 }
      if (item.type === 'divider') {
        doc.setDrawColor(230, 230, 230)
        doc.line(margin, y, pageWidth - margin, y)
        y += 6
      } else if (item.type === 'title') {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(40, 40, 40)
        doc.text(item.title || '', margin, y)
        y += 7
      } else if (item.type === 'product') {
        const lineTotal = (item.quantity || 0) * (item.price || 0)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(40, 40, 40)
        doc.text(item.name || '', margin, y)
        doc.setFont('helvetica', 'normal')
        doc.text(`${item.quantity} ${item.unit}`, pageWidth - margin - 70, y, { align: 'right' })
        doc.text(`\u20AC ${(item.price || 0).toFixed(2)}`, pageWidth - margin - 35, y, { align: 'right' })
        doc.setFont('helvetica', 'bold')
        doc.text(`\u20AC ${lineTotal.toFixed(2)}`, pageWidth - margin, y, { align: 'right' })
        y += 5

        if (item.description) {
          const plainDesc = htmlToPlainText(item.description)
          if (plainDesc) {
            doc.setFontSize(7.5)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(120, 120, 120)
            const paragraphs = plainDesc.split('\n')
            for (const para of paragraphs) {
              if (!para.trim()) { y += 1.5; continue }
              const wrapped = doc.splitTextToSize(para, contentWidth - 80)
              for (const wline of wrapped) {
                if (y > 270) { doc.addPage(); y = 25 }
                doc.text(wline, margin, y)
                y += 3
              }
            }
          }
        }

        if (item.is_recurring) {
          doc.setFontSize(7)
          doc.setTextColor(59, 130, 246)
          doc.text('Jaarlijks terugkerend', margin, y)
          y += 4
        }
        y += 3
      }
    })

    y += 3
    doc.setDrawColor(220, 220, 220)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8

    // Totals
    const subtotal = items.filter(i => i.type === 'product').reduce((sum, i) => sum + (i.quantity || 0) * (i.price || 0), 0)
    const discountAmount = subtotal * ((quote.discount_percent || 0) / 100)
    const afterDiscount = subtotal - discountAmount
    const btwAmount = afterDiscount * ((quote.btw_percent || 0) / 100)
    const total = afterDiscount + btwAmount

    const totalsX = pageWidth - margin - 60
    const valuesX = pageWidth - margin

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('Subtotaal:', totalsX, y, { align: 'right' })
    doc.setTextColor(40, 40, 40)
    doc.text(`\u20AC ${subtotal.toFixed(2)}`, valuesX, y, { align: 'right' })
    y += 6

    if (quote.discount_percent > 0) {
      doc.setTextColor(100, 100, 100)
      doc.text(`Korting (${quote.discount_percent}%):`, totalsX, y, { align: 'right' })
      doc.setTextColor(220, 38, 38)
      doc.text(`- \u20AC ${discountAmount.toFixed(2)}`, valuesX, y, { align: 'right' })
      y += 6
    }

    if (!s.kor_enabled && quote.btw_percent > 0) {
      doc.setTextColor(100, 100, 100)
      doc.text(`BTW (${quote.btw_percent}%):`, totalsX, y, { align: 'right' })
      doc.setTextColor(40, 40, 40)
      doc.text(`\u20AC ${btwAmount.toFixed(2)}`, valuesX, y, { align: 'right' })
      y += 6
    }

    doc.setDrawColor(158, 134, 255)
    doc.setLineWidth(0.5)
    doc.line(totalsX - 20, y, pageWidth - margin, y)
    y += 6

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 100, 100)
    doc.text('Totaal:', totalsX, y, { align: 'right' })
    doc.setTextColor(158, 134, 255)
    doc.text(`\u20AC ${total.toFixed(2)}`, valuesX, y, { align: 'right' })

    // Acceptance info
    if (quote.status === 'accepted' && quote.accepted_at) {
      y += 15
      if (y > 250) { doc.addPage(); y = 25 }

      doc.setDrawColor(22, 163, 74)
      doc.setLineWidth(0.3)
      doc.line(margin, y, pageWidth - margin, y)
      y += 8

      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(22, 163, 74)
      doc.text('GEACCEPTEERD', margin, y)
      y += 6

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 80, 80)
      if (quote.accepted_name) {
        doc.text(`Naam: ${quote.accepted_name}`, margin, y); y += 5
      }
      doc.text(`Datum: ${new Date(quote.accepted_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, y); y += 5

      if (quote.accepted_remarks) {
        doc.text(`Opmerking: ${quote.accepted_remarks}`, margin, y); y += 5
      }

      if (quote.accepted_signature) {
        y += 3
        try {
          doc.addImage(quote.accepted_signature, 'PNG', margin, y, 60, 20)
          y += 24
        } catch {
          // signature image failed, skip
        }
      }
    }

    // Notes
    if (quote.notes) {
      y += 10
      if (y > 260) { doc.addPage(); y = 25 }
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(100, 100, 100)
      doc.text('Opmerkingen:', margin, y)
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 80, 80)
      const noteLines = doc.splitTextToSize(quote.notes, contentWidth)
      doc.text(noteLines, margin, y)
    }

    if (s.kor_enabled) {
      y += 12
      if (y > 270) { doc.addPage(); y = 25 }
      doc.setFontSize(7)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(140, 140, 140)
      doc.text('Op grond van de Kleineondernemersregeling (KOR) is er geen BTW verschuldigd.', margin, y)
    }

    // Footer
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(180, 180, 180)
      doc.text(`${s.company_name || 'DesignPixels'} — Offerte ${quote.number}`, margin, 290)
      doc.text(`Pagina ${i} van ${pageCount}`, pageWidth - margin, 290, { align: 'right' })
    }

    doc.save(`Offerte-${quote.number}.pdf`)
    setGeneratingPdf(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="bg-[#f8f7fc] min-h-[calc(100vh-64px)]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Mijn bestanden</h1>
        <p className="text-sm text-gray-500 mb-8">Hier vind je al je ingevulde formulieren terug. Je kunt ze downloaden als PDF of bewerken.</p>

        {/* Forms section */}
        <div className="mb-10">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Formulieren</h2>

          {items.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="w-7 h-7 text-gray-300" />
              </div>
              <p className="text-sm text-gray-500 mb-1">Nog geen formulieren ingevuld</p>
              <p className="text-xs text-gray-400">Ingevulde formulieren verschijnen hier automatisch.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map(({ form, submission }) => {
                const isSubmitted = !!submission.submitted_at
                const date = submission.submitted_at || submission.created_at
                const formattedDate = new Date(date).toLocaleDateString('nl-NL', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })

                return (
                  <div
                    key={submission.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">{form.title}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          {/* Status */}
                          {isSubmitted ? (
                            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                              <Check className="w-3 h-3" />
                              Verzonden
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-amber-500 font-medium">
                              <Clock className="w-3 h-3" />
                              Concept
                            </span>
                          )}
                          <span className="text-xs text-gray-400">{formattedDate}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => navigate(`/formulier/${form.id}`)}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Bewerken"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Bewerken</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => generatePdf({ form, submission })}
                          disabled={generatingPdf === submission.id}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-50"
                          title="Download PDF"
                        >
                          {generatingPdf === submission.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline">PDF</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Offertes section */}
        {quotes.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Offertes</h2>
            <div className="space-y-3">
              {quotes.map((quote) => {
                const isAccepted = quote.status === 'accepted'
                const date = isAccepted ? quote.accepted_at : quote.declined_at
                const formattedDate = date
                  ? new Date(date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
                  : new Date(quote.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

                return (
                  <div
                    key={quote.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${isAccepted ? 'bg-green-50' : 'bg-red-50'}`}>
                        {isAccepted ? (
                          <FileCheck className="w-5 h-5 text-green-600" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">Offerte {quote.number}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          {isAccepted ? (
                            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                              <Check className="w-3 h-3" />
                              Geaccepteerd
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                              <XCircle className="w-3 h-3" />
                              Afgekeurd
                            </span>
                          )}
                          <span className="text-xs text-gray-400">{formattedDate}</span>
                          <span className="text-xs text-gray-400">€ {Number(quote.amount).toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => navigate(`/offerte/${quote.id}`)}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Bekijken"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Bekijken</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => generateQuotePdf(quote)}
                          disabled={generatingPdf === quote.id}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-50"
                          title="Download PDF"
                        >
                          {generatingPdf === quote.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline">PDF</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
