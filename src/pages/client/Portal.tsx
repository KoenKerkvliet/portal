import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Project, ProjectPhase, PhaseTemplate } from '../../types'
import { Sparkles, ArrowRight, Calendar } from 'lucide-react'

const phases: ProjectPhase[] = ['intake', 'design', 'development', 'oplevering', 'onderhoud']

const phaseLabels: Record<ProjectPhase, string> = {
  intake: 'Intake',
  design: 'Design',
  development: 'Development',
  oplevering: 'Oplevering',
  onderhoud: 'Onderhoud',
}

export default function ClientPortal() {
  const { profile } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [template, setTemplate] = useState<PhaseTemplate | null>(null)
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
        .select('*')
        .eq('client_id', client.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (projectData) {
        setProject(projectData)

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
  const nextPhase = currentPhaseIndex < phases.length - 1 ? phases[currentPhaseIndex + 1] : null
  const steps = template?.steps || []
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

          {/* Template description */}
          {(template?.content || template?.description) && (
            <p className="text-gray-500 text-center mt-4 sm:mt-6 leading-relaxed max-w-xl mx-auto text-sm sm:text-base">
              {template.content || template.description}
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
      {/* SECTION 2: Light background — Phase Steps/Cards */}
      {/* Only for non-onderhoud phases */}
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
                {steps.map((step) => (
                  <div
                    key={step.id}
                    className="relative bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 text-center hover:shadow-md transition-shadow"
                  >
                    {/* Completed badge */}
                    {step.completed && (
                      <div className="absolute -top-2.5 -left-2.5 w-7 h-7 bg-accent rounded-full flex items-center justify-center shadow-sm">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}

                    {/* Step title */}
                    <h3 className="text-lg font-bold text-gray-900 mt-2 mb-2">
                      {step.title}
                    </h3>

                    {/* Step description */}
                    {step.description && (
                      <p className="text-sm text-gray-500 leading-relaxed mb-6">
                        {step.description}
                      </p>
                    )}
                  </div>
                ))}
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
