import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Loader2, Palette, Home, FileText, ZoomIn, ZoomOut, CheckCircle, PenLine } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { sendAdminNotificationEmail } from '../../lib/sendAdminNotificationEmail'

const pageConfig: Record<string, { title: string; field: string; icon: typeof Palette; bgGradient: string; iconBg: string; iconColor: string }> = {
  styleguide: { title: 'Styleguide', field: 'design_html_styleguide', icon: Palette, bgGradient: 'from-purple-50 to-purple-100/50', iconBg: 'bg-purple-100', iconColor: 'text-purple-600' },
  homepage: { title: 'Homepage', field: 'design_html_homepage', icon: Home, bgGradient: 'from-blue-50 to-blue-100/50', iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
  contactpage: { title: 'Contactpagina', field: 'design_html_tweede', icon: FileText, bgGradient: 'from-green-50 to-green-100/50', iconBg: 'bg-green-100', iconColor: 'text-green-600' },
}

interface DesignApproval {
  accepted_at: string
  accepted_name: string
  accepted_signature: string
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

export default function StyleguidePage() {
  const { projectId, type } = useParams()
  const { profile } = useAuth()
  const config = pageConfig[type || 'styleguide'] || pageConfig.styleguide
  const designType = type || 'styleguide'
  const Icon = config.icon

  const [html, setHtml] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(0.75)
  const [iframeHeight, setIframeHeight] = useState(600)
  const containerRef = useRef<HTMLDivElement>(null)

  // Approval state
  const [approval, setApproval] = useState<DesignApproval | null>(null)
  const [acceptName, setAcceptName] = useState('')
  const [acceptSignature, setAcceptSignature] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [phaseInstanceId, setPhaseInstanceId] = useState<string | null>(null)
  const [phaseCustomData, setPhaseCustomData] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    const fetch = async () => {
      if (!projectId) return

      const [phaseRes, projectRes] = await Promise.all([
        supabase.from('project_phases').select('id, custom_data').eq('project_id', projectId).eq('phase', 'design').single(),
        supabase.from('projects').select('name').eq('id', projectId).single(),
      ])

      if (phaseRes.data) {
        setPhaseInstanceId(phaseRes.data.id)
        const cd = phaseRes.data.custom_data || {}
        setPhaseCustomData(cd)
        setHtml(cd[config.field] || '')
        // Load approval status
        const approvals = cd.design_approvals as Record<string, DesignApproval> | undefined
        if (approvals?.[designType]) {
          setApproval(approvals[designType])
        }
      }
      if (projectRes.data) {
        setProjectName(projectRes.data.name)
      }
      setLoading(false)
    }
    fetch()
  }, [projectId, config.field, designType])

  // Pre-fill name from profile
  useEffect(() => {
    if (profile?.full_name && !acceptName) {
      setAcceptName(profile.full_name)
    }
  }, [profile?.full_name])

  const markDesignStepCompleted = useCallback(async () => {
    if (!projectId) return

    const { data: phaseRecords } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', projectId)

    if (!phaseRecords) return

    for (const phaseRecord of phaseRecords) {
      if (!phaseRecord.custom_data?.steps) continue
      const steps = phaseRecord.custom_data.steps as Array<{
        id: string; completed?: boolean; elements?: Array<{ type: string; data: Record<string, string> }>
      }>
      let changed = false
      for (const step of steps) {
        if (step.completed) continue
        if (!step.elements) continue
        for (const el of step.elements) {
          if (el.type === 'button' && el.data.action === designType) {
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
  }, [projectId, designType])

  const handleAccept = async () => {
    if (!acceptName.trim() || !acceptSignature || !phaseInstanceId || !phaseCustomData) return
    setAccepting(true)

    try {
      const newApproval: DesignApproval = {
        accepted_at: new Date().toISOString(),
        accepted_name: acceptName.trim(),
        accepted_signature: acceptSignature,
      }

      // Update design phase custom_data with approval
      const existingApprovals = (phaseCustomData.design_approvals as Record<string, DesignApproval>) || {}
      const updatedCustomData = {
        ...phaseCustomData,
        design_approvals: { ...existingApprovals, [designType]: newApproval },
      }
      await supabase.from('project_phases').update({ custom_data: updatedCustomData }).eq('id', phaseInstanceId)

      // Mark the step as completed
      await markDesignStepCompleted()

      // Get client info for notification
      const clientName = profile?.full_name || acceptName.trim()

      // Create admin dashboard notification
      await supabase.from('admin_notifications').insert({
        type: 'quote_accepted',
        title: `Design "${config.title}" goedgekeurd`,
        message: `${clientName} heeft het design "${config.title}" goedgekeurd.`,
        project_id: projectId,
        client_id: profile?.id || null,
      })

      // Send email notification to admin
      await sendAdminNotificationEmail({
        type: 'accepted',
        itemLabel: `Design: ${config.title}`,
        clientName,
        projectName,
      })

      setApproval(newApproval)
    } catch (err) {
      console.error('Error accepting design:', err)
    } finally {
      setAccepting(false)
    }
  }

  const handleIframeLoad = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = e.target as HTMLIFrameElement
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (doc?.body) {
        doc.body.style.overflow = 'hidden'
        doc.documentElement.style.overflow = 'hidden'
        const height = doc.body.scrollHeight
        setIframeHeight(height)
      }
    } catch {
      // Cross-origin fallback
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!html && html !== '') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">{config.title} niet gevonden</p>
        <Link to="/" className="text-primary hover:underline text-sm">Terug naar portaal</Link>
      </div>
    )
  }

  const iframeWidth = 1440
  const scaledHeight = iframeHeight * zoom

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Terug naar portaal
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header with zoom controls */}
          <div className={`bg-gradient-to-r ${config.bgGradient} px-6 sm:px-8 py-5 border-b border-gray-100`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${config.iconBg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${config.iconColor}`} />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{config.title}</h1>
                  {projectName && <p className="text-sm text-gray-500">{projectName}</p>}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {approval && (
                  <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-xs font-medium text-green-700">Goedgekeurd</span>
                  </div>
                )}
                {html.trim() && (
                  <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-lg border border-gray-200 px-3 py-1.5">
                    <button onClick={() => setZoom(z => Math.max(0.25, z - 0.05))} className="p-0.5 text-gray-500 hover:text-gray-700 transition-colors">
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <input
                      type="range"
                      min="25"
                      max="100"
                      value={Math.round(zoom * 100)}
                      onChange={(e) => setZoom(Number(e.target.value) / 100)}
                      className="w-24 h-1.5 accent-primary cursor-pointer"
                    />
                    <button onClick={() => setZoom(z => Math.min(1, z + 0.05))} className="p-0.5 text-gray-500 hover:text-gray-700 transition-colors">
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-medium text-gray-500 min-w-[3ch] text-center">{Math.round(zoom * 100)}%</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sandboxed HTML content in scaled iframe */}
          <div className="p-4 sm:p-6" ref={containerRef}>
            {html.trim() ? (
              <div
                className="overflow-hidden rounded-xl border border-gray-200"
                style={{ height: `${scaledHeight}px` }}
              >
                <iframe
                  srcDoc={html}
                  sandbox="allow-same-origin"
                  className="bg-white"
                  style={{
                    width: `${iframeWidth}px`,
                    height: `${iframeHeight}px`,
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top left',
                    border: 'none',
                  }}
                  onLoad={handleIframeLoad}
                />
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-12">Er is nog geen {config.title.toLowerCase()} beschikbaar.</p>
            )}
          </div>

          {/* Approval section */}
          {html.trim() && (
            <div className="border-t border-gray-100 px-6 sm:px-8 py-8">
              {approval ? (
                // Already approved
                <div className="max-w-lg mx-auto text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-50 mb-4">
                    <CheckCircle className="w-7 h-7 text-green-600" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Design goedgekeurd</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Goedgekeurd door <strong>{approval.accepted_name}</strong> op{' '}
                    {new Date(approval.accepted_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                  {approval.accepted_signature && (
                    <div className="inline-block border border-gray-200 rounded-xl p-3 bg-gray-50">
                      <img src={approval.accepted_signature} alt="Handtekening" className="h-16" />
                    </div>
                  )}
                </div>
              ) : (
                // Approval form
                <div className="max-w-lg mx-auto">
                  <h3 className="text-lg font-bold text-gray-900 mb-1 text-center">Design goedkeuren</h3>
                  <p className="text-sm text-gray-500 text-center mb-6">
                    Ben je tevreden met dit design? Keur het goed met je naam en handtekening.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Volledige naam</label>
                      <input
                        type="text"
                        value={acceptName}
                        onChange={(e) => setAcceptName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                        placeholder="Je volledige naam"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Handtekening</label>
                      <SignatureCanvas onSignatureChange={setAcceptSignature} />
                    </div>

                    <button
                      onClick={handleAccept}
                      disabled={!acceptName.trim() || !acceptSignature || accepting}
                      className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl font-medium text-sm hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {accepting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      {accepting ? 'Goedkeuren...' : 'Design goedkeuren'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
