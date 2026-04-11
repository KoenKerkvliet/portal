import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Loader2, Palette, Home, FileText, ZoomIn, ZoomOut } from 'lucide-react'

const pageConfig: Record<string, { title: string; field: string; icon: typeof Palette; bgGradient: string; iconBg: string; iconColor: string }> = {
  styleguide: { title: 'Styleguide', field: 'design_html_styleguide', icon: Palette, bgGradient: 'from-purple-50 to-purple-100/50', iconBg: 'bg-purple-100', iconColor: 'text-purple-600' },
  homepage: { title: 'Homepage', field: 'design_html_homepage', icon: Home, bgGradient: 'from-blue-50 to-blue-100/50', iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
  contactpage: { title: 'Contactpagina', field: 'design_html_tweede', icon: FileText, bgGradient: 'from-green-50 to-green-100/50', iconBg: 'bg-green-100', iconColor: 'text-green-600' },
}

export default function StyleguidePage() {
  const { projectId, type } = useParams()
  const config = pageConfig[type || 'styleguide'] || pageConfig.styleguide
  const Icon = config.icon

  const [html, setHtml] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(0.75)
  const [iframeHeight, setIframeHeight] = useState(600)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetch = async () => {
      if (!projectId) return

      const [phaseRes, projectRes] = await Promise.all([
        supabase.from('project_phases').select('custom_data').eq('project_id', projectId).eq('phase', 'design').single(),
        supabase.from('projects').select('name').eq('id', projectId).single(),
      ])

      if (phaseRes.data?.custom_data) {
        setHtml(phaseRes.data.custom_data[config.field] || '')
      }
      if (projectRes.data) {
        setProjectName(projectRes.data.name)
      }
      setLoading(false)
    }
    fetch()
  }, [projectId, config.field])

  const handleIframeLoad = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = e.target as HTMLIFrameElement
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (doc?.body) {
        // Disable scrolling inside iframe
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

  // The iframe renders at a fixed wide width, then gets scaled down by the zoom factor.
  // This eliminates horizontal scrollbars since the content has enough space.
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
        </div>
      </div>
    </div>
  )
}
