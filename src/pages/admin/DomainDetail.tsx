import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { Project, ProjectPhase, ProjectClient, Quote, Invoice, Assignment } from '../../types'
import {
  ArrowLeft, ChevronDown, Globe, ExternalLink, FileText, FileCheck, Users, UserPlus, Bell,
  MessageSquare, Ticket, Trash2, Settings, Key, Copy, Archive, ArchiveRestore, Loader2, X, Plus,
} from 'lucide-react'
import InlineEdit from '../../components/InlineEdit'
import FieldInput from '../../components/FieldInput'
import HelpTip, { Tooltip } from '../../components/HelpTip'
import DomainPortalAccess from '../../components/domain/DomainPortalAccess'
import DomainIntake, { type IntakeDocKind } from '../../components/domain/DomainIntake'
import DomainForms from '../../components/domain/DomainForms'
import DomainPrivacy from '../../components/domain/DomainPrivacy'
import DomainActivity from '../../components/domain/DomainActivity'
import DomainDesign from '../../components/domain/DomainDesign'
import LinkMailField from '../../components/domain/LinkMailField'
import DomainOplevering, { type DeliveryKind } from '../../components/domain/DomainOplevering'
import DomainOnderhoud from '../../components/domain/DomainOnderhoud'
import {
  phases, phaseLabels, phaseColors, phaseDots, withHttps, emptyIntakeLinks, emptyDesignImages, designFields,
  workdaysFromToday, todayDate, DESIGN_FEEDBACK_WORKDAYS, designVersionMailed,
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

const emptyNewClient = { name: '', email: '', phone: '', company: '' }

type MailResult ={ success: true; sent_to: string | string[]; pdf_attached?: boolean; sent_at?: string | null }

// Roept een mail-Edge Function aan en geeft de data terug, of een leesbare foutmelding.
// Met viaPortalRecipients: mails naar klanten met 'Portaalmails' aan; niemand = fout.
async function invokeMail(fn: string, body: Record<string, unknown>, viaPortalRecipients = false): Promise<{ data: MailResult | null; failure: string }> {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) {
    let failure = 'Versturen mislukt.'
    if (error instanceof FunctionsHttpError) {
      try { failure = (await error.context.json())?.error || failure } catch { /* standaardmelding */ }
    }
    return { data: null, failure }
  }
  if (!data?.success) return { data: null, failure: data?.error || 'Versturen mislukt.' }
  if (viaPortalRecipients && ![data.sent_to].flat().filter(Boolean).length) {
    return { data: null, failure: "er is geen klant met 'Portaalmails' aan. Zet dat aan bij een klant onder Algemeen." }
  }
  return { data: data as MailResult, failure: '' }
}

export default function DomainDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [projectClients, setProjectClients] = useState<ProjectClient[]>([])
  const [generalTab, setGeneralTab] = useState<'gegevens' | 'privacy' | 'activiteit'>('gegevens')
  const [newClientOpen, setNewClientOpen] = useState(false)
  const [newClient, setNewClient] = useState(emptyNewClient)
  const [newClientError, setNewClientError] = useState('')
  const [savingNewClient, setSavingNewClient] = useState(false)
  const [instances, setInstances] = useState<Partial<Record<ProjectPhase, ProjectPhaseInstance>>>({})
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])

  const [intakeLinks, setIntakeLinks] = useState<IntakeLinks>(emptyIntakeLinks)
  const [savingIntakeLinks, setSavingIntakeLinks] = useState(false)
  const [sendingKind, setSendingKind] = useState<IntakeDocKind | null>(null)
  const [sendResults, setSendResults] = useState<Partial<Record<IntakeDocKind, string>>>({})
  const [designImages, setDesignImages] = useState<DesignImages>(emptyDesignImages)
  const [savingDesignImages, setSavingDesignImages] = useState(false)
  const [uploadingDesignImage, setUploadingDesignImage] = useState<DesignImageKey | null>(null)
  const [sendingDesign, setSendingDesign] = useState<DesignImageKey | null>(null)
  const [designSendResults, setDesignSendResults] = useState<Partial<Record<DesignImageKey, string>>>({})
  const [sendingStaging, setSendingStaging] = useState(false)
  const [stagingSendResult, setStagingSendResult] = useState<string | undefined>()
  const [sendingFiles, setSendingFiles] = useState(false)
  const [filesSendResult, setFilesSendResult] = useState<string | undefined>()
  const [sendingMeeting, setSendingMeeting] = useState(false)
  const [meetingSendResult, setMeetingSendResult] = useState<string | undefined>()
  const [reviewUrl, setReviewUrl] = useState<string | null>(null)
  const [savingOplevering, setSavingOplevering] = useState(false)
  const [sendingDelivery, setSendingDelivery] = useState<DeliveryKind | null>(null)
  const [deliverySendResults, setDeliverySendResults] = useState<Partial<Record<DeliveryKind, string>>>({})

  const [phaseChangeModal, setPhaseChangeModal] = useState<{ newPhase: ProjectPhase; silent: boolean } | null>(null)
  const [phaseMenuOpen, setPhaseMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [clientMenuOpen, setClientMenuOpen] = useState(false)
  const [openSections, setOpenSections] = useState<Partial<Record<ProjectPhase, boolean>>>({})

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
        supabase.from('invoice_settings').select('review_url').limit(1).maybeSingle().then(({ data }) => setReviewUrl(data?.review_url || null)),
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

  const updateProject = async (updates: Partial<Project>) => {
    if (!project) return
    await supabase.from('projects').update(updates).eq('id', project.id)
    await fetchProject()
  }

  // ── Fase wisselen ──

  const handlePhaseChange = (newPhase: ProjectPhase) => {
    setPhaseMenuOpen(false)
    if (!project || newPhase === project.current_phase) return
    // Naar development (vanuit een eerdere fase) standaard wél mailen: de klant moet
    // weten dat het rustiger wordt, maar dat er hard gewerkt wordt. Overige wissels stil.
    const toDevelopment = newPhase === 'development' && phases.indexOf(project.current_phase) < phases.indexOf('development')
    setPhaseChangeModal({ newPhase, silent: !toDevelopment })
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

  // Nieuwe klant aanmaken en meteen aan dit domein koppelen. Er gaat geen mail uit:
  // een portaaluitnodiging blijft een aparte actie op de klantenpagina.
  const createClientForProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!project) return
    setSavingNewClient(true)
    setNewClientError('')
    const { data, error } = await supabase.from('clients').insert({
      name: newClient.name.trim(),
      email: newClient.email.trim(),
      email_extra: [],
      phone: newClient.phone.trim() || null,
      company: newClient.company.trim() || null,
    }).select('id, name').single()
    if (error || !data) {
      setNewClientError('Klant aanmaken mislukt: ' + (error?.message || 'onbekende fout'))
      setSavingNewClient(false)
      return
    }
    setClients(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    await addClientToProject(data.id)
    setSavingNewClient(false)
    setNewClientOpen(false)
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

  // Koppelen legt alleen vast welke opdracht/offerte/factuur bij dit domein hoort.
  // Er gaat niets naar de klant en de status verandert niet; dat doet 'Mail sturen'.
  const saveIntakeLinks = async (newLinks: IntakeLinks) => {
    if (!project) return
    setIntakeLinks(newLinks)
    setSavingIntakeLinks(true)
    const instance = instances.intake
    if (!instance) {
      // Koppelingen worden in de intake-fase bewaard; maak die aan als hij nog niet bestaat
      await supabase.from('project_phases').insert({
        project_id: project.id,
        phase: 'intake',
        template_id: null,
        custom_data: {
          content: '',
          steps: [],
          linked_quote_id: newLinks.quote_id || undefined,
          linked_invoice_id: newLinks.invoice_id || undefined,
          linked_assignment_id: newLinks.assignment_id || undefined,
        },
        status: 'active',
      })
      await fetchInstances()
    } else {
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
      await fetchInstances()
    }

    setSavingIntakeLinks(false)
  }

  // Bewust versturen: de klant krijgt een mail met een link zonder inloggen
  // (bij een factuur ook de PDF). De Edge Function legt 'gemaild op' vast en zet
  // een concept op 'verzonden'.
  const sendIntakeDocument = async (kind: IntakeDocKind) => {
    const config = {
      assignment: { fn: 'send-assignment-email', idKey: 'assignment_id', id: intakeLinks.assignment_id, label: 'De opdracht', doc: assignments.find(a => a.id === intakeLinks.assignment_id) },
      quote: { fn: 'send-quote-email', idKey: 'quote_id', id: intakeLinks.quote_id, label: 'De offerte', doc: quotes.find(q => q.id === intakeLinks.quote_id) },
      invoice: { fn: 'send-invoice-email', idKey: 'invoice_id', id: intakeLinks.invoice_id, label: 'De factuur', doc: invoices.find(i => i.id === intakeLinks.invoice_id) },
    }[kind]
    if (!config.id || !config.doc) return

    const what = kind === 'assignment' ? `opdracht "${(config.doc as Assignment).title}"` : `${kind === 'quote' ? 'offerte' : 'factuur'} ${(config.doc as Quote | Invoice).number}`
    const again = config.doc.last_sent_at ? `\n\nLet op: deze is al eerder gemaild op ${new Date(config.doc.last_sent_at).toLocaleString('nl-NL')}.` : ''
    if (!confirm(`De ${what} nu naar de klant mailen?${again}`)) return

    setSendingKind(kind)
    setSendResults(prev => ({ ...prev, [kind]: undefined }))
    const { data, failure } = await invokeMail(config.fn, { [config.idKey]: config.id })
    setSendingKind(null)
    if (!data) {
      alert(`${config.label} is niet verstuurd: ${failure}`)
      return
    }
    const pdfNote = kind === 'invoice' ? (data.pdf_attached ? ' (met PDF)' : ' (zonder PDF — alleen de link)') : ''
    setSendResults(prev => ({ ...prev, [kind]: `Gemaild naar ${[data.sent_to].flat().join(', ')}${pdfNote}` }))
    await fetchLinkables()
  }

  // ── Design-afbeeldingen ──

  const saveDesignImages = async (imgs: DesignImages) => {
    if (!project) return
    setSavingDesignImages(true)
    const instance = instances.design

    const fieldToType: Record<DesignImageKey, string> = { styleguide: 'styleguide', homepage: 'homepage', tweede: 'contactpage' }

    // Design-fase aanmaken als die nog niet bestaat
    if (!instance) {
      const deadlines: Record<string, string> = {}
      for (const field of Object.keys(fieldToType) as DesignImageKey[]) {
        if (imgs[field]?.trim()) deadlines[fieldToType[field]] = workdaysFromToday(DESIGN_FEEDBACK_WORKDAYS)
      }
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
          design_deadlines: deadlines,
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

    // Beoordelingen bijwerken voor designs die een nieuwe afbeelding krijgen
    const updatedApprovals = { ...(customData.design_approvals || {}) }
    const updatedDeadlines = { ...(customData.design_deadlines || {}) }
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

      // Reactietermijn: elke (nieuwe) upload krijgt standaard 5 werkdagen, daarna aan te passen
      if (hasNewImage && imageChanged) updatedDeadlines[approvalType] = workdaysFromToday(DESIGN_FEEDBACK_WORKDAYS)
      if (!hasNewImage) delete updatedDeadlines[approvalType]

      // Uploaden is stil: de klant krijgt pas iets via 'Mail sturen'.
      if (hasNewImage && imageChanged) {
        if (!hadOldImage) {
          // Nieuwe afbeelding op een leeg vak: nog geen beoordeling
          delete updatedApprovals[approvalType]
        } else if (updatedApprovals[approvalType]?.status) {
          // Vervangen na een beoordeling: de klant moet de nieuwe versie opnieuw beoordelen
          updatedApprovals[approvalType] = { status: 'new_version' }
        }
      }
    }

    const updatedData: PhaseCustomData = {
      ...customData,
      design_image_styleguide: imgs.styleguide,
      design_image_homepage: imgs.homepage,
      design_image_tweede: imgs.tweede,
      design_approvals: updatedApprovals,
      design_deadlines: updatedDeadlines,
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

  // Reactiedatum van één design aanpassen (vers ophalen: de klant kan intussen gereageerd hebben)
  const saveDesignDeadline = async (key: DesignImageKey, date: string) => {
    const instance = instances.design
    const field = designFields.find(f => f.key === key)
    if (!instance || !field) return
    const { data: freshPhase } = await supabase.from('project_phases').select('custom_data').eq('id', instance.id).single()
    const customData: PhaseCustomData = (freshPhase?.custom_data as PhaseCustomData | null) || instance.custom_data || {}
    const deadlines = { ...(customData.design_deadlines || {}) }
    if (date) deadlines[field.approvalType] = date
    else delete deadlines[field.approvalType]
    await supabase.from('project_phases').update({ custom_data: { ...customData, design_deadlines: deadlines } }).eq('id', instance.id)
    await fetchInstances()
  }

  const removeDesignImage = async (key: DesignImageKey) => {
    const next = { ...designImages, [key]: '' }
    setDesignImages(next)
    await saveDesignImages(next)
  }

  // Bewust versturen: de klant krijgt een link om het design zonder inloggen te
  // beoordelen. De Edge Function legt 'gemaild op' per design vast.
  const sendDesign = async (key: DesignImageKey) => {
    if (!project) return
    const field = designFields.find(f => f.key === key)
    if (!field) return
    const approval = instances.design?.custom_data?.design_approvals?.[field.approvalType]
    const lastSent = instances.design?.custom_data?.design_sent_at?.[field.approvalType]
    const isNewVersion = approval?.status === 'new_version'
    const deadline = instances.design?.custom_data?.design_deadlines?.[field.approvalType]
    if (deadline && deadline < todayDate()) {
      alert(`De reactiedatum voor de ${field.label.toLowerCase()} ligt in het verleden. Pas hem eerst aan.`)
      return
    }
    const deadlineLine = deadline
      ? `\nReactie uiterlijk: ${new Date(`${deadline}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}`
      : '\nZonder reactiedatum.'
    // Alleen waarschuwen als déze versie al gemaild is
    const mailed = designVersionMailed(instances.design?.custom_data, field.approvalType, designImages[key])
    const again = mailed && lastSent ? `\n\nLet op: deze versie is al gemaild op ${new Date(lastSent).toLocaleString('nl-NL')}.` : ''
    if (!confirm(`${isNewVersion ? 'De nieuwe versie van de' : 'De'} ${field.label.toLowerCase()} nu naar de klant mailen?${deadlineLine}${again}`)) return

    setSendingDesign(key)
    setDesignSendResults(prev => ({ ...prev, [key]: undefined }))
    const { data, failure } = await invokeMail('send-design-ready-email', {
      project_id: project.id, design_type: field.approvalType, is_new_version: isNewVersion,
    }, true)
    setSendingDesign(null)
    if (!data) {
      alert(`De ${field.label.toLowerCase()} is niet verstuurd: ${failure}`)
      return
    }
    setDesignSendResults(prev => ({ ...prev, [key]: `Gemaild naar ${[data.sent_to].flat().join(', ')}` }))
    await fetchInstances()
  }

  // ── Oplevering ──

  // Koppelen van de (rest)factuur is stil, net als bij de intake; bewaard in de opleverfase
  const saveOpleveringInvoice = async (invoiceId: string) => {
    if (!project) return
    setSavingOplevering(true)
    const instance = instances.oplevering
    if (!instance) {
      await supabase.from('project_phases').insert({
        project_id: project.id,
        phase: 'oplevering',
        template_id: null,
        custom_data: { content: '', steps: [], linked_invoice_id: invoiceId || undefined },
        status: 'active',
      })
    } else {
      const { data: fresh } = await supabase.from('project_phases').select('custom_data').eq('id', instance.id).single()
      const customData: PhaseCustomData = (fresh?.custom_data as PhaseCustomData | null) || instance.custom_data || {}
      await supabase.from('project_phases').update({
        custom_data: { ...customData, linked_invoice_id: invoiceId || undefined },
      }).eq('id', instance.id)
    }
    await fetchInstances()
    setSavingOplevering(false)
  }

  const sendDelivery = async (kind: DeliveryKind) => {
    if (!project) return
    const invoiceId = instances.oplevering?.custom_data?.linked_invoice_id
    const invoice = invoices.find(i => i.id === invoiceId)
    const question = {
      live: `De mail "Je website staat live" nu naar de klant sturen?\n${project.url || ''}`,
      invoice: `Factuur ${invoice?.number || ''} nu naar de klant mailen (met PDF)?`,
      review: 'Het review-verzoek (met 6 gratis strippen als bedankje) nu naar de klant sturen?',
    }[kind]
    const earlier = { live: project.live_sent_at, invoice: invoice?.last_sent_at, review: project.review_requested_at }[kind]
    const again = earlier ? `\n\nLet op: dit is al eerder gemaild op ${new Date(earlier).toLocaleString('nl-NL')}.` : ''
    if (!confirm(`${question}${again}`)) return

    setSendingDelivery(kind)
    setDeliverySendResults(prev => ({ ...prev, [kind]: undefined }))
    const { data, failure } = kind === 'invoice'
      ? await invokeMail('send-invoice-email', { invoice_id: invoiceId })
      : await invokeMail('send-delivery-email', { project_id: project.id, kind }, true)
    setSendingDelivery(null)
    if (!data) {
      alert(`Niet verstuurd: ${failure}`)
      return
    }
    const pdfNote = kind === 'invoice' ? (data.pdf_attached ? ' (met PDF)' : ' (zonder PDF — alleen de link)') : ''
    setDeliverySendResults(prev => ({ ...prev, [kind]: `Gemaild naar ${[data.sent_to].flat().join(', ')}${pdfNote}` }))
    if (kind === 'invoice') await fetchLinkables()
    else await fetchProject()
  }

  // Bewust versturen: de klant krijgt een mail met een knop naar de link
  const sendLinkMail = async (opts: {
    fn: string
    url: string | null
    sentAt: string | null | undefined
    what: string
    setSending: (sending: boolean) => void
    setResult: (result: string | undefined) => void
  }) => {
    if (!project || !opts.url) return
    const again = opts.sentAt ? `\n\nLet op: de link is al eerder gemaild op ${new Date(opts.sentAt).toLocaleString('nl-NL')}.` : ''
    if (!confirm(`${opts.what} nu naar de klant mailen?\n${opts.url}${again}`)) return

    opts.setSending(true)
    opts.setResult(undefined)
    const { data, failure } = await invokeMail(opts.fn, { project_id: project.id }, true)
    opts.setSending(false)
    if (!data) {
      alert(`De link is niet verstuurd: ${failure}`)
      return
    }
    opts.setResult(`Gemaild naar ${[data.sent_to].flat().join(', ')}`)
    await fetchProject()
  }

  const sendStaging = () => sendLinkMail({
    fn: 'send-staging-email', url: project?.staging_url || null, sentAt: project?.staging_sent_at,
    what: 'De link naar de testsite', setSending: setSendingStaging, setResult: setStagingSendResult,
  })

  const sendFiles = () => sendLinkMail({
    fn: 'send-files-email', url: project?.file_sharing_url || null, sentAt: project?.files_sent_at,
    what: 'De link om bestanden te delen', setSending: setSendingFiles, setResult: setFilesSendResult,
  })

  // Uitnodiging startgesprek, met agenda-uitnodiging als bijlage
  const sendMeeting = async () => {
    if (!project?.start_meeting_at) return
    const when = new Date(project.start_meeting_at).toLocaleString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    const again = project.start_meeting_sent_at ? `\n\nLet op: er is al eerder een uitnodiging gemaild op ${new Date(project.start_meeting_sent_at).toLocaleString('nl-NL')}.` : ''
    const where = project.start_meeting_location?.trim() ? `\nLocatie: ${project.start_meeting_location.trim()}` : '\nZonder locatie.'
    if (!confirm(`Uitnodiging voor het startgesprek op ${when} naar de klant mailen?${where}${again}`)) return

    setSendingMeeting(true)
    setMeetingSendResult(undefined)
    const { data, failure } = await invokeMail('send-meeting-email', { project_id: project.id }, true)
    setSendingMeeting(false)
    if (!data) {
      alert(`De uitnodiging is niet verstuurd: ${failure}`)
      return
    }
    setMeetingSendResult(`Gemaild naar ${[data.sent_to].flat().join(', ')}`)
    await fetchProject()
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
  // Volgorde van de fasesecties: huidige en komende fases, daarna de afgeronde
  const currentIndex = Math.max(0, phases.indexOf(project.current_phase))
  const orderedPhases = [...phases.slice(currentIndex), ...phases.slice(0, currentIndex)]
  const firstCompletedIndex = currentIndex > 0 ? phases.length - currentIndex : -1

  const availableClients = clients.filter(c => !projectClients.some(pc => pc.client_id === c.id))

  // Kop van de Intake-sectie: wat er gekoppeld is en hoe het ervoor staat
  const statusWord: Record<string, string> = { draft: 'concept', sent: 'verzonden', accepted: 'geaccepteerd', declined: 'afgewezen', paid: 'betaald' }
  const intakeSummary = ([
    ['Opdracht', assignments.find(a => a.id === intakeLinks.assignment_id)],
    ['Offerte', quotes.find(q => q.id === intakeLinks.quote_id)],
    ['Factuur', invoices.find(i => i.id === intakeLinks.invoice_id)],
  ] as const)
    .filter(([, doc]) => doc)
    .map(([label, doc]) => `${label} ${statusWord[doc!.status] || doc!.status}`)
    .join(' · ')

  // Kop van de Oplevering-sectie: wat er al gemaild is en de stand van de factuur
  const opleveringInvoice = invoices.find(i => i.id === instances.oplevering?.custom_data?.linked_invoice_id)
  const opleveringSummary = [
    project.live_sent_at ? 'Live-mail verstuurd' : '',
    opleveringInvoice ? `Factuur ${statusWord[opleveringInvoice.status] || opleveringInvoice.status}` : '',
    project.review_requested_at ? 'Review gevraagd' : '',
  ].filter(Boolean).join(' · ')

  // Kop van de Design-sectie: per geüpload ontwerp de stand
  const designWord: Record<string, string> = { accepted: 'goedgekeurd', declined: 'aanpassing gevraagd', new_version: 'nieuwe versie' }
  const designSummary = [
    project.file_sharing_url ? (project.files_sent_at ? 'Bestanden-link gemaild' : 'Bestanden-link nog niet gemaild') : '',
    ...designFields
      .filter(f => designImages[f.key])
      .map(f => {
        const status = instances.design?.custom_data?.design_approvals?.[f.approvalType]?.status
        const sent = instances.design?.custom_data?.design_sent_at?.[f.approvalType]
        return `${f.label} ${status ? designWord[status] || status : sent ? 'gemaild' : 'nog niet gemaild'}`
      }),
  ].filter(Boolean).join(' · ')

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
            </button>
          ))}
        </div>
      </div>

      {/* ── Algemeen ── */}
      <section id="algemeen" className="bg-white rounded-xl shadow-sm border border-gray-100 scroll-mt-4">
        <div className="px-5 sm:px-6 pt-4 border-b border-gray-100 flex items-end justify-between gap-4">
          <h2 className="text-sm font-semibold text-gray-900 pb-4">Algemeen</h2>
          {/* Tabbladen: gegevens van het domein, beveiligde gegevens versturen, of portaalgebruik */}
          <div className="flex items-end gap-1" role="tablist">
            {([['gegevens', 'Gegevens'], ['privacy', 'Privacy'], ['activiteit', 'Activiteit']] as const).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={generalTab === value} onClick={() => setGeneralTab(value)}
                className={`px-3 pb-3 pt-1 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  generalTab === value ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {generalTab === 'privacy' ? (
          <div className="px-5 sm:px-6 py-4">
            <DomainPrivacy projectId={project.id} projectClients={projectClients} />
          </div>
        ) : generalTab === 'activiteit' ? (
          <div className="px-5 sm:px-6 py-4">
            <DomainActivity projectId={project.id}
              clientIds={[...new Set([...projectClients.map(pc => pc.client_id), ...(project.client_id ? [project.client_id] : [])])].sort()} />
          </div>
        ) : (
        <div className="px-5 sm:px-6 py-4 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            <FieldInput label="Website" type="url" placeholder="https://voorbeeld.nl" linkable
              value={project.url || ''} onSave={(v) => updateProject({ url: withHttps(v) })}
              help="Het adres van de live website. Alleen voor jouw overzicht, de klant ziet dit niet." />
            <FieldInput label="Opleverdatum" type="date" helpAlign="right"
              value={project.due_date || ''} onSave={(v) => updateProject({ due_date: v || null })}
              help="Verwachte datum waarop de website klaar is. Staat ook in het domeinoverzicht. Klanten die inloggen zien deze datum in hun portaal." />
            <FieldInput label="Factuurnaam" placeholder="Leeg = naam van de klant"
              value={project.invoice_name || ''} onSave={(v) => updateProject({ invoice_name: v.trim() || null })}
              help="Alleen invullen als facturen voor dit domein op een andere naam moeten dan die van de klant, bijv. een bedrijf of vereniging. Wordt ingevuld bij elke nieuwe factuur voor dit domein; bestaande facturen veranderen niet." />
            <FieldInput label="Factuur-e-mail" type="email" placeholder="Leeg = e-mail van de klant" helpAlign="right"
              value={project.invoice_email || ''} onSave={(v) => updateProject({ invoice_email: v.trim() || null })}
              help="Alleen invullen als facturen voor dit domein naar een ander adres moeten, bijv. de penningmeester of administratie. Nieuwe facturen en herinneringen gaan dan naar dit adres; bestaande facturen veranderen niet." />
          </div>

          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input type="checkbox" checked={Boolean(project.hosted_by_us)}
              onChange={(e) => updateProject({ hosted_by_us: e.target.checked })}
              className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/30" />
            <span className="text-sm text-gray-700">Websitebeheer bij DesignPixels (incl. hosting)</span>
            <HelpTip text="Aan: strippenkaarten van dit domein blijven geldig zolang het websitebeheer loopt (geen vervaldatum), ook bestaande actieve kaarten. Uit: nieuwe kaarten zijn 36 maanden geldig vanaf de aankoopdatum. Zet je het vinkje uit omdat de klant stopt met websitebeheer, dan krijgen actieve kaarten nog 6 maanden (zoals in de algemene voorwaarden). De klant ziet dit op zijn strippenkaart en in de winkel." />
          </label>

          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Klanten</span>
                <HelpTip text="Klanten die bij dit domein horen en kunnen inloggen in het portaal. Met de icoontjes rechts bepaal je per klant welke mails en rollen die krijgt; ga erop staan voor uitleg." />
              </div>
              <div className="flex items-center gap-4">
              <button onClick={() => { setNewClient(emptyNewClient); setNewClientError(''); setNewClientOpen(true) }}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-primary transition-colors">
                <Plus className="w-3.5 h-3.5" />
                Nieuwe klant
              </button>
              <div className="relative" ref={clientMenuRef}>
                <button onClick={() => setClientMenuOpen(!clientMenuOpen)}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-primary transition-colors">
                  <UserPlus className="w-3.5 h-3.5" />
                  Bestaande klant
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
        )}
      </section>

      {/* ── Fases ── huidige fase direct onder Algemeen, daarna de komende fases en
          onderaan, onder de balk 'Afgerond', de fases die al voorbij zijn.
          Op key gesorteerd, dus bij een faseswitch verhuist de sectie zonder dat
          onopgeslagen invoer verloren gaat. */}
      {orderedPhases.map((phase, i) => {
        const instance = instances[phase]
        const isOpen = !!openSections[phase]
        const isCurrent = phase === project.current_phase
        return (
          <Fragment key={phase}>
          {i === firstCompletedIndex && (
            <div className="flex items-center gap-3 pt-4">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Afgerond</span>
              <span className="flex-1 h-px bg-gray-200" />
            </div>
          )}
          <section id={`fase-${phase}`}
            className={`bg-white rounded-xl shadow-sm border scroll-mt-4 ${isCurrent ? 'border-primary/30 ring-1 ring-primary/10' : 'border-gray-100'}`}>
            <button onClick={() => setOpenSections(prev => ({ ...prev, [phase]: !isOpen }))}
              className="w-full px-5 sm:px-6 py-4 flex items-center gap-3 text-left hover:bg-gray-50/60 transition-colors rounded-xl">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${phaseDots[phase]}`} />
              <h2 className="text-sm font-semibold text-gray-900">{phaseLabels[phase]}</h2>
              {isCurrent && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${phaseColors[phase]}`}>Actieve fase</span>
              )}
              {phase === 'intake' ? (
                <span className={`ml-auto hidden sm:block text-xs whitespace-nowrap ${intakeSummary ? 'text-gray-500' : 'text-gray-400 italic'}`}>{intakeSummary || 'Nog niets gekoppeld'}</span>
              ) : phase === 'design' ? (
                <span className={`ml-auto hidden sm:block text-xs whitespace-nowrap ${designSummary ? 'text-gray-500' : 'text-gray-400 italic'}`}>{designSummary || 'Nog geen ontwerpen'}</span>
              ) : phase === 'development' ? (
                <span className={`ml-auto hidden sm:block text-xs whitespace-nowrap ${project.staging_url ? 'text-gray-500' : 'text-gray-400 italic'}`}>
                  {!project.staging_url ? 'Nog geen testsite' : project.staging_sent_at ? 'Testsite gemaild' : 'Testsite nog niet gemaild'}
                </span>
              ) : phase === 'oplevering' ? (
                <span className={`ml-auto hidden sm:block text-xs whitespace-nowrap ${opleveringSummary ? 'text-gray-500' : 'text-gray-400 italic'}`}>{opleveringSummary || 'Nog niets gemaild'}</span>
              ) : (
                <span className="ml-auto" />
              )}
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 max-sm:ml-auto ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Ingeklapt blijven de editors gemount, zodat onopgeslagen wijzigingen niet verloren gaan */}
            <div className={isOpen ? 'border-t border-gray-100 px-5 sm:px-6 py-5 space-y-6' : 'hidden'}>
              {phase === 'intake' && (
                <DomainIntake
                  project={project}
                  links={intakeLinks}
                  quotes={quotes}
                  invoices={invoices}
                  assignments={assignments}
                  saving={savingIntakeLinks}
                  sendingKind={sendingKind}
                  sendResults={sendResults}
                  onChangeLinks={saveIntakeLinks}
                  onSend={sendIntakeDocument}
                  sendingMeeting={sendingMeeting}
                  meetingSendResult={meetingSendResult}
                  onSendMeeting={sendMeeting}
                  formsSection={<DomainForms projectId={project.id} projectName={project.name} />}
                  updateProject={updateProject}
                />
              )}
              {phase === 'design' && (
                <LinkMailField
                  label="Bestanden delen"
                  placeholder="https://..."
                  help="Link naar een omgeving waar de klant bestanden kan aanleveren (bijv. een gedeelde map). De link invullen of wijzigen stuurt niets; met 'Mail sturen' krijgt de klant een mail met een knop ernaartoe. De klant kan de link meerdere keren gebruiken. De mail gaat naar gekoppelde klanten met 'Portaalmails' aan."
                  value={project.file_sharing_url}
                  sentAt={project.files_sent_at}
                  sending={sendingFiles}
                  sendResult={filesSendResult}
                  onSave={(v) => updateProject({ file_sharing_url: withHttps(v) })}
                  onSend={sendFiles}
                />
              )}
              {phase === 'design' && (
                <DomainDesign
                  instance={instance || null}
                  images={designImages}
                  uploadingKey={uploadingDesignImage}
                  saving={savingDesignImages}
                  sendingKey={sendingDesign}
                  sendResults={designSendResults}
                  onUpload={uploadDesignImage}
                  onRemove={removeDesignImage}
                  onChangeDeadline={saveDesignDeadline}
                  onSend={sendDesign}
                />
              )}
              {phase === 'development' && (
                <LinkMailField
                  label="Stagingsite"
                  placeholder="https://staging..."
                  help="Testomgeving waar je de site bouwt voordat hij live gaat. De link invullen of wijzigen stuurt niets; met 'Mail sturen' krijgt de klant een mail met een knop naar de testsite. De mail gaat naar gekoppelde klanten met 'Portaalmails' aan."
                  value={project.staging_url}
                  sentAt={project.staging_sent_at}
                  sending={sendingStaging}
                  sendResult={stagingSendResult}
                  onSave={(v) => updateProject({ staging_url: withHttps(v) })}
                  onSend={sendStaging}
                />
              )}
              {phase === 'oplevering' && (
                <DomainOplevering
                  project={project}
                  invoices={invoices}
                  linkedInvoiceId={instance?.custom_data?.linked_invoice_id || ''}
                  reviewUrl={reviewUrl}
                  saving={savingOplevering}
                  sendingKind={sendingDelivery}
                  sendResults={deliverySendResults}
                  onSelectInvoice={saveOpleveringInvoice}
                  onSend={sendDelivery}
                />
              )}
              {phase === 'onderhoud' && <DomainOnderhoud projectId={project.id} />}

              {/* Intake t/m oplevering lopen via mail met links zonder inloggen. In onderhoud loggen
                  klanten in (o.a. voor de strippenkaart); hier zie je wie dat kan. */}
              {phase === 'onderhoud' && (
                <div className="pt-5 border-t border-gray-100">
                  <DomainPortalAccess projectId={project.id} projectClients={projectClients} />
                </div>
              )}
            </div>
          </section>
          </Fragment>
        )
      })}

      {/* Nieuwe klant */}
      {newClientOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => !savingNewClient && setNewClientOpen(false)}>
          <form onSubmit={createClientForProject} onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Nieuwe klant</h2>
              <button type="button" onClick={() => setNewClientOpen(false)} aria-label="Sluiten"
                className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              {([
                { key: 'name', label: 'Naam *', type: 'text', required: true, placeholder: '' },
                { key: 'email', label: 'E-mail *', type: 'email', required: true, placeholder: '' },
                { key: 'phone', label: 'Telefoon', type: 'text', required: false, placeholder: '06-12345678' },
                { key: 'company', label: 'Bedrijf', type: 'text', required: false, placeholder: '' },
              ] as const).map(({ key, label, type, required, placeholder }) => (
                <div key={key}>
                  <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
                  <input type={type} required={required} placeholder={placeholder} autoFocus={key === 'name'}
                    value={newClient[key]} onChange={(e) => setNewClient({ ...newClient, [key]: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                </div>
              ))}
              <p className="text-xs text-gray-400">
                De klant wordt meteen aan {project.name} gekoppeld. Er gaat geen mail uit.
              </p>
              {newClientError && <p className="text-xs text-red-600">{newClientError}</p>}
            </div>
            <div className="flex justify-end gap-2 p-6 border-t border-gray-100">
              <button type="button" onClick={() => setNewClientOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                Annuleren
              </button>
              <button type="submit" disabled={savingNewClient}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-50">
                {savingNewClient && <Loader2 className="w-4 h-4 animate-spin" />}
                Aanmaken en koppelen
              </button>
            </div>
          </form>
        </div>
      )}

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
