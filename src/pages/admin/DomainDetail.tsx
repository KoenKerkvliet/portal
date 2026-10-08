import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Project, ProjectPhase, PhaseTemplate, ProjectClient, Quote, Invoice, Assignment } from '../../types'
import {
  ArrowLeft, ChevronDown, Globe, ExternalLink, FileText, FileCheck, Users, UserPlus, Bell,
  MessageSquare, Ticket, Trash2, Settings, Key, Copy, Archive, ArchiveRestore, Loader2, Info, X,
} from 'lucide-react'
import InlineEdit from '../../components/InlineEdit'
import FieldInput from '../../components/FieldInput'
import HelpTip, { Tooltip } from '../../components/HelpTip'
import PhaseCardsEditor from '../../components/domain/PhaseCardsEditor'
import DomainIntake from '../../components/domain/DomainIntake'
import DomainDesign from '../../components/domain/DomainDesign'
import DomainOnderhoud from '../../components/domain/DomainOnderhoud'
import {
  phases, phaseLabels, phaseColors, phaseDots, withHttps, emptyIntakeLinks, emptyDesignImages,
  type ProjectPhaseInstance, type PhaseCustomData, type IntakeLinks, type DesignImages, type DesignImageKey,
} from '../../components/domain/domainShared'

type NotifyField = 'notify_invoices' | 'notify_quotes' | 'notify_portal' | 'notify_tickets' | 'notify_punch_cards'

const notifyOptions: { field: NotifyField; label: string; help: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { field: 'notify_invoices', label: 'Facturen', icon: FileText,
    help: 'Bij een nieuwe factuur voor dit domein wordt deze klant als ontvanger ingevuld.' },
  { field: 'notify_quotes', label: 'Offertes', icon: FileCheck,
    help: 'Bij een nieuwe offerte voor dit domein wordt deze klant als ontvanger ingevuld.' },
  { field: 'notify_portal', label: 'Portaalmails', icon: Bell,
    help: 'Krijgt een mail als er een design klaarstaat of als je de fase wijzigt zonder "stil bijwerken".' },
  { field: 'notify_tickets', label: 'Tickets', icon: MessageSquare,
    help: 'Krijgt een mail als jij reageert op een ticket.' },
  { field: 'notify_punch_cards', label: 'Strippenkaart', icon: Ticket,
    help: 'Krijgt een mail als er strippen worden afgeschreven.' },
]

const summarize = (instance: ProjectPhaseInstance | undefined) => {
  if (!instance) return 'Niet ingericht'
  const steps = instance.custom_data?.steps || []
  const parts = [`${steps.length} ${steps.length === 1 ? 'card' : 'cards'}`]
  const done = steps.filter(s => s.completed).length
  const hidden = steps.filter(s => s.faded).length
  if (done) parts.push(`${done} voltooid`)
  if (hidden) parts.push(`${hidden} verborgen`)
  return parts.join(' · ')
}

export default function DomainDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [projectClients, setProjectClients] = useState<ProjectClient[]>([])
  const [templates, setTemplates] = useState<PhaseTemplate[]>([])
  const [instances, setInstances] = useState<Partial<Record<ProjectPhase, ProjectPhaseInstance>>>({})
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])

  const [intakeLinks, setIntakeLinks] = useState<IntakeLinks>(emptyIntakeLinks)
  const [savingIntakeLinks, setSavingIntakeLinks] = useState(false)
  const [designImages, setDesignImages] = useState<DesignImages>(emptyDesignImages)
  const [savingDesignImages, setSavingDesignImages] = useState(false)
  const [uploadingDesignImage, setUploadingDesignImage] = useState<DesignImageKey | null>(null)

  const [phaseChangeModal, setPhaseChangeModal] = useState<{ newPhase: ProjectPhase; silent: boolean } | null>(null)
  const [phaseMenuOpen, setPhaseMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [clientMenuOpen, setClientMenuOpen] = useState(false)
  const [openSections, setOpenSections] = useState<Partial<Record<ProjectPhase, boolean>>>({})
  const [dirtyPhases, setDirtyPhases] = useState<Partial<Record<ProjectPhase, boolean>>>({})

  const phaseMenuRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)
  const clientMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (phaseMenuRef.current && !phaseMenuRef.current.contains(e.target as Node)) setPhaseMenuOpen(false)
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false)
      if (clientMenuRef.current && !clientMenuRef.current.contains(e.target as Node)) setClientMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Waarschuwen bij verlaten van de pagina met onopgeslagen fase-wijzigingen
  const hasDirty = Object.values(dirtyPhases).some(Boolean)
  useEffect(() => {
    if (!hasDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasDirty])

  const fetchProject = useCallback(async () => {
    if (!id) return null
    const { data } = await supabase.from('projects').select('*, client:clients(id, name, email)').eq('id', id).maybeSingle()
    setProject(data)
    return data as Project | null
  }, [id])

  const fetchProjectClients = useCallback(async () => {
    if (!id) return
    const { data } = await supabase
      .from('project_clients')
      .select('*, client:clients(id, name, email)')
      .eq('project_id', id)
      .order('created_at')
    setProjectClients(data || [])
  }, [id])

  const fetchInstances = useCallback(async () => {
    const map: Partial<Record<ProjectPhase, ProjectPhaseInstance>> = {}
    if (!id) return map
    const { data } = await supabase.from('project_phases').select('*').eq('project_id', id)
    for (const pi of (data || []) as ProjectPhaseInstance[]) {
      map[pi.phase as ProjectPhase] = pi
    }
    setInstances(map)
    const intake = map.intake?.custom_data
    setIntakeLinks(intake ? {
      quote_id: intake.linked_quote_id || '',
      invoice_id: intake.linked_invoice_id || '',
      assignment_id: intake.linked_assignment_id || '',
    } : emptyIntakeLinks)
    const design = map.design?.custom_data
    setDesignImages(design ? {
      styleguide: design.design_image_styleguide || '',
      homepage: design.design_image_homepage || '',
      tweede: design.design_image_tweede || '',
    } : emptyDesignImages)
    return map
  }, [id])

  const fetchLinkables = useCallback(async () => {
    if (!id) return
    const [{ data: q }, { data: inv }, { data: a }] = await Promise.all([
      supabase.from('quotes').select('*').eq('project_id', id).order('number'),
      supabase.from('invoices').select('*').eq('project_id', id).order('number'),
      supabase.from('assignments').select('*').eq('project_id', id).order('title'),
    ])
    setQuotes(q || [])
    setInvoices(inv || [])
    setAssignments(a || [])
  }, [id])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [loadedProject, loadedInstances] = await Promise.all([
        fetchProject(),
        fetchInstances(),
        fetchProjectClients(),
        fetchLinkables(),
        supabase.from('clients').select('id, name').order('name').then(({ data }) => setClients(data || [])),
        supabase.from('phase_templates').select('*').order('phase').then(({ data }) => setTemplates(data || [])),
      ])
      // Open: de huidige fase en alle fases die al zijn ingericht
      const open: Partial<Record<ProjectPhase, boolean>> = {}
      for (const phase of phases) {
        open[phase] = !!loadedInstances?.[phase] || phase === loadedProject?.current_phase
      }
      setOpenSections(open)
      setLoading(false)
    }
    load()
  }, [fetchProject, fetchInstances, fetchProjectClients, fetchLinkables])

  const handleDirtyChange = useCallback((phase: ProjectPhase, dirty: boolean) => {
    setDirtyPhases(prev => (prev[phase] === dirty ? prev : { ...prev, [phase]: dirty }))
  }, [])

  const reloadInstances = useCallback(async () => { await fetchInstances() }, [fetchInstances])

  const updateProject = async (updates: Partial<Project>) => {
    if (!project) return
    await supabase.from('projects').update(updates).eq('id', project.id)
    await fetchProject()
  }

  const createNotification = useCallback(async (type: string, title: string, message: string, linkUrl?: string) => {
    if (!project?.client_id) {
      console.warn('createNotification: no client_id found for project', project?.id)
      return
    }
    const { error } = await supabase.from('client_notifications').insert({
      project_id: project.id,
      client_id: project.client_id,
      type,
      title,
      message,
      link_url: linkUrl || null,
    })
    if (error) console.error('Error creating notification:', error)
  }, [project?.id, project?.client_id])

  // ── Fase wisselen ──

  const handlePhaseChange = (newPhase: ProjectPhase) => {
    setPhaseMenuOpen(false)
    if (!project || newPhase === project.current_phase) return
    // Beveiligingscheck: zonder bestandsdeling-URL kun je niet verder.
    if (!project.file_sharing_url?.trim()) {
      document.getElementById('algemeen')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      alert('Vul eerst de URL voor bestandsdeling in bij Algemeen — die is nodig voor je het project verder kunt brengen.')
      return
    }
    setPhaseChangeModal({ newPhase, silent: true })
  }

  const confirmPhaseChange = async () => {
    if (!phaseChangeModal || !project) return
    const { newPhase, silent } = phaseChangeModal
    setPhaseChangeModal(null)
    await updateProject({ current_phase: newPhase })
    setOpenSections(prev => ({ ...prev, [newPhase]: true }))
    if (!silent) {
      try {
        const { data, error } = await supabase.functions.invoke('send-phase-change-email', {
          body: { project_id: project.id, new_phase: newPhase },
        })
        if (error || (data && !data.success)) {
          console.error('[PhaseChange] send-phase-change-email failed:', error || data?.error)
        }
      } catch (e) {
        console.error('[PhaseChange] send-phase-change-email exception:', e)
      }
    }
  }

  // ── Klanten ──

  const addClientToProject = async (clientId: string) => {
    if (!project) return
    if (projectClients.some(pc => pc.client_id === clientId)) return
    const isFirst = projectClients.length === 0
    const { error } = await supabase.from('project_clients').insert({
      project_id: project.id,
      client_id: clientId,
      notify_invoices: isFirst,
      notify_quotes: isFirst,
      notify_portal: true,
    })
    if (error) {
      console.error('Error adding client to project:', error)
      await updateProject({ client_id: clientId })
      return
    }
    if (isFirst) await updateProject({ client_id: clientId })
    fetchProjectClients()
  }

  const removeClientFromProject = async (projectClientId: string) => {
    await supabase.from('project_clients').delete().eq('id', projectClientId)
    fetchProjectClients()
  }

  const toggleProjectClientPref = async (pcId: string, field: NotifyField, value: boolean) => {
    await supabase.from('project_clients').update({ [field]: value }).eq('id', pcId)
    fetchProjectClients()
  }

  // ── Archiveren / verwijderen ──

  const handleDelete = async () => {
    if (!project) return
    if (!confirm('Weet je zeker dat je dit domein definitief wilt verwijderen? Deze actie kan niet ongedaan gemaakt worden.')) return
    await supabase.from('projects').delete().eq('id', project.id)
    navigate('/admin/projecten')
  }

  const handleArchive = async () => {
    if (!confirm('Domein archiveren? Het verdwijnt uit het overzicht maar je kunt het later weer terughalen.')) return
    await updateProject({ status: 'archived' })
  }

  // ── Intake-koppelingen ──

  const saveIntakeLinks = async (newLinks: IntakeLinks) => {
    if (!project) return
    const oldLinks = intakeLinks
    setIntakeLinks(newLinks)
    setSavingIntakeLinks(true)
    const instance = instances.intake
    if (instance) {
      const { data: fresh } = await supabase.from('project_phases').select('custom_data').eq('id', instance.id).single()
      const customData: PhaseCustomData = (fresh?.custom_data as PhaseCustomData | null) || instance.custom_data || { content: '', steps: [] }
      const updatedData: PhaseCustomData = {
        ...customData,
        linked_quote_id: newLinks.quote_id || undefined,
        linked_invoice_id: newLinks.invoice_id || undefined,
        linked_assignment_id: newLinks.assignment_id || undefined,
      }

      // Auto-propagate IDs naar knoppen, en unfade de bijbehorende stap automatisch:
      // door iets te koppelen geeft de admin impliciet aan dat de klant het mag zien.
      for (const step of updatedData.steps || []) {
        if (!step.elements) continue
        for (const el of step.elements) {
          if (el.type === 'button' && el.data.action === 'quote' && newLinks.quote_id) {
            el.data.quoteId = newLinks.quote_id
            if (step.faded) step.faded = false
          }
          if (el.type === 'button' && el.data.action === 'invoice' && newLinks.invoice_id) {
            el.data.invoiceId = newLinks.invoice_id
            if (step.faded) step.faded = false
          }
          if (el.type === 'button' && el.data.action === 'assignment' && newLinks.assignment_id) {
            el.data.assignmentId = newLinks.assignment_id
            if (step.faded) step.faded = false
          }
        }
      }

      await supabase.from('project_phases').update({ custom_data: updatedData }).eq('id', instance.id)

      // Auto-set linked quote/invoice to 'sent' if draft (koppelen impliceert verzenden)
      if (newLinks.quote_id) {
        await supabase.from('quotes').update({ status: 'sent' }).eq('id', newLinks.quote_id).eq('status', 'draft')
      }
      if (newLinks.invoice_id) {
        await supabase.from('invoices').update({ status: 'sent' }).eq('id', newLinks.invoice_id).eq('status', 'draft')
      }
      await fetchInstances()
    }

    if (newLinks.quote_id && newLinks.quote_id !== oldLinks.quote_id) {
      const q = quotes.find(q => q.id === newLinks.quote_id)
      createNotification('quote', 'Nieuwe offerte beschikbaar', q ? `Offerte ${q.number} staat voor je klaar.` : 'Er is een offerte voor je klaargezet.', `/offerte/${newLinks.quote_id}`)
      // Branded mail naar de klant via EmailIt — non-blocking, fouten loggen we alleen.
      try {
        const { data, error } = await supabase.functions.invoke('send-quote-email', { body: { quote_id: newLinks.quote_id } })
        if (error || (data && !data.success)) console.error('[IntakeLinks] send-quote-email failed:', error || data?.error)
      } catch (e) {
        console.error('[IntakeLinks] send-quote-email exception:', e)
      }
    }
    if (newLinks.invoice_id && newLinks.invoice_id !== oldLinks.invoice_id) {
      createNotification('invoice', 'Nieuwe factuur beschikbaar', 'Er is een factuur voor je klaargezet.')
      try {
        const { data, error } = await supabase.functions.invoke('send-invoice-email', { body: { invoice_id: newLinks.invoice_id } })
        if (error || (data && !data.success)) console.error('[IntakeLinks] send-invoice-email failed:', error || data?.error)
      } catch (e) {
        console.error('[IntakeLinks] send-invoice-email exception:', e)
      }
    }
    if (newLinks.assignment_id && newLinks.assignment_id !== oldLinks.assignment_id) {
      const a = assignments.find(a => a.id === newLinks.assignment_id)
      createNotification('assignment', 'Nieuwe opdracht beschikbaar', a ? `Opdracht "${a.title}" staat voor je klaar.` : 'Er is een opdrachtomschrijving voor je klaargezet.', `/opdracht/${newLinks.assignment_id}`)
    }

    setSavingIntakeLinks(false)
  }

  // ── Design-afbeeldingen ──

  const saveDesignImages = async (imgs: DesignImages) => {
    if (!project) return
    setSavingDesignImages(true)
    const instance = instances.design

    // Design-fase aanmaken als die nog niet bestaat
    if (!instance) {
      await supabase.from('project_phases').insert({
        project_id: project.id,
        phase: 'design',
        template_id: null,
        custom_data: {
          content: '',
          steps: [],
          design_image_styleguide: imgs.styleguide,
          design_image_homepage: imgs.homepage,
          design_image_tweede: imgs.tweede,
        },
        status: 'active',
      })
      await fetchInstances()
      setSavingDesignImages(false)
      return
    }

    // Vers ophalen om te voorkomen dat we approvals van de klant overschrijven
    const { data: freshPhase } = await supabase.from('project_phases').select('custom_data').eq('id', instance.id).single()
    const customData: PhaseCustomData = (freshPhase?.custom_data as PhaseCustomData | null) || instance.custom_data || { content: '', steps: [] }

    // Reset declined approvals when new image is saved for that field
    const updatedApprovals = { ...(customData.design_approvals || {}) }
    const fieldToType: Record<DesignImageKey, string> = { styleguide: 'styleguide', homepage: 'homepage', tweede: 'contactpage' }
    const fieldToLabel: Record<DesignImageKey, string> = { styleguide: 'Styleguide', homepage: 'Homepage', tweede: 'Contactpagina' }
    const oldImages: DesignImages = {
      styleguide: customData.design_image_styleguide || '',
      homepage: customData.design_image_homepage || '',
      tweede: customData.design_image_tweede || '',
    }
    for (const field of Object.keys(fieldToType) as DesignImageKey[]) {
      const approvalType = fieldToType[field]
      const hasNewImage = !!imgs[field]?.trim()
      const hadOldImage = !!oldImages[field]?.trim()
      const imageChanged = imgs[field] !== oldImages[field]

      if (hasNewImage && updatedApprovals[approvalType]?.status === 'declined') {
        updatedApprovals[approvalType] = { status: 'new_version' }
        createNotification('card_update', `Nieuwe versie: ${fieldToLabel[field]}`, `Er is een nieuwe versie van het design "${fieldToLabel[field]}" beschikbaar op basis van je feedback.`, `/design/${approvalType}/${project.id}`)
        // Branded mail naar de klant via EmailIt — non-blocking, fouten loggen we alleen.
        void supabase.functions.invoke('send-design-ready-email', {
          body: { project_id: project.id, design_type: approvalType, is_new_version: true },
        }).then(({ data, error }) => {
          if (error || (data && !data.success)) console.error('[Design] send-design-ready-email failed:', error || data?.error)
        }).catch(e => console.error('[Design] send-design-ready-email exception:', e))
      } else if (hasNewImage && !hadOldImage && imageChanged) {
        createNotification('card_update', `Design beschikbaar: ${fieldToLabel[field]}`, `Het design "${fieldToLabel[field]}" staat klaar voor je beoordeling.`, `/design/${approvalType}/${project.id}`)
        void supabase.functions.invoke('send-design-ready-email', {
          body: { project_id: project.id, design_type: approvalType, is_new_version: false },
        }).then(({ data, error }) => {
          if (error || (data && !data.success)) console.error('[Design] send-design-ready-email failed:', error || data?.error)
        }).catch(e => console.error('[Design] send-design-ready-email exception:', e))
      }
    }

    const updatedData: PhaseCustomData = {
      ...customData,
      design_image_styleguide: imgs.styleguide,
      design_image_homepage: imgs.homepage,
      design_image_tweede: imgs.tweede,
      design_approvals: updatedApprovals,
    }
    await supabase.from('project_phases').update({ custom_data: updatedData }).eq('id', instance.id)

    // Auto-fade/unfade steps with design preview buttons
    const actionToImage: Record<string, string> = {
      styleguide: imgs.styleguide,
      homepage: imgs.homepage,
      contactpage: imgs.tweede,
    }
    for (const phase of phases) {
      const isDesign = phase === 'design'
      const phaseCustomData = isDesign ? updatedData : instances[phase]?.custom_data
      const phaseId = isDesign ? instance.id : instances[phase]?.id
      if (!phaseCustomData?.steps || !phaseId) continue
      let changed = false
      for (const step of phaseCustomData.steps) {
        if (!step.elements) continue
        for (const el of step.elements) {
          if (el.type === 'button' && el.data.action in actionToImage) {
            const hasImage = !!actionToImage[el.data.action]?.trim()
            if (hasImage && step.faded) {
              step.faded = false
              changed = true
            } else if (!hasImage && !step.faded) {
              step.faded = true
              changed = true
            }
          }
        }
      }
      if (changed) {
        await supabase.from('project_phases').update({ custom_data: phaseCustomData }).eq('id', phaseId)
      }
    }

    await fetchInstances()
    setSavingDesignImages(false)
  }

  const uploadDesignImage = async (key: DesignImageKey, file: File) => {
    if (!project) return
    setUploadingDesignImage(key)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${project.id}/${key}_${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('design-images').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('design-images').getPublicUrl(path)
      const next = { ...designImages, [key]: urlData.publicUrl }
      setDesignImages(next)
      await saveDesignImages(next)
    } catch (err) {
      console.error('Upload error:', err)
      alert('Upload mislukt. Controleer of de storage bucket "design-images" bestaat.')
    } finally {
      setUploadingDesignImage(null)
    }
  }

  const removeDesignImage = async (key: DesignImageKey) => {
    const next = { ...designImages, [key]: '' }
    setDesignImages(next)
    await saveDesignImages(next)
  }

  // ── Weergave ──

  const scrollToSection = (sectionId: string, phase?: ProjectPhase) => {
    if (phase) setOpenSections(prev => ({ ...prev, [phase]: true }))
    setTimeout(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
        <h3 className="text-lg font-medium text-gray-900">Domein niet gevonden</h3>
        <Link to="/admin/projecten" className="inline-flex items-center gap-1.5 text-sm text-primary mt-3">
          <ArrowLeft className="w-4 h-4" />
          Terug naar domeinen
        </Link>
      </div>
    )
  }

  const isArchived = (project.status || 'active') === 'archived'
  const availableClients = clients.filter(c => !projectClients.some(pc => pc.client_id === c.id))

  return (
    <div className="space-y-5">
      {/* ── Kop ── */}
      <div>
        <Link to="/admin/projecten" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-3">
          <ArrowLeft className="w-4 h-4" />
          Domeinen
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <InlineEdit value={project.name} onSave={(name) => updateProject({ name })} displayValue={project.name} placeholder="Domeinnaam"
              textClassName="text-xl sm:text-2xl font-bold text-gray-900" />
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {project.url && (
                <a href={project.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-primary hover:text-primary-600 transition-colors min-w-0">
                  <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{project.url.replace(/^https?:\/\//, '')}</span>
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
              )}
              {isArchived && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Gearchiveerd</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative" ref={phaseMenuRef}>
              <button onClick={() => setPhaseMenuOpen(!phaseMenuOpen)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium hover:opacity-80 transition-opacity ${phaseColors[project.current_phase]}`}
                title="Fase die de klant ziet">
                {phaseLabels[project.current_phase]}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {phaseMenuOpen && (
                <div className="absolute top-full right-0 mt-1.5 bg-white rounded-xl shadow-xl shadow-gray-200/50 border border-gray-100 py-1 z-50 min-w-[200px]">
                  <p className="px-3.5 pt-1.5 pb-1 text-[10px] font-medium text-gray-400 uppercase tracking-wider">Fase voor de klant</p>
                  {phases.map((phase) => (
                    <button key={phase} onClick={() => handlePhaseChange(phase)}
                      className={`flex items-center gap-2.5 w-full px-3.5 py-2 text-sm transition-colors ${phase === project.current_phase ? 'bg-gray-50 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${phase === project.current_phase ? 'bg-primary' : 'bg-gray-300'}`} />
                      {phaseLabels[phase]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative" ref={settingsRef}>
              <button onClick={() => setSettingsOpen(!settingsOpen)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" title="Instellingen">
                <Settings className="w-4 h-4" />
              </button>
              {settingsOpen && (
                <div className="absolute top-full right-0 mt-1.5 bg-white rounded-xl shadow-xl shadow-gray-200/50 border border-gray-100 py-1 z-50 min-w-[240px]">
                  <div className="px-3.5 py-2.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Key className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">API Key</span>
                    </div>
                    {project.api_key ? (
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs text-gray-500 font-mono truncate flex-1">{project.api_key}</code>
                        <button onClick={() => { navigator.clipboard.writeText(project.api_key!) }}
                          className="p-1 text-gray-400 hover:text-primary rounded hover:bg-primary/5 transition-colors" title="Kopieer">
                          <Copy className="w-3 h-3" />
                        </button>
                        <button onClick={() => { if (confirm('API key verwijderen?')) updateProject({ api_key: null }) }}
                          className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors" title="Verwijderen">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => updateProject({ api_key: crypto.randomUUID() })}
                        className="text-[11px] text-primary hover:text-primary/80 font-medium transition-colors">
                        Genereer API key
                      </button>
                    )}
                  </div>
                  <div className="border-t border-gray-100 my-1" />
                  {isArchived ? (
                    <button onClick={() => { setSettingsOpen(false); updateProject({ status: 'active' }) }}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-green-700 hover:bg-green-50 transition-colors">
                      <ArchiveRestore className="w-4 h-4" />
                      Herstellen
                    </button>
                  ) : (
                    <button onClick={() => { setSettingsOpen(false); handleArchive() }}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                      <Archive className="w-4 h-4" />
                      Archiveren
                    </button>
                  )}
                  <button onClick={() => { setSettingsOpen(false); handleDelete() }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                    {isArchived ? 'Definitief verwijderen' : 'Verwijderen'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Snelnavigatie */}
        <div className="flex items-center gap-1.5 mt-4 overflow-x-auto pb-1">
          <button onClick={() => scrollToSection('algemeen')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:border-gray-300 transition-colors whitespace-nowrap">
            Algemeen
          </button>
          {phases.map((phase) => (
            <button key={phase} onClick={() => scrollToSection(`fase-${phase}`, phase)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                phase === project.current_phase ? `${phaseColors[phase]} border-transparent` : 'text-gray-600 bg-white border-gray-200 hover:border-gray-300'
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${instances[phase] ? phaseDots[phase] : 'bg-gray-300'}`} />
              {phaseLabels[phase]}
              {dirtyPhases[phase] && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Niet opgeslagen" />}
            </button>
          ))}
        </div>
      </div>

      {/* ── Algemeen ── */}
      <section id="algemeen" className="bg-white rounded-xl shadow-sm border border-gray-100 scroll-mt-4">
        <div className="px-5 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Algemeen</h2>
        </div>
        <div className="px-5 sm:px-6 py-4 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            <FieldInput label="Website" type="url" placeholder="https://voorbeeld.nl" linkable
              value={project.url || ''} onSave={(v) => updateProject({ url: withHttps(v) })}
              help="Het adres van de live website. Alleen voor jouw overzicht, de klant ziet dit niet." />
            <FieldInput label="Bestanden delen" type="url" placeholder="https://..." linkable helpAlign="right"
              value={project.file_sharing_url || ''} onSave={(v) => updateProject({ file_sharing_url: withHttps(v) })}
              help="Link naar een gedeelde map (bijv. Google Drive) waar de klant bestanden kan aanleveren. Verschijnt onderaan het klantportaal als 'Bestanden delen footer' aanstaat bij een fase. Verplicht voordat je de fase kunt wijzigen."
              hint={!project.file_sharing_url && <span className="text-amber-600">Nodig om de fase te kunnen wijzigen.</span>} />
            <FieldInput label="Factuurnaam" placeholder="Leeg = naam van de klant"
              value={project.invoice_name || ''} onSave={(v) => updateProject({ invoice_name: v.trim() || null })}
              help="Alleen invullen als facturen voor dit domein op een andere naam moeten dan die van de klant, bijv. een bedrijf of vereniging. Wordt ingevuld bij elke nieuwe factuur voor dit domein; bestaande facturen veranderen niet." />
            <FieldInput label="Factuur-e-mail" type="email" placeholder="Leeg = e-mail van de klant" helpAlign="right"
              value={project.invoice_email || ''} onSave={(v) => updateProject({ invoice_email: v.trim() || null })}
              help="Alleen invullen als facturen voor dit domein naar een ander adres moeten, bijv. de penningmeester of administratie. Nieuwe facturen en herinneringen gaan dan naar dit adres; bestaande facturen veranderen niet." />
          </div>

          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Klanten</span>
                <HelpTip text="Klanten die bij dit domein horen en kunnen inloggen in het portaal. Met de icoontjes rechts bepaal je per klant welke mails en rollen die krijgt; ga erop staan voor uitleg." />
              </div>
              <div className="relative" ref={clientMenuRef}>
                <button onClick={() => setClientMenuOpen(!clientMenuOpen)}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-primary transition-colors">
                  <UserPlus className="w-3.5 h-3.5" />
                  Klant toevoegen
                </button>
                {clientMenuOpen && (
                  <div className="absolute top-full right-0 mt-1.5 bg-white rounded-xl shadow-xl shadow-gray-200/50 border border-gray-100 py-1 z-50 min-w-[200px] max-h-72 overflow-y-auto">
                    {availableClients.map((c) => (
                      <button key={c.id} onClick={() => { addClientToProject(c.id); setClientMenuOpen(false) }}
                        className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                        <UserPlus className="w-3.5 h-3.5 text-gray-400" />
                        {c.name}
                      </button>
                    ))}
                    {availableClients.length === 0 && (
                      <p className="px-3.5 py-2 text-xs text-gray-400 italic">Alle klanten al gekoppeld</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="border border-gray-200 rounded-md divide-y divide-gray-100">
              {projectClients.length === 0 && project.client_id && (
                <div className="bg-amber-50 px-3 py-2 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-700 flex-1 truncate">{(project.client as unknown as { name: string })?.name || 'Onbekend'}</span>
                  <button onClick={() => addClientToProject(project.client_id!)}
                    className="text-xs text-primary hover:text-primary-600 font-medium whitespace-nowrap">
                    Activeer
                  </button>
                </div>
              )}
              {projectClients.length === 0 && !project.client_id && (
                <p className="px-3 py-2 text-xs text-gray-400">Nog geen klant gekoppeld.</p>
              )}
              {projectClients.map((pc) => {
                const clientName = (pc.client as unknown as { name: string })?.name || 'Onbekend'
                const clientEmail = (pc.client as unknown as { email: string })?.email || ''
                return (
                  <div key={pc.id} className="flex items-center gap-3 px-3 py-1.5 flex-wrap sm:flex-nowrap">
                    <div className="flex-1 min-w-0 flex items-baseline gap-2">
                      <span className="text-sm font-medium text-gray-800 truncate">{clientName}</span>
                      <span className="text-xs text-gray-400 truncate">{clientEmail}</span>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {notifyOptions.map(({ field, label, help, icon: Icon }) => (
                        <Tooltip key={field} text={`${label} — ${pc[field] ? 'aan' : 'uit'}. ${help}`} align="right">
                          <button type="button" aria-pressed={pc[field]} aria-label={label}
                            onClick={() => toggleProjectClientPref(pc.id, field, !pc[field])}
                            className={`p-1.5 rounded-md transition-colors ${pc[field] ? 'text-primary bg-primary/10 hover:bg-primary/15' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      ))}
                      <span className="w-px h-4 bg-gray-200 mx-1" />
                      <Tooltip text="Ontkoppel deze klant van het domein. De klant zelf blijft bestaan." align="right">
                        <button type="button" aria-label={`${clientName} ontkoppelen`}
                          onClick={() => { if (confirm(`${clientName} verwijderen van dit domein?`)) removeClientFromProject(pc.id) }}
                          className="p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Fases ── */}
      {phases.map((phase) => {
        const instance = instances[phase]
        const isOpen = !!openSections[phase]
        const isCurrent = phase === project.current_phase
        return (
          <section key={phase} id={`fase-${phase}`}
            className={`bg-white rounded-xl shadow-sm border scroll-mt-4 ${isCurrent ? 'border-primary/30 ring-1 ring-primary/10' : 'border-gray-100'}`}>
            <button onClick={() => setOpenSections(prev => ({ ...prev, [phase]: !isOpen }))}
              className="w-full px-5 sm:px-6 py-4 flex items-center gap-3 text-left hover:bg-gray-50/60 transition-colors rounded-xl">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${phaseDots[phase]}`} />
              <h2 className="text-sm font-semibold text-gray-900">{phaseLabels[phase]}</h2>
              {isCurrent && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${phaseColors[phase]}`}>Huidige fase</span>
              )}
              {dirtyPhases[phase] && (
                <span className="text-[11px] font-medium text-amber-600">Niet opgeslagen</span>
              )}
              <span className={`ml-auto hidden sm:block text-xs whitespace-nowrap ${instance ? 'text-gray-500' : 'text-gray-400 italic'}`}>{summarize(instance)}</span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 max-sm:ml-auto ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Ingeklapt blijven de editors gemount, zodat onopgeslagen wijzigingen niet verloren gaan */}
            <div className={isOpen ? 'border-t border-gray-100 px-5 sm:px-6 py-5 space-y-6' : 'hidden'}>
              {phase === 'intake' && (
                <DomainIntake
                  project={project}
                  instance={instance || null}
                  links={intakeLinks}
                  quotes={quotes}
                  invoices={invoices}
                  assignments={assignments}
                  saving={savingIntakeLinks}
                  onChangeLinks={saveIntakeLinks}
                  updateProject={updateProject}
                />
              )}
              {phase === 'design' && (
                <DomainDesign
                  instance={instance || null}
                  images={designImages}
                  uploadingKey={uploadingDesignImage}
                  saving={savingDesignImages}
                  onUpload={uploadDesignImage}
                  onRemove={removeDesignImage}
                />
              )}
              {phase === 'development' && (
                <div className="max-w-md">
                  <FieldInput label="Stagingsite" type="url" placeholder="https://staging..." linkable
                    value={project.staging_url || ''} onSave={(v) => updateProject({ staging_url: withHttps(v) })}
                    help="Testomgeving waar je de site bouwt voordat hij live gaat. Alleen voor jouw overzicht, de klant ziet dit niet." />
                </div>
              )}
              {phase === 'onderhoud' && <DomainOnderhoud projectId={project.id} />}

              <div className={phase === 'oplevering' ? '' : 'pt-5 border-t border-gray-100'}>
                {phase !== 'oplevering' && (
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    <Info className="w-3.5 h-3.5" />
                    Klantportaal
                  </h3>
                )}
                <PhaseCardsEditor
                  projectId={project.id}
                  phase={phase}
                  instance={instance || null}
                  templates={templates.filter(t => t.phase === phase)}
                  intakeLinks={phase === 'intake' ? intakeLinks : undefined}
                  onChanged={reloadInstances}
                  onDirtyChange={handleDirtyChange}
                />
              </div>
            </div>
          </section>
        )
      })}

      {/* Fase-wissel bevestiging */}
      {phaseChangeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Fase wijzigen</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-700">
                Fase van <strong>{project.name}</strong> wijzigen van{' '}
                <strong>{phaseLabels[project.current_phase]}</strong> naar{' '}
                <strong>{phaseLabels[phaseChangeModal.newPhase]}</strong>?
              </p>
              <div className={`rounded-lg px-3 py-2 text-xs ${phaseChangeModal.silent ? 'bg-gray-50 text-gray-500' : 'bg-blue-50 text-blue-700'}`}>
                {phaseChangeModal.silent
                  ? 'Klant wordt NIET via mail geïnformeerd.'
                  : 'Klant ontvangt automatisch een mail over de nieuwe fase.'}
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input type="checkbox" checked={phaseChangeModal.silent}
                  onChange={(e) => setPhaseChangeModal({ ...phaseChangeModal, silent: e.target.checked })}
                  className="w-4 h-4 rounded text-primary focus:ring-primary/30" />
                Stil bijwerken — geen mail naar klant
              </label>
            </div>
            <div className="flex justify-end gap-2 p-6 border-t border-gray-100">
              <button type="button" onClick={() => setPhaseChangeModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                Annuleren
              </button>
              <button type="button" onClick={confirmPhaseChange}
                className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-600 rounded-lg transition-colors">
                Wijzig fase
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
