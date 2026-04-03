import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Assignment } from '../../types'
import { ArrowLeft, Loader2, ClipboardCheck, Download, Check, PenLine, XCircle } from 'lucide-react'
import DOMPurify from 'dompurify'

// Signature pad component (same as QuotePage)
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

export default function ClientAssignmentPage() {
  const { assignmentId } = useParams()
  const navigate = useNavigate()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
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

  // Mark step with assignment button as completed
  const markAssignmentStepCompleted = useCallback(async () => {
    if (!assignment?.project_id || !assignmentId) return

    const { data: phaseRecords } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', assignment.project_id)

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
        if (!step.elements) continue
        for (const el of step.elements) {
          if (el.type === 'button' && el.data.action === 'assignment' && el.data.assignmentId === assignmentId) {
            step.completed = true
            changed = true
          }
        }
      }

      if (changed) {
        await supabase.from('project_phases').update({
          custom_data: { ...phaseRecord.custom_data, steps },
        }).eq('id', phaseRecord.id)
      }
    }
  }, [assignment?.project_id, assignmentId])

  const handleAccept = async () => {
    if (!assignment || !assignmentId || !acceptName.trim() || !acceptSignature || !acceptTerms) return
    setAccepting(true)

    try {
      await supabase.from('assignments').update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_name: acceptName.trim(),
        accepted_signature: acceptSignature,
        accepted_remarks: acceptRemarks.trim() || null,
      }).eq('id', assignmentId)

      await markAssignmentStepCompleted()

      // Create admin dashboard notification
      const client = assignment.client as unknown as { name: string; company: string }
      await supabase.from('admin_notifications').insert({
        type: 'quote_accepted',
        title: `Opdracht "${assignment.title}" geaccepteerd`,
        message: `${client?.name || acceptName.trim()} heeft de opdracht geaccepteerd.${acceptRemarks.trim() ? ` Opmerking: "${acceptRemarks.trim()}"` : ''}`,
        project_id: assignment.project_id,
        client_id: assignment.client_id,
      })

      // Send email notification to admin
      await supabase.functions.invoke('notify-quote-response', {
        body: {
          action: 'accepted',
          quoteNumber: `Opdracht: ${assignment.title}`,
          clientName: client?.name || acceptName.trim(),
          projectName: (assignment.project as unknown as { name: string })?.name || '',
          remarks: acceptRemarks.trim() || null,
        },
      })

      // Refresh
      const { data } = await supabase
        .from('assignments')
        .select('*, project:projects(name), client:clients(name, company)')
        .eq('id', assignmentId)
        .single()
      if (data) setAssignment(data)
    } catch (err) {
      console.error('Error accepting assignment:', err)
    } finally {
      setAccepting(false)
    }
  }

  const handleDecline = async () => {
    if (!assignment || !assignmentId || !declineReason.trim()) return
    setDeclining(true)

    try {
      await supabase.from('assignments').update({
        status: 'declined',
        declined_at: new Date().toISOString(),
        declined_reason: declineReason.trim(),
      }).eq('id', assignmentId)

      // Create admin dashboard notification
      const client = assignment.client as unknown as { name: string; company: string }
      await supabase.from('admin_notifications').insert({
        type: 'quote_declined',
        title: `Opdracht "${assignment.title}" afgekeurd`,
        message: `${client?.name || 'De klant'} heeft de opdracht afgekeurd. Reden: "${declineReason.trim()}"`,
        project_id: assignment.project_id,
        client_id: assignment.client_id,
      })

      // Send email notification to admin
      await supabase.functions.invoke('notify-quote-response', {
        body: {
          action: 'declined',
          quoteNumber: `Opdracht: ${assignment.title}`,
          clientName: client?.name || '',
          projectName: (assignment.project as unknown as { name: string })?.name || '',
          declineReason: declineReason.trim(),
        },
      })

      // Refresh
      const { data } = await supabase
        .from('assignments')
        .select('*, project:projects(name), client:clients(name, company)')
        .eq('id', assignmentId)
        .single()
      if (data) setAssignment(data)
    } catch (err) {
      console.error('Error declining assignment:', err)
    } finally {
      setDeclining(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (!assignment) return
    setDownloading(true)

    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    const contentWidth = pageWidth - margin * 2
    let y = 25

    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(40, 40, 40)
    doc.text('DesignPixels', margin, y)
    y += 15

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

    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageWidth - margin, y)
    y += 10

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

    // Acceptance info in PDF
    if (assignment.status === 'accepted' && assignment.accepted_at) {
      y += 10
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
      if (assignment.accepted_name) {
        doc.text(`Naam: ${assignment.accepted_name}`, margin, y); y += 5
      }
      doc.text(`Datum: ${new Date(assignment.accepted_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, y); y += 5

      if (assignment.accepted_remarks) {
        doc.text(`Opmerking: ${assignment.accepted_remarks}`, margin, y); y += 5
      }

      if (assignment.accepted_signature) {
        y += 3
        try {
          doc.addImage(assignment.accepted_signature, 'PNG', margin, y, 60, 20)
          y += 24
        } catch { /* skip */ }
      }
    }

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
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Terug
        </button>

        {/* Assignment card */}
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

          {assignment.content && (
            <div className="px-6 sm:px-8 py-6">
              <div
                className="prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(assignment.content) }}
              />
            </div>
          )}
        </div>

        {/* Acceptance / Decline section */}
        {assignment.accepted_at ? (
          // Already accepted
          <div className="mt-6 bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden">
            <div className="bg-green-50 px-8 py-5 border-b border-green-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-green-900">Opdracht geaccepteerd</h3>
                  <p className="text-sm text-green-700">
                    Geaccepteerd door {assignment.accepted_name} op {new Date(assignment.accepted_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-8 py-5 space-y-4">
              {assignment.accepted_signature && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Handtekening</p>
                  <img src={assignment.accepted_signature} alt="Handtekening" className="h-20 object-contain" />
                </div>
              )}
              {assignment.accepted_remarks && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Opmerking</p>
                  <p className="text-sm text-gray-600">{assignment.accepted_remarks}</p>
                </div>
              )}
            </div>
          </div>
        ) : assignment.status === 'declined' ? (
          // Declined
          <div className="mt-6 bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
            <div className="bg-red-50 px-8 py-5 border-b border-red-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-900">Opdracht afgekeurd</h3>
                  {assignment.declined_at && (
                    <p className="text-sm text-red-700">
                      Afgekeurd op {new Date(assignment.declined_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              </div>
            </div>
            {assignment.declined_reason && (
              <div className="px-8 py-5">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Reden</p>
                <p className="text-sm text-gray-600">{assignment.declined_reason}</p>
              </div>
            )}
          </div>
        ) : (
          // Acceptance form
          <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-primary/5 to-primary/10 px-8 py-5 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Opdrachtbevestiging</h3>
              <p className="text-sm text-gray-500 mt-0.5">Bevestig de opdracht door hieronder je gegevens in te vullen en te ondertekenen.</p>
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

                {/* Remarks */}
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

                {/* Terms */}
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
                  {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {accepting ? 'Bezig met verwerken...' : 'Opdracht accepteren'}
                </button>

                {/* Decline link */}
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setShowDecline(true)}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Ik wil de opdracht afkeuren
                  </button>
                </div>
              </div>
            ) : (
              // Decline form
              <div className="px-8 py-6 space-y-5">
                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                  <p className="text-sm font-medium text-red-800">Opdracht afkeuren</p>
                  <p className="text-xs text-red-600 mt-0.5">Laat ons weten waarom de opdracht niet akkoord is, zodat we een aangepaste opdracht kunnen opstellen.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Reden van afkeuring</label>
                  <textarea
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="Beschrijf waarom je de opdracht wilt afkeuren..."
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
                    {declining ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    {declining ? 'Verwerken...' : 'Opdracht afkeuren'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
