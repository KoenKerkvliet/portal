import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Loader2, Palette, Home, FileText } from 'lucide-react'

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Terug naar portaal
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className={`bg-gradient-to-r ${config.bgGradient} px-6 sm:px-8 py-5 border-b border-gray-100`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${config.iconBg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${config.iconColor}`} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{config.title}</h1>
                {projectName && <p className="text-sm text-gray-500">{projectName}</p>}
              </div>
            </div>
          </div>

          {/* Sandboxed HTML content in iframe */}
          <div className="p-4 sm:p-6">
            {html.trim() ? (
              <iframe
                srcDoc={html}
                sandbox="allow-same-origin"
                className="w-full border border-gray-200 rounded-xl bg-white"
                style={{ minHeight: '500px' }}
                onLoad={(e) => {
                  const iframe = e.target as HTMLIFrameElement
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document
                    if (doc?.body) {
                      const height = doc.body.scrollHeight + 32
                      iframe.style.height = `${Math.max(500, height)}px`
                    }
                  } catch {
                    // Cross-origin fallback
                  }
                }}
              />
            ) : (
              <p className="text-sm text-gray-400 text-center py-12">Er is nog geen {config.title.toLowerCase()} beschikbaar.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
