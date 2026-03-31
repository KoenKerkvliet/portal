import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Project, ProjectPhase, PhaseTemplate } from '../../types'
import { CheckCircle, Circle, Clock, Sparkles, Wrench } from 'lucide-react'

const phases: ProjectPhase[] = ['intake', 'design', 'development', 'oplevering', 'onderhoud']

const phaseLabels: Record<ProjectPhase, string> = {
  intake: 'Intake',
  design: 'Design',
  development: 'Development',
  oplevering: 'Oplevering',
  onderhoud: 'Onderhoud',
}

const phaseDescriptions: Record<ProjectPhase, string> = {
  intake: 'We verzamelen alle informatie en wensen voor jouw project.',
  design: 'We werken aan het ontwerp van jouw website.',
  development: 'Jouw website wordt gebouwd en ontwikkeld.',
  oplevering: 'Jouw website wordt opgeleverd en live gezet.',
  onderhoud: 'Jouw website is live. Wij zorgen voor onderhoud en updates.',
}

const phaseIcons: Record<ProjectPhase, typeof Clock> = {
  intake: Clock,
  design: Sparkles,
  development: Wrench,
  oplevering: CheckCircle,
  onderhoud: Wrench,
}

export default function ClientPortal() {
  const { profile } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [template, setTemplate] = useState<PhaseTemplate | null>(null)
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

        // Get template for current phase
        const { data: templateData } = await supabase
          .from('phase_templates')
          .select('*')
          .eq('phase', projectData.current_phase)
          .limit(1)
          .single()

        if (templateData) {
          setTemplate(templateData)
        }
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

  // No project linked — welcome message
  if (!project) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 sm:py-24 px-4">
        <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-primary/5 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <Sparkles className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
          Welkom, {profile?.full_name || 'daar'}!
        </h2>
        <p className="text-gray-500 leading-relaxed">
          Jouw account is aangemaakt. Op dit moment wordt je account gekoppeld aan het juiste project.
          Dit duurt meestal niet lang — heb nog even geduld.
        </p>
        <div className="mt-8 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-sm text-gray-600 font-medium">Wachten op koppeling aan project...</p>
          </div>
        </div>
      </div>
    )
  }

  const currentPhaseIndex = phases.indexOf(project.current_phase)
  const PhaseIcon = phaseIcons[project.current_phase]
  const steps = template?.steps || []

  return (
    <div className="max-w-4xl mx-auto">
      {/* Project header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{project.name}</h1>
        {project.url && (
          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:text-primary-600 transition-colors"
          >
            {project.url.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>

      {/* Phase progress */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-100 mb-6">
        {/* Desktop progress bar */}
        <div className="hidden sm:block">
          <div className="flex items-center">
            {phases.map((phase, index) => {
              const isCompleted = index < currentPhaseIndex
              const isCurrent = index === currentPhaseIndex
              return (
                <div key={phase} className="flex items-center flex-1 last:flex-initial">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      isCompleted ? 'bg-green-100 text-green-600' :
                      isCurrent ? 'bg-primary/10 text-primary ring-2 ring-primary ring-offset-2' :
                      'bg-gray-100 text-gray-400'
                    }`}>
                      {isCompleted ? <CheckCircle className="w-5 h-5" /> : isCurrent ? <Clock className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                    </div>
                    <span className={`text-xs font-medium mt-2 ${
                      isCurrent ? 'text-primary' : isCompleted ? 'text-green-600' : 'text-gray-400'
                    }`}>
                      {phaseLabels[phase]}
                    </span>
                  </div>
                  {index < phases.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-3 rounded-full ${
                      index < currentPhaseIndex ? 'bg-green-300' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Mobile progress */}
        <div className="sm:hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-900">Voortgang</span>
            <span className="text-sm text-primary font-medium">{phaseLabels[project.current_phase]}</span>
          </div>
          <div className="flex gap-1.5">
            {phases.map((phase, index) => (
              <div
                key={phase}
                className={`h-2 flex-1 rounded-full ${
                  index < currentPhaseIndex ? 'bg-green-400' :
                  index === currentPhaseIndex ? 'bg-primary' :
                  'bg-gray-200'
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-gray-400">Intake</span>
            <span className="text-[10px] text-gray-400">Onderhoud</span>
          </div>
        </div>
      </div>

      {/* Current phase info */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-gray-100 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <PhaseIcon className="w-6 h-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">
              {template?.title || phaseLabels[project.current_phase]}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {template?.description || phaseDescriptions[project.current_phase]}
            </p>
            {template?.content && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{template.content}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Steps */}
      {steps.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Stappen in deze fase
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`bg-white rounded-xl p-4 sm:p-5 shadow-sm border transition-all ${
                  step.completed
                    ? 'border-green-200 bg-gradient-to-br from-green-50/50 to-white'
                    : 'border-gray-100 hover:shadow-md'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    step.completed ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {step.completed ? <CheckCircle className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                  </div>
                  <div>
                    <h4 className={`font-semibold text-sm ${step.completed ? 'text-green-700' : 'text-gray-900'}`}>
                      {step.title}
                    </h4>
                    {step.description && (
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{step.description}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
