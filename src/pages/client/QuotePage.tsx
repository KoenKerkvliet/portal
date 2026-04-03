import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Quote, QuoteItem, InvoiceSettings } from '../../types'
import { ArrowLeft, Download, Loader2, FileCheck, Calendar, Hash, Building2 } from 'lucide-react'

export default function QuotePage() {
  const { quoteId } = useParams()
  const navigate = useNavigate()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [settings, setSettings] = useState<InvoiceSettings | null>(null)
  const [projectName, setProjectName] = useState('')
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      if (!quoteId) return

      const [quoteRes, settingsRes] = await Promise.all([
        supabase.from('quotes').select('*, project:projects(name), client:clients(name, company, email)').eq('id', quoteId).single(),
        supabase.from('invoice_settings').select('*').limit(1).single(),
      ])

      if (quoteRes.data) {
        setQuote(quoteRes.data)
        setProjectName((quoteRes.data.project as unknown as { name: string })?.name || '')
        const client = quoteRes.data.client as unknown as { name: string; company: string; email: string }
        setClientName(client?.name || '')
      }
      if (settingsRes.data) setSettings(settingsRes.data)
      setLoading(false)
    }
    fetch()
  }, [quoteId])

  const handleDownloadPdf = async () => {
    if (!quote) return
    setDownloading(true)

    // Fallback als invoice_settings niet bestaat
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

    // Offerte label
    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(158, 134, 255)
    doc.text('OFFERTE', margin, y)
    y += 10

    // Quote number & dates
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`Offertenummer: ${quote.number}`, margin, y)
    y += 5
    doc.text(`Datum: ${new Date(quote.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, y)
    y += 5
    doc.text(`Geldig tot: ${new Date(quote.valid_until).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, y)
    y += 5

    // Client info
    const client = quote.client as unknown as { name: string; company: string; email: string }
    if (client) {
      doc.text(`Aan: ${client.company || client.name}`, margin, y)
      y += 5
      if (client.company && client.name) {
        doc.text(`t.a.v. ${client.name}`, margin, y)
        y += 5
      }
    }

    y += 8

    // Divider
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8

    // Items table header
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

    // Items
    const items = (quote.items || []) as QuoteItem[]
    items.forEach((item) => {
      if (y > 270) {
        doc.addPage()
        y = 25
      }

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
          doc.setFontSize(8)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(120, 120, 120)
          const descLines = doc.splitTextToSize(item.description, contentWidth - 80)
          doc.text(descLines, margin, y)
          y += descLines.length * 4
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
    const subtotal = items.filter(i => i.type === 'product').reduce((s, i) => s + (i.quantity || 0) * (i.price || 0), 0)
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

    // Notes
    if (quote.notes) {
      y += 15
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

    // KOR notice
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
    setDownloading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <FileCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-lg font-medium text-gray-900">Offerte niet gevonden</h2>
        <button onClick={() => navigate('/')} className="mt-4 text-sm text-primary hover:underline">
          Terug naar portaal
        </button>
      </div>
    )
  }

  const items = (quote.items || []) as QuoteItem[]
  const subtotal = items.filter(i => i.type === 'product').reduce((s, i) => s + (i.quantity || 0) * (i.price || 0), 0)
  const discountAmount = subtotal * ((quote.discount_percent || 0) / 100)
  const afterDiscount = subtotal - discountAmount
  const btwAmount = afterDiscount * ((quote.btw_percent || 0) / 100)
  const total = afterDiscount + btwAmount
  const korEnabled = settings?.kor_enabled ?? false

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

      {/* Quote document */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header with accent bar */}
        <div className="bg-gradient-to-r from-primary to-primary-600 px-8 py-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">Offerte</h1>
              <p className="text-white/70 text-sm mt-1">{quote.number}</p>
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
                <p className="text-sm font-medium text-gray-900 mt-0.5">{clientName}</p>
                <p className="text-xs text-gray-400">{projectName}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 text-gray-400" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Datum</p>
                <p className="text-sm font-medium text-gray-900 mt-0.5">
                  {new Date(quote.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p className="text-xs text-gray-400">
                  Geldig tot {new Date(quote.valid_until).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                <Hash className="w-4 h-4 text-gray-400" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Offertenummer</p>
                <p className="text-sm font-medium text-gray-900 font-mono mt-0.5">{quote.number}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="px-8 py-6">
          {/* Table header */}
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

          {/* Items */}
          <div className="divide-y divide-gray-50">
            {items.map((item, i) => {
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
                      <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
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
              {quote.discount_percent > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Korting ({quote.discount_percent}%)</span>
                  <span className="text-red-500 font-medium">- &euro; {discountAmount.toFixed(2)}</span>
                </div>
              )}
              {!korEnabled && quote.btw_percent > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">BTW ({quote.btw_percent}%)</span>
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
        {quote.notes && (
          <div className="px-8 py-5 border-t border-gray-100">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Opmerkingen</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.notes}</p>
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
