import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Form, FormSubmission, Quote, Invoice } from '../../types'
import { FileText, Download, Pencil, Clock, Check, Loader2, FolderOpen, FileCheck, XCircle, Palette, Home, Phone, Receipt } from 'lucide-react'
// jsPDF loaded dynamically to keep bundle small

interface FormWithSubmission {
  form: Form
  submission: FormSubmission
}

export default function ClientFiles() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<FormWithSubmission[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null)
  const [designFiles, setDesignFiles] = useState<{ key: string; label: string; url: string; icon: typeof Palette }[]>([])

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

    // Fetch invoices: alle niet-draft + niet-TMP (definitieve nummers).
    // Klant ziet zo z'n verzonden + betaalde facturen, geen werkende concepten.
    const { data: invoicesData } = await supabase
      .from('invoices')
      .select('*')
      .eq('client_id', client.id)
      .neq('status', 'draft')
      .eq('has_temp_number', false)
      .order('invoice_date', { ascending: false })

    if (invoicesData) setInvoices(invoicesData)

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

    // Fetch approved design files
    const { data: designPhase } = await supabase
      .from('project_phases')
      .select('custom_data')
      .eq('project_id', project.id)
      .eq('phase', 'design')
      .single()

    if (designPhase?.custom_data) {
      const cd = designPhase.custom_data as Record<string, unknown>
      const approvals = (cd.design_approvals || {}) as Record<string, { status?: string }>
      const files: { key: string; label: string; url: string; icon: typeof Palette }[] = []
      const designFields = [
        { key: 'styleguide', field: 'design_image_styleguide', label: 'Styleguide', icon: Palette },
        { key: 'homepage', field: 'design_image_homepage', label: 'Homepage', icon: Home },
        { key: 'contactpage', field: 'design_image_tweede', label: 'Contactpagina', icon: Phone },
      ]
      for (const df of designFields) {
        const url = cd[df.field] as string
        if (url && approvals[df.key]?.status === 'accepted') {
          files.push({ key: df.key, label: df.label, url, icon: df.icon })
        }
      }
      setDesignFiles(files)
    }

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
        <p className="text-sm text-gray-500 mb-8">Hier vind je al je bestanden terug.</p>

        {/* Design files section */}
        {designFiles.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Design bestanden</h2>
            <div className="space-y-3">
              {designFiles.map((file) => {
                const IconComp = file.icon
                return (
                  <div key={file.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                        <IconComp className="w-5 h-5 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900">{file.label}</h3>
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium mt-0.5">
                          <Check className="w-3 h-3" />
                          Goedgekeurd
                        </span>
                      </div>
                      <a
                        href={file.url}
                        download={`${file.label.toLowerCase()}-design.jpg`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary hover:bg-primary-600 rounded-lg transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Download</span>
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

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
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Facturen section */}
        {invoices.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Facturen</h2>
            <div className="space-y-3">
              {invoices.map((invoice) => {
                const isPaid = invoice.status === 'paid'
                const date = invoice.invoice_date || invoice.created_at
                const formattedDate = date
                  ? new Date(date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
                  : ''
                const labelExtra = invoice.is_deposit_invoice
                  ? `Aanbetaling ${invoice.deposit_percentage || ''}%`
                  : invoice.is_remainder_invoice
                  ? `Restant ${invoice.deposit_percentage ? 100 - invoice.deposit_percentage : ''}%`
                  : null

                return (
                  <div
                    key={invoice.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${isPaid ? 'bg-green-50' : 'bg-blue-50'}`}>
                        <Receipt className={`w-5 h-5 ${isPaid ? 'text-green-600' : 'text-blue-600'}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">Factuur {invoice.number}</h3>
                          {labelExtra && (
                            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                              {labelExtra}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {isPaid ? (
                            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                              <Check className="w-3 h-3" />
                              Betaald
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                              <Clock className="w-3 h-3" />
                              Verzonden
                            </span>
                          )}
                          {formattedDate && <span className="text-xs text-gray-400">{formattedDate}</span>}
                          <span className="text-xs text-gray-400">€ {Number(invoice.amount).toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => navigate(`/factuur/${invoice.id}`)}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Bekijken"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Bekijken</span>
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
