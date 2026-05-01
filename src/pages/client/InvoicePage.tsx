import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Invoice, InvoiceSettings, QuoteItem } from '../../types'
import { ArrowLeft, Download, Loader2, FileText, Calendar, Hash, Building2 } from 'lucide-react'

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: 'Concept', color: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Verzonden', color: 'bg-blue-100 text-blue-700' },
  paid: { label: 'Betaald', color: 'bg-green-100 text-green-700' },
}

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

export default function InvoicePage() {
  const { invoiceId } = useParams()
  const navigate = useNavigate()
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
        setClientName(invoiceRes.data.client_name || client?.name || '')
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
    const contentWidth = pageWidth - margin * 2
    let y = 25

    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(40, 40, 40)
    doc.text(s.company_name || 'DesignPixels', margin, y)

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

    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(158, 134, 255)
    doc.text('FACTUUR', margin, y)
    y += 10

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`Factuurnummer: ${invoice.number}`, margin, y)
    y += 5
    const invoiceDate = invoice.invoice_date || invoice.created_at
    doc.text(`Datum: ${new Date(invoiceDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, y)
    y += 5
    if (invoice.due_date) {
      doc.text(`Vervaldatum: ${new Date(invoice.due_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, y)
      y += 5
    }

    if (invoice.client_name || clientName) {
      doc.text(`Aan: ${invoice.client_name || clientName}`, margin, y)
      y += 5
    }
    if (invoice.client_address) {
      const addrLines = invoice.client_address.split('\n')
      addrLines.forEach((line) => {
        doc.text(line, margin, y)
        y += 5
      })
    }

    y += 5
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8

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

    const items = (invoice.items || []) as QuoteItem[]
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
        doc.text(`€ ${(item.price || 0).toFixed(2)}`, pageWidth - margin - 35, y, { align: 'right' })
        doc.setFont('helvetica', 'bold')
        doc.text(`€ ${lineTotal.toFixed(2)}`, pageWidth - margin, y, { align: 'right' })
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

    const subtotal = items.filter(i => i.type === 'product').reduce((s, i) => s + (i.quantity || 0) * (i.price || 0), 0)
    const discountAmount = subtotal * ((invoice.discount_percent || 0) / 100)
    const afterDiscount = subtotal - discountAmount
    const btwAmount = afterDiscount * ((invoice.btw_percent || 0) / 100)
    const total = afterDiscount + btwAmount

    const totalsX = pageWidth - margin - 60
    const valuesX = pageWidth - margin

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('Subtotaal:', totalsX, y, { align: 'right' })
    doc.setTextColor(40, 40, 40)
    doc.text(`€ ${subtotal.toFixed(2)}`, valuesX, y, { align: 'right' })
    y += 6

    if (invoice.discount_percent > 0) {
      doc.setTextColor(100, 100, 100)
      doc.text(`Korting (${invoice.discount_percent}%):`, totalsX, y, { align: 'right' })
      doc.setTextColor(220, 38, 38)
      doc.text(`- € ${discountAmount.toFixed(2)}`, valuesX, y, { align: 'right' })
      y += 6
    }

    if (!s.kor_enabled && invoice.btw_percent > 0) {
      doc.setTextColor(100, 100, 100)
      doc.text(`BTW (${invoice.btw_percent}%):`, totalsX, y, { align: 'right' })
      doc.setTextColor(40, 40, 40)
      doc.text(`€ ${btwAmount.toFixed(2)}`, valuesX, y, { align: 'right' })
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
    doc.text(`€ ${total.toFixed(2)}`, valuesX, y, { align: 'right' })

    if (invoice.notes) {
      y += 15
      if (y > 260) { doc.addPage(); y = 25 }
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(100, 100, 100)
      doc.text('Opmerkingen:', margin, y)
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 80, 80)
      const noteLines = doc.splitTextToSize(invoice.notes, contentWidth)
      doc.text(noteLines, margin, y)
    }

    if (s.iban && invoice.status !== 'paid') {
      y += 15
      if (y > 260) { doc.addPage(); y = 25 }
      doc.setFontSize(9)
      doc.setTextColor(80, 80, 80)
      doc.text(`Gelieve het bedrag over te maken naar: ${s.iban}`, margin, y)
      y += 5
      doc.text(`o.v.v. factuurnummer ${invoice.number}`, margin, y)
    }

    if (s.kor_enabled) {
      y += 12
      if (y > 270) { doc.addPage(); y = 25 }
      doc.setFontSize(7)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(140, 140, 140)
      doc.text('Op grond van de Kleineondernemersregeling (KOR) is er geen BTW verschuldigd.', margin, y)
    }

    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(180, 180, 180)
      doc.text(`${s.company_name || 'DesignPixels'} — Factuur ${invoice.number}`, margin, 290)
      doc.text(`Pagina ${i} van ${pageCount}`, pageWidth - margin, 290, { align: 'right' })
    }

    doc.save(`Factuur-${invoice.number}.pdf`)
    setDownloading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-lg font-medium text-gray-900">Factuur niet gevonden</h2>
        <button onClick={() => navigate('/')} className="mt-4 text-sm text-primary hover:underline">
          Terug naar portaal
        </button>
      </div>
    )
  }

  const items = (invoice.items || []) as QuoteItem[]
  const subtotal = items.filter(i => i.type === 'product').reduce((s, i) => s + (i.quantity || 0) * (i.price || 0), 0)
  const discountAmount = subtotal * ((invoice.discount_percent || 0) / 100)
  const afterDiscount = subtotal - discountAmount
  const btwAmount = afterDiscount * ((invoice.btw_percent || 0) / 100)
  const total = afterDiscount + btwAmount
  const korEnabled = settings?.kor_enabled ?? false
  const status = statusLabels[invoice.status] || { label: invoice.status, color: 'bg-gray-100 text-gray-600' }
  const invoiceDate = invoice.invoice_date || invoice.created_at

  return (
    <div className="max-w-3xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug naar portaal
        </button>
        <button
          onClick={handleDownloadPdf}
          disabled={downloading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download PDF
        </button>
      </div>

      {/* Invoice document */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header with accent bar */}
        <div className="bg-gradient-to-r from-primary to-primary-600 px-8 py-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">Factuur</h1>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
                  {status.label}
                </span>
              </div>
              <p className="text-white/70 text-sm mt-1">{invoice.number}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold">{settings?.company_name || 'DesignPixels'}</p>
              {settings && (
                <div className="text-white/70 text-xs mt-1 space-y-0.5">
                  {settings.address_line1 && <p>{settings.address_line1}</p>}
                  {(settings.postal_code || settings.city) && <p>{settings.postal_code} {settings.city}</p>}
                  {settings.iban && <p>IBAN: {settings.iban}</p>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Meta info */}
        <div className="px-8 py-5 bg-gray-50 border-b border-gray-100">
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-gray-400" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Klant</p>
                <p className="text-sm font-medium text-gray-900 mt-0.5">{invoice.client_name || clientName}</p>
                {projectName && <p className="text-xs text-gray-400">{projectName}</p>}
                {invoice.client_address && (
                  <p className="text-xs text-gray-400 whitespace-pre-line mt-0.5">{invoice.client_address}</p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 text-gray-400" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Datum</p>
                <p className="text-sm font-medium text-gray-900 mt-0.5">
                  {new Date(invoiceDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                {invoice.due_date && (
                  <p className="text-xs text-gray-400">
                    Vervalt op {new Date(invoice.due_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                <Hash className="w-4 h-4 text-gray-400" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Factuurnummer</p>
                <p className="text-sm font-medium text-gray-900 font-mono mt-0.5">{invoice.number}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="px-8 py-6">
          <div className="grid grid-cols-12 gap-2 pb-3 border-b border-gray-200">
            <div className="col-span-6">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Omschrijving</p>
            </div>
            <div className="col-span-2 text-right">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Aantal</p>
            </div>
            <div className="col-span-2 text-right">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Prijs</p>
            </div>
            <div className="col-span-2 text-right">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Totaal</p>
            </div>
          </div>

          <div className="divide-y divide-gray-50">
            {items.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                Geen factuurregels
              </div>
            ) : items.map((item, i) => {
              if (item.type === 'divider') {
                return <div key={i} className="py-3"><div className="border-t border-gray-200" /></div>
              }

              if (item.type === 'title') {
                return (
                  <div key={i} className="py-3">
                    <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                  </div>
                )
              }

              const lineTotal = (item.quantity || 0) * (item.price || 0)
              return (
                <div key={i} className="grid grid-cols-12 gap-2 py-3 items-start">
                  <div className="col-span-6">
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    {item.description && (
                      <div
                        className="text-xs text-gray-400 mt-0.5 prose-quote"
                        dangerouslySetInnerHTML={{ __html: item.description }}
                      />
                    )}
                    {item.is_recurring && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-medium rounded mt-1">
                        Jaarlijks terugkerend
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-sm text-gray-600">{item.quantity} {item.unit}</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-sm text-gray-600">&euro; {(item.price || 0).toFixed(2)}</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-sm font-semibold text-gray-900">&euro; {lineTotal.toFixed(2)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Totals */}
        <div className="px-8 py-5 bg-gray-50 border-t border-gray-100">
          <div className="flex justify-end">
            <div className="w-72 space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotaal</span>
                <span className="text-gray-900 font-medium">&euro; {subtotal.toFixed(2)}</span>
              </div>
              {invoice.discount_percent > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Korting ({invoice.discount_percent}%)</span>
                  <span className="text-red-500 font-medium">- &euro; {discountAmount.toFixed(2)}</span>
                </div>
              )}
              {!korEnabled && invoice.btw_percent > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">BTW ({invoice.btw_percent}%)</span>
                  <span className="text-gray-900 font-medium">&euro; {btwAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-2.5 flex justify-between">
                <span className="text-base font-bold text-gray-900">Totaal</span>
                <span className="text-xl font-bold text-primary">&euro; {total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="px-8 py-5 border-t border-gray-100">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Opmerkingen</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        {/* Payment info */}
        {settings?.iban && invoice.status !== 'paid' && (
          <div className="px-8 py-4 bg-blue-50 border-t border-blue-100">
            <p className="text-sm text-blue-700">
              Gelieve het bedrag over te maken naar <span className="font-semibold">{settings.iban}</span> o.v.v. factuurnummer <span className="font-semibold">{invoice.number}</span>.
            </p>
          </div>
        )}

        {/* KOR notice */}
        {korEnabled && (
          <div className="px-8 py-3 bg-amber-50 border-t border-amber-100">
            <p className="text-xs text-amber-700">
              Op grond van de Kleineondernemersregeling (KOR) is er geen BTW verschuldigd.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
