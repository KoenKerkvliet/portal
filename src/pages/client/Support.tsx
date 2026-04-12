import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Search, BookOpen } from 'lucide-react'
import TicketSystem from './TicketSystem'

export default function SupportPage() {
  const { profile } = useAuth()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
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

        {/* Kennisbank sectie (gereserveerd) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 mb-8 text-center">
          <div className="w-14 h-14 bg-primary/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-7 h-7 text-primary/40" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Kennisbank</h2>
          <p className="text-sm text-gray-500 mb-4">Zoek antwoorden op veelgestelde vragen en handleidingen.</p>
          <div className="max-w-md mx-auto relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              disabled
              className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-400 cursor-not-allowed"
              placeholder="Zoeken in kennisbank... (binnenkort beschikbaar)"
            />
          </div>
        </div>

        {/* Ticket systeem */}
        <TicketSystem projectId={projectId} projectName={projectName} />
      </div>
    </div>
  )
}
