import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Form, FormSubmission } from '../../types'
import { FileText, Download, Pencil, Clock, Check, Loader2, FolderOpen } from 'lucide-react'
// jsPDF loaded dynamically to keep bundle small

interface FormWithSubmission {
  form: Form
  submission: FormSubmission
}

export default function ClientFiles() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<FormWithSubmission[]>([])
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

        {/* Future sections placeholder */}
        {/*
        <div className="mb-10">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Offertes</h2>
          ...
        </div>
        <div className="mb-10">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Facturen</h2>
          ...
        </div>
        */}
      </div>
    </div>
  )
}
