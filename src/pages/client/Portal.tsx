import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Project, ProjectPhase, ProjectPhaseRecord } from '../../types'
import { CheckCircle, Circle, Clock, ArrowRight } from 'lucide-react'

const phases: ProjectPhase[] = ['intake', 'design', 'development', 'review', 'opgeleverd']

const phaseLabels: Record<ProjectPhase, string> = {
  intake: 'Intake',
  design: 'Design',
  development: 'Development',
  review: 'Review',
  opgeleverd: 'Opgeleverd',
}

const phaseDescriptions: Record<ProjectPhase, string> = {
  intake: 'We verzamelen alle informatie en wensen voor jouw project.',
  design: 'We werken aan het ontwerp van jouw website of applicatie.',
  development: 'Jouw project wordt gebouwd en ontwikkeld.',
  review: 'Bekijk het resultaat en geef je feedback.',
  opgeleverd: 'Jouw project is opgeleverd en live!',
}

export default function ClientPortal() {
  const { profile } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [phaseRecords, setPhaseRecords] = useState<ProjectPhaseRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchProject = async () => {
      if (!profile) return

      // Find client record linked to this profile
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('profile_id', profile.id)
        .single()

      if (!client) {
        setLoading(false)
        return
      }

      // Get active project for this client
      const { data: projectData } = await supabase
        .from('projects')
        .select('*')
        .eq('client_id', client.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (projectData) {
        setProject(projectData)

        // Get phase records
        const { data: phaseData } = await supabase
          .from('project_phases')
          .select('*, template:phase_templates(*)')
          .eq('project_id', projectData.id)
          .order('created_at', { ascending: true })

        setPhaseRecords(phaseData || [])
      }

      setLoading(false)
    }

    fetchProject()
  }, [profile])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-gray-900">Welkom!</h2>
        <p className="text-gray-500 mt-2">Er zijn nog geen actieve projecten voor jouw account.</p>
      </div>
    )
  }

  const currentPhaseIndex = phases.indexOf(project.current_phase)
  const currentPhaseRecord = phaseRecords.find((r) => r.phase === project.current_phase)
  const steps = currentPhaseRecord?.template?.steps || []

  return (
    <div>
      {/* Project header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
        {project.description && <p className="text-gray-500 mt-1">{project.description}</p>}
      </div>

      {/* Phase progress bar */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-8">
        <div className="flex items-center justify-between">
          {phases.map((phase, index) => {
            const isCompleted = index < currentPhaseIndex
            const isCurrent = index === currentPhaseIndex

            return (
              <div key={phase} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                    isCompleted ? 'bg-green-100 text-green-600' :
                    isCurrent ? 'bg-primary/10 text-primary ring-2 ring-primary' :
                    'bg-gray-100 text-gray-400'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : isCurrent ? (
                      <Clock className="w-5 h-5" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </div>
                  <span className={`text-xs font-medium text-center ${
                    isCurrent ? 'text-primary' : isCompleted ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    {phaseLabels[phase]}
                  </span>
                </div>
                {index < phases.length - 1 && (
                  <ArrowRight className={`w-4 h-4 mx-1 flex-shrink-0 ${
                    index < currentPhaseIndex ? 'text-green-400' : 'text-gray-300'
                  }`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Current phase info */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Huidige fase: {phaseLabels[project.current_phase]}
            </h2>
            <p className="text-sm text-gray-500">
              {currentPhaseRecord?.template?.description || phaseDescriptions[project.current_phase]}
            </p>
          </div>
        </div>
      </div>

      {/* Steps within current phase */}
      {steps.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {steps.map((step) => (
            <div key={step.id} className={`bg-white rounded-xl p-5 shadow-sm border ${
              step.completed ? 'border-green-200 bg-green-50/30' : 'border-gray-100'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  step.completed ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  {step.completed ? <CheckCircle className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className={`font-medium ${step.completed ? 'text-green-700' : 'text-gray-900'}`}>
                    {step.title}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{step.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
          <p className="text-gray-500">Er zijn nog geen stappen ingesteld voor deze fase.</p>
        </div>
      )}
    </div>
  )
}
