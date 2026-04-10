import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Invoice, InvoiceSettings } from '../../types'
import { ArrowLeft, Download, Loader2, FileText, Calendar, Hash, Building2 } from 'lucide-react'

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: 'Concept', color: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Verzonden', color: 'bg-blue-100 text-blue-700' },
  paid: { label: 'Betaald', color: 'bg-green-100 text-green-700' },
}

export default function InvoicePage() {
  const { invoiceId } = useParams()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [settings, setSettings] = useState<InvoiceSettings | null>(null)
  const [projectName, setProjectName] = useState('')
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      if (!invoiceId) return

      const [invoiceRes, settingsRes] = await Promise.all([
        supabase.from('invoices').select('*, project:projects(name), client:clients(name, company, email)').eq('id', invoiceId).single(),
        supabase.from('invoice_settings').select('*').limit(1).single(),
      ])

      if (invoiceRes.data) {
        setInvoice(invoiceRes.data)
        setProjectName((invoiceRes.data.project as unknown as { name: string })?.name || '')
        const client = invoiceRes.data.client as unknown as { name: string; company: string; email: string }
        setClientName(client?.name || '')
      }
      if (settingsRes.data) setSettings(settingsRes.data)
      setLoading(false)
    }
    fetch()
  }, [invoiceId])

  const handleDownloadPdf = async () => {
    if (!invoice) return
    setDownloading(true)

    const s = settings || {
      company_name: '', address_line1: '', address_line2: '',
      postal_code: '', city: '', country: '', iban: '',
      btw_number: '', kvk_number: '', kor_enabled: false,
    } as Partial<InvoiceSettings>

    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    let y = 25

    // Header - company name
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(40, 40, 40)
    doc.text(s.company_name || 'DesignPixels', margin, y)

    // Company details right-aligned
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120, 120, 120)
    const companyLines = [
      s.address_line1,
      s.address_line2,
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

    // Factuur label
    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(158, 134, 255)
    doc.text('FACTUUR', margin, y)

    y += 12

    // Invoice details
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    doc.text(`Factuurnummer: ${invoice.number}`, margin, y)
    y += 5
    doc.text(`Datum: ${new Date(invoice.created_at).toLocaleDateString('nl-NL')}`, margin, y)
    y += 5
    if (invoice.due_date) {
      doc.text(`Vervaldatum: ${new Date(invoice.due_date).toLocaleDateString('nl-NL')}`, margin, y)
      y += 5
    }
    if (projectName) {
      doc.text(`Project: ${projectName}`, margin, y)
      y += 5
    }

    y += 8

    // Client info
    if (clientName) {
      doc.setFont('helvetica', 'bold')
      doc.text('Aan:', margin, y)
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.text(clientName, margin, y)
      y += 10
    }

    // Amount
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(40, 40, 40)
    doc.text(`Totaal: €${invoice.amount.toFixed(2)}`, margin, y)

    y += 10

    // Status
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    const statusInfo = statusLabels[invoice.status] || { label: invoice.status }
    doc.text(`Status: ${statusInfo.label}`, margin, y)

    // IBAN info at bottom
    if (s.iban) {
      y += 20
      doc.setFontSize(9)
      doc.setTextColor(80, 80, 80)
      doc.text(`Gelieve het bedrag over te maken naar: ${s.iban}`, margin, y)
      y += 5
      doc.text(`o.v.v. factuurnummer ${invoice.number}`, margin, y)
    }

    doc.save(`Factuur-${invoice.number}.pdf`)
    setDownloading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">Factuur niet gevonden</p>
        <Link to="/" className="text-primary hover:underline text-sm">Terug naar portaal</Link>
      </div>
    )
  }

  const status = statusLabels[invoice.status] || { label: invoice.status, color: 'bg-gray-100 text-gray-600' }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Terug naar portaal
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary/5 to-primary/10 px-6 sm:px-8 py-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Factuur {invoice.number}</h1>
                  {projectName && <p className="text-sm text-gray-500">{projectName}</p>}
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${status.color}`}>
                {status.label}
              </span>
            </div>
          </div>

          {/* Details */}
          <div className="px-6 sm:px-8 py-6 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="flex items-start gap-2">
                <Hash className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Nummer</p>
                  <p className="text-sm text-gray-700">{invoice.number}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Datum</p>
                  <p className="text-sm text-gray-700">{new Date(invoice.created_at).toLocaleDateString('nl-NL')}</p>
                </div>
              </div>
              {invoice.due_date && (
                <div className="flex items-start gap-2">
                  <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Vervaldatum</p>
                    <p className="text-sm text-gray-700">{new Date(invoice.due_date).toLocaleDateString('nl-NL')}</p>
                  </div>
                </div>
              )}
              {clientName && (
                <div className="flex items-start gap-2">
                  <Building2 className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Klant</p>
                    <p className="text-sm text-gray-700">{clientName}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Amount */}
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500">Totaalbedrag</span>
                <span className="text-2xl font-bold text-gray-900">€{invoice.amount.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment info */}
            {settings?.iban && invoice.status !== 'paid' && (
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <p className="text-sm text-blue-700">
                  Gelieve het bedrag over te maken naar <span className="font-semibold">{settings.iban}</span> o.v.v. factuurnummer <span className="font-semibold">{invoice.number}</span>.
                </p>
              </div>
            )}

            {/* Download button */}
            <div className="flex justify-center pt-2">
              <button
                onClick={handleDownloadPdf}
                disabled={downloading}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
