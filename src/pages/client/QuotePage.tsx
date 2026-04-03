import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Quote, QuoteItem, InvoiceSettings } from '../../types'
import { ArrowLeft, Download, Loader2, FileCheck, Calendar, Hash, Building2, Check, PenLine, XCircle } from 'lucide-react'

// Convert HTML to structured plain text for PDF
function htmlToPlainText(html: string): string {
  let text = html
  // Convert list items to bullet points
  text = text.replace(/<li[^>]*>/gi, '• ')
  text = text.replace(/<\/li>/gi, '\n')
  // Convert block elements to newlines
  text = text.replace(/<\/p>/gi, '\n')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/h[1-6]>/gi, '\n')
  text = text.replace(/<\/div>/gi, '\n')
  // Remove remaining tags
  text = text.replace(/<[^>]*>/g, '')
  // Decode HTML entities
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&euro;/g, '€').replace(/&middot;/g, '·')
  // Clean up multiple newlines
  text = text.replace(/\n{3,}/g, '\n\n').trim()
  return text
}

// Signature pad component
function SignatureCanvas({ onSignatureChange }: { onSignatureChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    setIsDrawing(true)
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!isDrawing) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#1f2937'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    setHasSignature(true)
  }

  const endDraw = () => {
    setIsDrawing(false)
    if (hasSignature && canvasRef.current) {
      onSignatureChange(canvasRef.current.toDataURL('image/png'))
    }
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
    onSignatureChange('')
  }

  return (
    <div>
      <div className="relative border-2 border-dashed border-gray-200 rounded-xl overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full h-32 cursor-crosshair touch-none"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 text-gray-300">
              <PenLine className="w-5 h-5" />
              <span className="text-sm font-medium">Teken hier je handtekening</span>
            </div>
          </div>
        )}
      </div>
      {hasSignature && (
        <button type="button" onClick={clear} className="mt-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors">
          Handtekening wissen
        </button>
      )}
    </div>
  )
}

export default function QuotePage() {
  const { quoteId } = useParams()
  const navigate = useNavigate()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [settings, setSettings] = useState<InvoiceSettings | null>(null)
  const [projectName, setProjectName] = useState('')
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  // Acceptance state
  const [acceptName, setAcceptName] = useState('')
  const [acceptSignature, setAcceptSignature] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [acceptRemarks, setAcceptRemarks] = useState('')
  const [accepting, setAccepting] = useState(false)

  // Decline state
  const [showDecline, setShowDecline] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [declining, setDeclining] = useState(false)

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
          const plainDesc = htmlToPlainText(item.description)
          if (plainDesc) {
            doc.setFontSize(7.5)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(120, 120, 120)
            // Render per paragraph/line for tight spacing
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

  const handleAccept = async () => {
    if (!quote || !quoteId || !acceptName.trim() || !acceptSignature || !acceptTerms) return
    setAccepting(true)

    try {
      // Update quote status and store acceptance data
      await supabase.from('quotes').update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_name: acceptName.trim(),
        accepted_signature: acceptSignature,
        accepted_remarks: acceptRemarks.trim() || null,
      }).eq('id', quoteId)

      // Mark the step that links to this quote as completed
      await markQuoteStepCompleted()

      // Send notification email to admin
      const client = quote.client as unknown as { name: string; company: string }
      await supabase.functions.invoke('notify-quote-response', {
        body: {
          action: 'accepted',
          quoteNumber: quote.number,
          clientName: client?.name || acceptName.trim(),
          projectName,
          remarks: acceptRemarks.trim() || null,
        },
      })

      // Refresh quote data
      const { data } = await supabase.from('quotes').select('*, project:projects(name), client:clients(name, company, email)').eq('id', quoteId).single()
      if (data) setQuote(data)
    } catch (err) {
      console.error('Error accepting quote:', err)
    } finally {
      setAccepting(false)
    }
  }

  const handleDecline = async () => {
    if (!quote || !quoteId || !declineReason.trim()) return
    setDeclining(true)

    try {
      await supabase.from('quotes').update({
        status: 'declined',
        declined_at: new Date().toISOString(),
        declined_reason: declineReason.trim(),
      }).eq('id', quoteId)

      // Send notification email to admin
      const client = quote.client as unknown as { name: string; company: string }
      await supabase.functions.invoke('notify-quote-response', {
        body: {
          action: 'declined',
          quoteNumber: quote.number,
          clientName: client?.name || '',
          projectName,
          declineReason: declineReason.trim(),
        },
      })

      // Refresh quote data
      const { data } = await supabase.from('quotes').select('*, project:projects(name), client:clients(name, company, email)').eq('id', quoteId).single()
      if (data) setQuote(data)
    } catch (err) {
      console.error('Error declining quote:', err)
    } finally {
      setDeclining(false)
    }
  }

  const markQuoteStepCompleted = useCallback(async () => {
    if (!quote?.project_id || !quoteId) return

    // Get the project's current phase
    const { data: project } = await supabase
      .from('projects')
      .select('current_phase')
      .eq('id', quote.project_id)
      .single()

    if (!project) return

    // Check all phases for this project (the quote button could be in any phase)
    const { data: phaseRecords } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', quote.project_id)

    if (!phaseRecords) return

    for (const phaseRecord of phaseRecords) {
      if (!phaseRecord.custom_data?.steps) continue

      const steps = phaseRecord.custom_data.steps as Array<{
        id: string
        completed?: boolean
        elements?: Array<{ type: string; data: Record<string, string> }>
      }>

      let changed = false
      for (const step of steps) {
        if (step.completed) continue
        const hasQuoteButton = step.elements?.some(
          (el) => el.type === 'button' && el.data.action === 'quote' && el.data.quoteId === quoteId
        )
        if (hasQuoteButton) {
          step.completed = true
          changed = true
        }
      }

      if (changed) {
        await supabase
          .from('project_phases')
          .update({ custom_data: { ...phaseRecord.custom_data, steps } })
          .eq('id', phaseRecord.id)
      }
    }
  }, [quote?.project_id, quoteId])

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

      {/* Acceptance / Decline section */}
      {quote.accepted_at ? (
        // Already accepted — show confirmation
        <div className="mt-6 bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden">
          <div className="bg-green-50 px-8 py-5 border-b border-green-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-green-900">Offerte geaccepteerd</h3>
                <p className="text-sm text-green-700">
                  Geaccepteerd door {quote.accepted_name} op {new Date(quote.accepted_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
          <div className="px-8 py-5 space-y-4">
            {quote.accepted_signature && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Handtekening</p>
                <img src={quote.accepted_signature} alt="Handtekening" className="h-20 object-contain" />
              </div>
            )}
            {quote.accepted_remarks && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Opmerking</p>
                <p className="text-sm text-gray-600">{quote.accepted_remarks}</p>
              </div>
            )}
          </div>
        </div>
      ) : quote.status === 'declined' ? (
        // Declined — show decline confirmation
        <div className="mt-6 bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
          <div className="bg-red-50 px-8 py-5 border-b border-red-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-900">Offerte afgekeurd</h3>
                {quote.declined_at && (
                  <p className="text-sm text-red-700">
                    Afgekeurd op {new Date(quote.declined_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>
          </div>
          {quote.declined_reason && (
            <div className="px-8 py-5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Reden</p>
              <p className="text-sm text-gray-600">{quote.declined_reason}</p>
            </div>
          )}
        </div>
      ) : (
        // Not yet accepted — show acceptance form
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-primary/5 to-primary/10 px-8 py-5 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-900">Opdrachtbevestiging</h3>
            <p className="text-sm text-gray-500 mt-0.5">Bevestig de offerte door hieronder je gegevens in te vullen en te ondertekenen.</p>
          </div>

          {!showDecline ? (
            <div className="px-8 py-6 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Volledige naam</label>
                <input
                  type="text"
                  value={acceptName}
                  onChange={(e) => setAcceptName(e.target.value)}
                  placeholder="Vul je volledige naam in"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                />
              </div>

              {/* Signature */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Handtekening</label>
                <SignatureCanvas onSignatureChange={setAcceptSignature} />
              </div>

              {/* Remarks (optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Opmerking <span className="text-gray-400 font-normal">(optioneel)</span>
                </label>
                <textarea
                  value={acceptRemarks}
                  onChange={(e) => setAcceptRemarks(e.target.value)}
                  placeholder="Eventuele opmerkingen bij je akkoord..."
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all resize-none"
                />
              </div>

              {/* Terms checkbox */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/30 mt-0.5"
                />
                <span className="text-sm text-gray-600 group-hover:text-gray-800 transition-colors">
                  Ik ga akkoord met de{' '}
                  <Link to="/voorwaarden" target="_blank" className="text-primary hover:text-primary-600 underline font-medium">
                    algemene voorwaarden
                  </Link>
                </span>
              </label>

              {/* Accept button */}
              <button
                type="button"
                onClick={handleAccept}
                disabled={accepting || !acceptName.trim() || !acceptSignature || !acceptTerms}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {accepting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {accepting ? 'Bezig met verwerken...' : 'Offerte accepteren'}
              </button>

              {/* Decline link */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setShowDecline(true)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  Ik wil de offerte afkeuren
                </button>
              </div>
            </div>
          ) : (
            // Decline form
            <div className="px-8 py-6 space-y-5">
              <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                <p className="text-sm font-medium text-red-800">Offerte afkeuren</p>
                <p className="text-xs text-red-600 mt-0.5">Laat ons weten waarom de offerte niet akkoord is, zodat we een nieuwe offerte kunnen opstellen.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Reden van afkeuring</label>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Beschrijf waarom je de offerte wilt afkeuren..."
                  rows={4}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 focus:bg-white text-sm transition-all resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDecline(false)}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Annuleren
                </button>
                <button
                  type="button"
                  onClick={handleDecline}
                  disabled={declining || !declineReason.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {declining ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  {declining ? 'Verwerken...' : 'Offerte afkeuren'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
