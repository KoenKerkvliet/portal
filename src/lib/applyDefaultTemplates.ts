import { supabase } from './supabase'

interface PhaseTemplate {
  id: string
  phase: string
  content: string | null
  steps: Array<{ id: string; [key: string]: unknown }>
  show_file_footer?: boolean
  show_feedback_footer?: boolean
}

interface PhaseStep {
  id: string
  [key: string]: unknown
}

// Voor een nieuw aangemaakt project: per fase waar exact één template bestaat,
// die template automatisch koppelen door een project_phases-rij aan te maken.
// Faseen met 0 of 2+ templates blijven leeg; admin moet daar zelf kiezen.
export async function applyDefaultTemplates(projectId: string): Promise<void> {
  const { data: templates } = await supabase
    .from('phase_templates')
    .select('id, phase, content, steps, show_file_footer, show_feedback_footer')

  if (!templates || templates.length === 0) return

  const byPhase: Record<string, PhaseTemplate[]> = {}
  for (const t of templates as PhaseTemplate[]) {
    if (!byPhase[t.phase]) byPhase[t.phase] = []
    byPhase[t.phase].push(t)
  }

  const inserts: Array<{
    project_id: string
    phase: string
    template_id: string
    custom_data: {
      content: string
      steps: PhaseStep[]
      show_file_footer: boolean
      show_feedback_footer: boolean
    }
    status: string
  }> = []

  for (const phase of Object.keys(byPhase)) {
    const list = byPhase[phase]
    if (list.length !== 1) continue
    const t = list[0]
    inserts.push({
      project_id: projectId,
      phase,
      template_id: t.id,
      custom_data: {
        content: t.content || '',
        steps: (t.steps || []).map((s) => ({ ...s, id: crypto.randomUUID() })),
        show_file_footer: t.show_file_footer || false,
        show_feedback_footer: t.show_feedback_footer || false,
      },
      status: 'active',
    })
  }

  if (inserts.length > 0) {
    await supabase.from('project_phases').insert(inserts)
  }
}
