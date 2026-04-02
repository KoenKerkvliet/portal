import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Project, ProjectPhase, PhaseStep, CardElement } from '../../types'
import { Sparkles, ArrowRight, Calendar, ExternalLink } from 'lucide-react'
import { getIconComponent } from '../../components/CardElementEditor'

const phases: ProjectPhase[] = ['intake', 'design', 'development', 'oplevering', 'onderhoud']

const phaseLabels: Record<ProjectPhase, string> = {
  intake: 'Intake',
  design: 'Design',
  development: 'Development',
  oplevering: 'Oplevering',
  onderhoud: 'Onderhoud',
}

// Wrapper for button with form action — needs its own hook for navigate
function ButtonFormLink({ element, className }: { element: CardElement; className: string }) {
  const navigate = useNavigate()
  return (
    <div className="flex justify-center pt-2">
      <button
        type="button"
        onClick={() => navigate(`/formulier/${element.data.formId}`)}
        className={className}
      >
        {element.data.label || 'Formulier invullen'}
      </button>
    </div>
  )
}

// Render a single card element for the client view
function CardElementView({ element, project }: { element: CardElement; project: Project }) {
  switch (element.type) {
    case 'icon': {
      const IconComp = getIconComponent(element.data.name || 'star')
      return (
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${element.data.color || '#9e86ff'}15` }}>
            <IconComp className="w-6 h-6" style={{ color: element.data.color || '#9e86ff' }} />
          </div>
        </div>
      )
    }
    case 'text': {
      return element.data.content ? (
        <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap text-center">{element.data.content}</p>
      ) : null
    }
    case 'dynamic': {
      const field = element.data.field
      let displayValue = ''

      if (field === 'start_meeting_at' && project.start_meeting_at) {
        const d = new Date(project.start_meeting_at)
        displayValue = d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) +
          ' om ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) + ' uur'
      } else if (field === 'due_date' && project.due_date) {
        displayValue = new Date(project.due_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
      } else if (field === 'project_name') {
        displayValue = project.name
      } else if (field === 'client_name') {
        displayValue = (project.client as unknown as { name: string })?.name || ''
      }

      if (!displayValue) return null

      return (
        <div className="flex flex-col items-center gap-1.5 bg-gray-50 rounded-xl px-4 py-3">
          {element.data.label && (
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">{element.data.label}</p>
          )}
          <p className="text-sm font-semibold text-gray-800">{displayValue}</p>
        </div>
      )
    }
    case 'link': {
      if (!element.data.url) return null
      return (
        <div className="flex justify-center">
          <a href={element.data.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-600 font-medium transition-colors">
            {element.data.label || element.data.url}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )
    }
    case 'button': {
      const action = element.data.action || 'url'
      const isPrimary = element.data.variant !== 'outline'
      const btnClasses = `inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
        isPrimary
          ? 'bg-primary hover:bg-primary-600 text-white'
          : 'bg-white border-2 border-primary/30 text-primary hover:bg-primary/5'
      }`

      if (action === 'form' && element.data.formId) {
        return <ButtonFormLink element={element} className={btnClasses} />
      }

      // Default: URL action
      if (!element.data.url) return null
      return (
        <div className="flex justify-center pt-2">
          <a href={element.data.url} target="_blank" rel="noopener noreferrer" className={btnClasses}>
            {element.data.label || 'Bekijk'}
          </a>
        </div>
      )
    }
    default:
      return null
  }
}

export default function ClientPortal() {
  const { profile } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [phaseContent, setPhaseContent] = useState<string>('')
  const [phaseSteps, setPhaseSteps] = useState<PhaseStep[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchProject = async () => {
      if (!profile) return

      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('profile_id', profile.id)
        .single()

      if (!client) {
        setLoading(false)
        return
      }

      const { data: projectData } = await supabase
        .from('projects')
        .select('*, client:clients(id, name, email)')
        .eq('client_id', client.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (projectData) {
        setProject(projectData)

        // First try to load domain-specific instance from project_phases
        const { data: phaseInstance } = await supabase
          .from('project_phases')
          .select('*')
          .eq('project_id', projectData.id)
          .eq('phase', projectData.current_phase)
          .limit(1)
          .single()

        if (phaseInstance?.custom_data) {
          setPhaseContent(phaseInstance.custom_data.content || '')
          setPhaseSteps(phaseInstance.custom_data.steps || [])
        } else {
          // Fallback: load from template directly
          const { data: templateData } = await supabase
            .from('phase_templates')
            .select('*')
            .eq('phase', projectData.current_phase)
            .limit(1)
            .single()

          if (templateData) {
            setPhaseContent(templateData.content || templateData.description || '')
            setPhaseSteps(templateData.steps || [])
          }
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
  const nextPhase = currentPhaseIndex < phases.length - 1 ? phases[currentPhaseIndex + 1] : null
  const steps = phaseSteps
  const isOnderhoud = project.current_phase === 'onderhoud'

  // Format due date in Dutch
  const formattedDueDate = project.due_date
    ? new Date(project.due_date).toLocaleDateString('nl-NL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <div>
      {/* ============================================ */}
      {/* SECTION 1: White background — Hero / Overview */}
      {/* ============================================ */}
      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          {/* Project name */}
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">
            {project.name}
          </h1>

          {/* Phase content */}
          {phaseContent && (
            <p className="text-gray-500 text-center mt-4 sm:mt-6 leading-relaxed max-w-xl mx-auto text-sm sm:text-base">
              {phaseContent}
            </p>
          )}

          {/* 3 Info cards */}
          {!isOnderhoud && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 sm:mt-10">
              {/* Card 1: Huidige Fase */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
                  {phaseLabels[project.current_phase]}
                </p>
                <div className="bg-primary text-white text-sm font-medium py-2 px-4 rounded-xl">
                  Huidige Fase
                </div>
              </div>

              {/* Card 2: Volgende Fase */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
                  {nextPhase ? phaseLabels[nextPhase] : '—'}
                </p>
                <div className="flex items-center justify-center gap-1.5 text-sm text-gray-400 font-medium">
                  <ArrowRight className="w-4 h-4" />
                  Volgende Fase
                </div>
              </div>

              {/* Card 3: Verwachte Einddatum */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
                  {formattedDueDate || 'Nog onbekend'}
                </p>
                <div className="flex items-center justify-center gap-1.5 text-sm text-gray-400 font-medium">
                  <Calendar className="w-4 h-4" />
                  Verwachte Einddatum
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ============================================ */}
      {/* SECTION 2: Light background — Phase Cards */}
      {/* ============================================ */}
      {!isOnderhoud && (
        <section className="bg-[#f8f7fc] min-h-[400px]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
            {/* Phase title */}
            <h2 className="text-2xl sm:text-3xl font-light text-gray-700 text-center mb-10 sm:mb-12">
              {phaseLabels[project.current_phase]}
            </h2>

            {/* Step cards */}
            {steps.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                {steps.map((step) => {
                  const hasElements = step.elements && step.elements.length > 0

                  return (
                    <div
                      key={step.id}
                      className="relative bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex flex-col"
                    >
                      {/* Completed badge */}
                      {step.completed && (
                        <div className="absolute -top-2.5 -left-2.5 w-7 h-7 bg-accent rounded-full flex items-center justify-center shadow-sm">
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}

                      {/* Card content */}
                      {hasElements ? (
                        // Render block-based elements
                        (() => {
                          const iconElement = step.elements!.find(el => el.type === 'icon')
                          const otherElements = step.elements!.filter(el => el.type !== 'icon')
                          const contentElements = otherElements.filter(el => el.type !== 'button')
                          const buttonElements = otherElements.filter(el => el.type === 'button')
                          return (
                            <div className="flex flex-col flex-1 text-center">
                              <div className="space-y-3">
                                {iconElement && (
                                  <CardElementView key={iconElement.id} element={iconElement} project={project} />
                                )}
                                <h3 className="text-lg font-bold text-gray-900">
                                  {step.title}
                                </h3>
                                {contentElements.map((element) => (
                                  <CardElementView key={element.id} element={element} project={project} />
                                ))}
                              </div>
                              {buttonElements.length > 0 && (
                                <div className="mt-auto pt-4 space-y-2">
                                  {buttonElements.map((element) => (
                                    <CardElementView key={element.id} element={element} project={project} />
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })()
                      ) : (
                        // Legacy: simple title + description
                        <>
                          <h3 className="text-lg font-bold text-gray-900 mt-2 mb-2 text-center">
                            {step.title}
                          </h3>
                          {step.description && (
                            <p className="text-sm text-gray-500 leading-relaxed text-center">
                              {step.description}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-400">Er zijn nog geen stappen ingesteld voor deze fase.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Onderhoud fase — simplified view */}
      {isOnderhoud && (
        <section className="bg-[#f8f7fc]">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center">
            <h2 className="text-2xl sm:text-3xl font-light text-gray-700 mb-4">
              Onderhoud
            </h2>
            <p className="text-gray-500 leading-relaxed">
              Jouw website is live! Wij zorgen voor onderhoud, updates en eventuele aanpassingen.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
