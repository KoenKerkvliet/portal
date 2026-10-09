import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getClientAndProjectIds } from '../../lib/clientProjects'
import { useAuth } from '../../contexts/AuthContext'
import { BookOpenText } from 'lucide-react'
import KbSearch from '../../components/KbSearch'
import TicketSystem from './TicketSystem'

export default function SupportPage() {
  const { profile } = useAuth()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      if (!profile) return
      const { projectIds } = await getClientAndProjectIds(profile.id)
      if (projectIds.length === 0) { setLoading(false); return }

      const { data: project } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', projectIds)
        .eq('status', 'active')
        .limit(1)
        .single()
      if (project) {
        setProjectId(project.id)
        setProjectName(project.name)
      }
      setLoading(false)
    }
    fetch()
  }, [profile])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!projectId) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Geen project gevonden.</p>
      </div>
    )
  }

  return (
    <div className="bg-[#f8f7fc] min-h-[calc(100vh-64px)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

        {/* Kennisbank: eerst zelf zoeken, daaronder een aanvraag doen */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8 mb-8 text-center">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookOpenText className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Kennisbank</h2>
          <p className="text-sm text-gray-500 mb-5">Zoek antwoorden op veelgestelde vragen en uitleg over je website.</p>
          <KbSearch compact />
        </div>

        {/* Ticket systeem */}
        <TicketSystem projectId={projectId} projectName={projectName} />
      </div>
    </div>
  )
}
