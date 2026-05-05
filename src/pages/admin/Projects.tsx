import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import type { Project, ProjectPhase, PhaseTemplate, PhaseStep, CardElement, ProjectClient, Quote, Invoice, Assignment } from '../../types'
import { Plus, FolderKanban, Trash2, X, Globe, ExternalLink, ChevronDown, Calendar, Users, Pencil, Layers, Save, RotateCcw, Clock, FileText, FileCheck, Bell, UserPlus, CheckCircle, Eye, EyeOff, ClipboardCheck, AlertTriangle, Palette, Upload, MessageSquare, Ticket, Key, Copy, Settings, Search, Filter, Archive, ArchiveRestore } from 'lucide-react'
import CardElementsEditor from '../../components/CardElementEditor'

const phases: ProjectPhase[] = ['intake', 'design', 'development', 'oplevering', 'onderhoud']

const phaseLabels: Record<ProjectPhase, string> = {
  intake: 'Intake',
  design: 'Design',
  development: 'Development',
  oplevering: 'Oplevering',
  onderhoud: 'Onderhoud',
}

const phaseColors: Record<ProjectPhase, string> = {
  intake: 'bg-blue-100 text-blue-700',
  design: 'bg-purple-100 text-purple-700',
  development: 'bg-yellow-100 text-yellow-700',
  oplevering: 'bg-green-100 text-green-700',
  onderhoud: 'bg-emerald-100 text-emerald-700',
}

const phaseTabColors: Record<ProjectPhase, { active: string; inactive: string }> = {
  intake: { active: 'border-blue-500 text-blue-700', inactive: 'text-gray-400 hover:text-blue-600' },
  design: { active: 'border-purple-500 text-purple-700', inactive: 'text-gray-400 hover:text-purple-600' },
  development: { active: 'border-yellow-500 text-yellow-700', inactive: 'text-gray-400 hover:text-yellow-600' },
  oplevering: { active: 'border-green-500 text-green-700', inactive: 'text-gray-400 hover:text-green-600' },
  onderhoud: { active: 'border-emerald-500 text-emerald-700', inactive: 'text-gray-400 hover:text-emerald-600' },
}

interface FormData {
  name: string
  url: string
  client_id: string
  current_phase: ProjectPhase
  due_date: string
}

interface ProjectPhaseInstance {
  id: string
  project_id: string
  phase: string
  template_id: string | null
  custom_data: {
    content?: string
    steps?: PhaseStep[]
    linked_quote_id?: string
    linked_invoice_id?: string
    linked_assignment_id?: string
    design_html?: string
    design_html_styleguide?: string
    design_html_homepage?: string
    design_html_tweede?: string
    design_image_styleguide?: string
    design_image_homepage?: string
    design_image_tweede?: string
    design_approvals?: Record<string, { status?: string; declined_reason?: string; declined_name?: string; declined_at?: string; accepted_at?: string; accepted_name?: string }>
    show_file_footer?: boolean
    show_feedback_footer?: boolean
  } | null
  status: string
}

const emptyForm: FormData = { name: '', url: '', client_id: '', current_phase: 'intake', due_date: '' }

// Inline editable field component
function InlineEdit({
  value,
  onSave,
  type = 'text',
  placeholder,
  icon: Icon,
  displayValue,
}: {
  value: string
  onSave: (value: string) => void
  type?: string
  placeholder?: string
  icon?: React.ComponentType<{ className?: string }>
  displayValue?: string
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  useEffect(() => { setEditValue(value) }, [value])

  const save = () => {
    setEditing(false)
    if (editValue !== value) onSave(editValue)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
        <input ref={inputRef} type={type} value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditValue(value); setEditing(false) } }}
          className="px-2 py-1 bg-white border border-primary/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-0"
          placeholder={placeholder} />
      </div>
    )
  }

  return (
    <button onClick={() => setEditing(true)}
      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 group transition-colors text-left" title="Klik om te bewerken">
      {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
      <span>{displayValue || value || placeholder}</span>
      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0" />
    </button>
  )
}

// Render a row of URL-field cards (Bestanden delen, Feedback, Stagingsite, etc.)
type UrlFieldDef = {
  label: string
  value: string | null
  field: 'file_sharing_url' | 'feedback_url' | 'staging_url'
  icon: React.ComponentType<{ className?: string }>
}

function renderUrlFields(
  project: Project,
  fields: UrlFieldDef[],
  updateProject: (id: string, updates: Partial<Project>) => void | Promise<void>,
) {
  return fields.map(({ label, value, field, icon: Icon }) => (
    <div key={field} className="bg-white rounded-lg border border-gray-100 px-3 py-2 min-w-0">
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      {value ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="w-3 h-3 text-primary/50 flex-shrink-0" />
          <a href={value} target="_blank" rel="noopener noreferrer"
            className="text-xs text-primary hover:text-primary/80 truncate transition-colors"
            title={value}>
            {value.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </a>
        </div>
      ) : (
        <InlineEdit
          value=""
          onSave={(url) => {
            let finalUrl = url?.trim() || null
            if (finalUrl && !finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
              finalUrl = `https://${finalUrl}`
            }
            updateProject(project.id, { [field]: finalUrl })
          }}
          placeholder="URL toevoegen"
          icon={Icon}
        />
      )}
      {value && (
        <InlineEdit
          value={value}
          onSave={(url) => {
            let finalUrl = url?.trim() || null
            if (finalUrl && !finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
              finalUrl = `https://${finalUrl}`
            }
            updateProject(project.id, { [field]: finalUrl })
          }}
          placeholder="Wijzig URL"
          icon={Pencil}
          displayValue=""
        />
      )}
    </div>
  ))
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<FormData>(emptyForm)
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterPhase, setFilterPhase] = useState<ProjectPhase | 'all'>('all')
  const [filterClient, setFilterClient] = useState('all')
  const [filterLetter, setFilterLetter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active')
  const [phaseDropdownId, setPhaseDropdownId] = useState<string | null>(null)
  const [clientDropdownId, setClientDropdownId] = useState<string | null>(null)
  const [projectClients, setProjectClients] = useState<Record<string, ProjectClient[]>>({})
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null)
  const phaseDropdownRef = useRef<HTMLDivElement>(null)
  const clientDropdownRef = useRef<HTMLDivElement>(null)

  // Template instance state
  const [templates, setTemplates] = useState<PhaseTemplate[]>([])
  const [phaseInstances, setPhaseInstances] = useState<Record<string, ProjectPhaseInstance>>({})
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const [activePhaseTab, setActivePhaseTab] = useState<Record<string, ProjectPhase>>({})
  const [editingInstance, setEditingInstance] = useState<{ content: string; steps: PhaseStep[]; show_file_footer?: boolean; show_feedback_footer?: boolean } | null>(null)
  const [savingInstance, setSavingInstance] = useState(false)
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null)
  const [reloadDropdownId, setReloadDropdownId] = useState<string | null>(null)
  const reloadDropdownRef = useRef<HTMLDivElement>(null)
  const [settingsDropdownId, setSettingsDropdownId] = useState<string | null>(null)
  const settingsDropdownRef = useRef<HTMLDivElement>(null)

  // Intake link state
  const [projectQuotes, setProjectQuotes] = useState<Record<string, Quote[]>>({})
  const [projectInvoices, setProjectInvoices] = useState<Record<string, Invoice[]>>({})
  const [projectAssignments, setProjectAssignments] = useState<Record<string, Assignment[]>>({})
  const [intakeLinks, setIntakeLinks] = useState<Record<string, { quote_id: string; invoice_id: string; assignment_id: string }>>({})
  const [savingIntakeLinks, setSavingIntakeLinks] = useState<string | null>(null)

  // Domain card tabs & design state
  const [domainCardTab, setDomainCardTab] = useState<Record<string, string>>({})
  const [designImages, setDesignImages] = useState<Record<string, { styleguide: string; homepage: string; tweede: string }>>({})
  const [savingDesignImages, setSavingDesignImages] = useState<string | null>(null)
  const [uploadingDesignImage, setUploadingDesignImage] = useState<string | null>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (phaseDropdownRef.current && !phaseDropdownRef.current.contains(e.target as Node)) setPhaseDropdownId(null)
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) setClientDropdownId(null)
      if (reloadDropdownRef.current && !reloadDropdownRef.current.contains(e.target as Node)) setReloadDropdownId(null)
      if (settingsDropdownRef.current && !settingsDropdownRef.current.contains(e.target as Node)) setSettingsDropdownId(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const updateProject = async (id: string, updates: Partial<Project>) => {
    await supabase.from('projects').update(updates).eq('id', id)
    fetchProjects()
  }

  // Helper: create a client notification for a project
  const createNotification = async (projectId: string, type: string, title: string, message: string, linkUrl?: string) => {
    const project = projects.find(p => p.id === projectId)
    if (!project?.client_id) {
      console.warn('createNotification: no client_id found for project', projectId)
      return
    }
    const { error } = await supabase.from('client_notifications').insert({
      project_id: projectId,
      client_id: project.client_id,
      type,
      title,
      message,
      link_url: linkUrl || null,
    })
    if (error) {
      console.error('Error creating notification:', error)
    }
  }

  const handlePhaseChange = async (project: Project, newPhase: ProjectPhase) => {
    setPhaseDropdownId(null)
    if (newPhase === project.current_phase) return
    const confirmed = confirm(`Fase van "${project.name}" wijzigen van ${phaseLabels[project.current_phase]} naar ${phaseLabels[newPhase]}?`)
    if (!confirmed) return
    updateProject(project.id, { current_phase: newPhase })
  }

  const fetchProjectClients = async (projectIds?: string[]) => {
    let query = supabase.from('project_clients').select('*, client:clients(id, name, email)')
    if (projectIds && projectIds.length > 0) {
      query = query.in('project_id', projectIds)
    }
    const { data } = await query.order('created_at')
    if (data) {
      const grouped: Record<string, ProjectClient[]> = {}
      for (const pc of data) {
        if (!grouped[pc.project_id]) grouped[pc.project_id] = []
        grouped[pc.project_id].push(pc)
      }
      setProjectClients(prev => ({ ...prev, ...grouped }))
    }
  }

  const addClientToProject = async (projectId: string, clientId: string) => {
    const existing = projectClients[projectId] || []
    if (existing.some(pc => pc.client_id === clientId)) return
    const isFirst = existing.length === 0
    const { error } = await supabase.from('project_clients').insert({
      project_id: projectId,
      client_id: clientId,
      notify_invoices: isFirst,
      notify_quotes: isFirst,
      notify_portal: true,
    })
    if (error) {
      console.error('Error adding client to project:', error)
      // Fallback: update the project's client_id directly
      await supabase.from('projects').update({ client_id: clientId }).eq('id', projectId)
      fetchProjects()
      return
    }
    // Also set as primary client_id if first
    if (isFirst) {
      await supabase.from('projects').update({ client_id: clientId }).eq('id', projectId)
    }
    fetchProjectClients([projectId])
    fetchProjects()
  }

  const removeClientFromProject = async (projectClientId: string, projectId: string) => {
    await supabase.from('project_clients').delete().eq('id', projectClientId)
    fetchProjectClients([projectId])
  }

  const toggleProjectClientPref = async (pcId: string, field: 'notify_invoices' | 'notify_quotes' | 'notify_portal' | 'notify_tickets' | 'notify_punch_cards', value: boolean, projectId: string) => {
    await supabase.from('project_clients').update({ [field]: value }).eq('id', pcId)
    fetchProjectClients([projectId])
  }

  const migrateExistingClients = async (projectList: Project[], existingPCs: Record<string, ProjectClient[]>) => {
    // Auto-migrate: if a project has client_id but no project_clients entry, create one
    const toInsert: { project_id: string; client_id: string; notify_invoices: boolean; notify_quotes: boolean; notify_portal: boolean }[] = []
    for (const project of projectList) {
      if (project.client_id && (!existingPCs[project.id] || existingPCs[project.id].length === 0)) {
        toInsert.push({
          project_id: project.id,
          client_id: project.client_id,
          notify_invoices: true,
          notify_quotes: true,
          notify_portal: true,
        })
      }
    }
    if (toInsert.length > 0) {
      await supabase.from('project_clients').insert(toInsert)
      await fetchProjectClients(toInsert.map(i => i.project_id))
    }
  }

  const fetchProjects = async () => {
    const { data } = await supabase
      .from('projects')
      .select('*, client:clients(id, name, email)')
      .order('created_at', { ascending: false })
    setProjects(data || [])
    if (data && data.length > 0) {
      const ids = data.map(p => p.id)
      // Fetch project_clients first, then migrate if needed
      const { data: pcData } = await supabase
        .from('project_clients')
        .select('*, client:clients(id, name, email)')
        .in('project_id', ids)
        .order('created_at')

      const grouped: Record<string, ProjectClient[]> = {}
      if (pcData) {
        for (const pc of pcData) {
          if (!grouped[pc.project_id]) grouped[pc.project_id] = []
          grouped[pc.project_id].push(pc)
        }
      }
      setProjectClients(grouped)

      // Auto-migrate old client_id entries
      await migrateExistingClients(data, grouped)
    }
    setLoading(false)
  }

  const fetchClients = async () => {
    const { data } = await supabase.from('clients').select('id, name').order('name')
    setClients(data || [])
  }

  const fetchTemplates = async () => {
    const { data } = await supabase.from('phase_templates').select('*').order('phase')
    setTemplates(data || [])
  }

  const fetchPhaseInstances = async () => {
    const { data } = await supabase.from('project_phases').select('*')
    const map: Record<string, ProjectPhaseInstance> = {}
    const newIntakeLinks: Record<string, { quote_id: string; invoice_id: string; assignment_id: string }> = {}
    const newDesignImages: Record<string, { styleguide: string; homepage: string; tweede: string }> = {}
    ;(data || []).forEach((pi: ProjectPhaseInstance) => {
      map[`${pi.project_id}_${pi.phase}`] = pi
      // Load intake links from custom_data
      if (pi.phase === 'intake' && pi.custom_data) {
        newIntakeLinks[pi.project_id] = {
          quote_id: pi.custom_data.linked_quote_id || '',
          invoice_id: pi.custom_data.linked_invoice_id || '',
          assignment_id: pi.custom_data.linked_assignment_id || '',
        }
      }
      if (pi.phase === 'design' && pi.custom_data) {
        newDesignImages[pi.project_id] = {
          styleguide: pi.custom_data.design_image_styleguide || '',
          homepage: pi.custom_data.design_image_homepage || '',
          tweede: pi.custom_data.design_image_tweede || '',
        }
      }
    })
    setPhaseInstances(map)
    setIntakeLinks(prev => ({ ...prev, ...newIntakeLinks }))
    setDesignImages(prev => ({ ...prev, ...newDesignImages }))
  }

  const fetchProjectQuotesAndInvoices = async (projectId: string) => {
    const [{ data: quotes }, { data: invoices }, { data: assignments }] = await Promise.all([
      supabase.from('quotes').select('*').eq('project_id', projectId).order('number'),
      supabase.from('invoices').select('*').eq('project_id', projectId).order('number'),
      supabase.from('assignments').select('*').eq('project_id', projectId).order('title'),
    ])
    setProjectQuotes(prev => ({ ...prev, [projectId]: quotes || [] }))
    setProjectInvoices(prev => ({ ...prev, [projectId]: invoices || [] }))
    setProjectAssignments(prev => ({ ...prev, [projectId]: assignments || [] }))
  }

  const saveIntakeLinks = async (projectId: string, quoteId: string, invoiceId: string, assignmentId: string) => {
    setSavingIntakeLinks(projectId)
    const instance = getInstance(projectId, 'intake')
    if (instance) {
      const customData = instance.custom_data || { content: '', steps: [] }
      // Update linked IDs in custom_data
      const updatedData = { ...customData, linked_quote_id: quoteId || undefined, linked_invoice_id: invoiceId || undefined, linked_assignment_id: assignmentId || undefined }

      // Auto-propagate IDs naar knoppen, en unfade de bijbehorende stap automatisch:
      // door iets te koppelen geeft de admin impliciet aan dat de klant het mag zien.
      if (updatedData.steps) {
        for (const step of updatedData.steps) {
          if (!step.elements) continue
          for (const el of step.elements) {
            if (el.type === 'button' && el.data.action === 'quote' && quoteId) {
              el.data.quoteId = quoteId
              if (step.faded) step.faded = false
            }
            if (el.type === 'button' && el.data.action === 'invoice' && invoiceId) {
              el.data.invoiceId = invoiceId
              if (step.faded) step.faded = false
            }
            if (el.type === 'button' && el.data.action === 'assignment' && assignmentId) {
              el.data.assignmentId = assignmentId
              if (step.faded) step.faded = false
            }
          }
        }
      }

      await supabase.from('project_phases').update({ custom_data: updatedData }).eq('id', instance.id)

      // Auto-set linked quote to 'sent' if draft
      if (quoteId) {
        await supabase.from('quotes').update({ status: 'sent' }).eq('id', quoteId).eq('status', 'draft')
      }

      await fetchPhaseInstances()

      // Update editingInstance if currently editing intake phase
      if (editingInstance) {
        const activeTab = activePhaseTab[projectId] || 'intake'
        if (activeTab === 'intake') {
          setEditingInstance({ ...updatedData, content: updatedData.content || '', steps: updatedData.steps || [] })
        }
      }
    }
    // Create notifications for newly linked items
    const oldLinks = intakeLinks[projectId] || { quote_id: '', invoice_id: '', assignment_id: '' }
    console.log('[IntakeLinks] old:', oldLinks, 'new quote:', quoteId, 'new invoice:', invoiceId, 'new assignment:', assignmentId)
    if (quoteId && quoteId !== oldLinks.quote_id) {
      console.log('[IntakeLinks] Quote changed, creating notification...')
      const q = (projectQuotes[projectId] || []).find(q => q.id === quoteId)
      createNotification(projectId, 'quote', 'Nieuwe offerte beschikbaar', q ? `Offerte ${q.number} staat voor je klaar.` : 'Er is een offerte voor je klaargezet.', `/offerte/${quoteId}`)
    }
    if (invoiceId && invoiceId !== oldLinks.invoice_id) {
      createNotification(projectId, 'invoice', 'Nieuwe factuur beschikbaar', 'Er is een factuur voor je klaargezet.')
    }
    if (assignmentId && assignmentId !== oldLinks.assignment_id) {
      const a = (projectAssignments[projectId] || []).find(a => a.id === assignmentId)
      createNotification(projectId, 'assignment', 'Nieuwe opdracht beschikbaar', a ? `Opdracht "${a.title}" staat voor je klaar.` : 'Er is een opdrachtomschrijving voor je klaargezet.', `/opdracht/${assignmentId}`)
    }

    setIntakeLinks(prev => ({ ...prev, [projectId]: { quote_id: quoteId, invoice_id: invoiceId, assignment_id: assignmentId } }))
    setSavingIntakeLinks(null)
  }

  const uploadDesignImage = async (projectId: string, fieldKey: 'styleguide' | 'homepage' | 'tweede', file: File) => {
    setUploadingDesignImage(`${projectId}_${fieldKey}`)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${projectId}/${fieldKey}_${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('design-images').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('design-images').getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      setDesignImages(prev => ({
        ...prev,
        [projectId]: { ...(prev[projectId] || { styleguide: '', homepage: '', tweede: '' }), [fieldKey]: publicUrl }
      }))

      // Auto-save after upload
      await saveDesignImages(projectId, { ...(designImages[projectId] || { styleguide: '', homepage: '', tweede: '' }), [fieldKey]: publicUrl })
    } catch (err) {
      console.error('Upload error:', err)
      alert('Upload mislukt. Controleer of de storage bucket "design-images" bestaat.')
    } finally {
      setUploadingDesignImage(null)
    }
  }

  const removeDesignImage = async (projectId: string, fieldKey: 'styleguide' | 'homepage' | 'tweede') => {
    setDesignImages(prev => ({
      ...prev,
      [projectId]: { ...(prev[projectId] || { styleguide: '', homepage: '', tweede: '' }), [fieldKey]: '' }
    }))
    await saveDesignImages(projectId, { ...(designImages[projectId] || { styleguide: '', homepage: '', tweede: '' }), [fieldKey]: '' })
  }

  const saveDesignImages = async (projectId: string, images?: { styleguide: string; homepage: string; tweede: string }) => {
    setSavingDesignImages(projectId)
    let instance = getInstance(projectId, 'design')
    const imgs = images || designImages[projectId] || { styleguide: '', homepage: '', tweede: '' }

    // Create design phase instance if it doesn't exist yet
    if (!instance) {
      const { data } = await supabase.from('project_phases').insert({
        project_id: projectId,
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
      }).select().single()
      if (data) {
        await fetchPhaseInstances()
      }
      setSavingDesignImages(null)
      return
    }

    {
      const customData = instance.custom_data || { content: '', steps: [] }

      // Reset declined approvals when new image is saved for that field
      const existingApprovals = (customData.design_approvals || {}) as Record<string, { status?: string }>
      const updatedApprovals = { ...existingApprovals }
      const fieldToType: Record<string, string> = { styleguide: 'styleguide', homepage: 'homepage', tweede: 'contactpage' }
      const fieldToLabel: Record<string, string> = { styleguide: 'Styleguide', homepage: 'Homepage', tweede: 'Contactpagina' }
      const oldImages = {
        styleguide: customData.design_image_styleguide || '',
        homepage: customData.design_image_homepage || '',
        tweede: customData.design_image_tweede || '',
      }
      for (const [field, approvalType] of Object.entries(fieldToType)) {
        const fieldKey = field as 'styleguide' | 'homepage' | 'tweede'
        const hasNewImage = !!imgs[fieldKey]?.trim()
        const hadOldImage = !!oldImages[fieldKey]?.trim()
        const imageChanged = imgs[fieldKey] !== oldImages[fieldKey]

        if (hasNewImage && updatedApprovals[approvalType]?.status === 'declined') {
          updatedApprovals[approvalType] = { status: 'new_version' } as never
          createNotification(projectId, 'card_update', `Nieuwe versie: ${fieldToLabel[field]}`, `Er is een nieuwe versie van het design "${fieldToLabel[field]}" beschikbaar op basis van je feedback.`, `/design/${approvalType}/${projectId}`)
        } else if (hasNewImage && !hadOldImage && imageChanged) {
          createNotification(projectId, 'card_update', `Design beschikbaar: ${fieldToLabel[field]}`, `Het design "${fieldToLabel[field]}" staat klaar voor je beoordeling.`, `/design/${approvalType}/${projectId}`)
        }
      }

      const updatedData = {
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
        const phaseCustomData = isDesign ? updatedData : getInstance(projectId, phase)?.custom_data
        const phaseId = isDesign ? instance.id : getInstance(projectId, phase)?.id
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

      await fetchPhaseInstances()
    }
    setSavingDesignImages(null)
  }

  useEffect(() => {
    fetchProjects()
    fetchClients()
    fetchTemplates()
    fetchPhaseInstances()
  }, [])

  const closeForm = () => { setShowForm(false); setFormData(emptyForm) }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('projects').insert({
      name: formData.name,
      url: formData.url || null,
      client_id: formData.client_id || null,
      current_phase: formData.current_phase,
      due_date: formData.due_date || null,
      status: 'active',
    })
    closeForm()
    fetchProjects()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit domein definitief wilt verwijderen? Deze actie kan niet ongedaan gemaakt worden.')) return
    await supabase.from('projects').delete().eq('id', id)
    fetchProjects()
  }

  const handleArchive = async (id: string) => {
    if (!confirm('Domein archiveren? Het verdwijnt uit het overzicht maar je kunt het later weer terughalen.')) return
    await supabase.from('projects').update({ status: 'archived' }).eq('id', id)
    fetchProjects()
  }

  const handleRestore = async (id: string) => {
    await supabase.from('projects').update({ status: 'active' }).eq('id', id)
    fetchProjects()
  }


  // Template instance functions
  const getInstanceKey = (projectId: string, phase: string) => `${projectId}_${phase}`

  const getInstance = (projectId: string, phase: string) => {
    return phaseInstances[getInstanceKey(projectId, phase)] || null
  }

  const getTemplatesForPhase = (phase: string) => {
    return templates.filter(t => t.phase === phase)
  }

  const loadTemplate = async (projectId: string, phase: string, template: PhaseTemplate) => {
    const existing = getInstance(projectId, phase)
    const customData = {
      content: template.content || '',
      steps: template.steps.map(s => ({ ...s, id: crypto.randomUUID() })),
      show_file_footer: (template as unknown as { show_file_footer?: boolean }).show_file_footer || false,
      show_feedback_footer: (template as unknown as { show_feedback_footer?: boolean }).show_feedback_footer || false,
    }

    if (existing) {
      await supabase.from('project_phases').update({
        template_id: template.id,
        custom_data: customData,
      }).eq('id', existing.id)
    } else {
      await supabase.from('project_phases').insert({
        project_id: projectId,
        phase,
        template_id: template.id,
        custom_data: customData,
        status: 'active',
      })
    }
    await fetchPhaseInstances()
    setEditingInstance({ content: customData.content, steps: customData.steps, show_file_footer: customData.show_file_footer, show_feedback_footer: customData.show_feedback_footer })
  }

  const openInstanceEditor = (instance: ProjectPhaseInstance) => {
    const customData = instance.custom_data || { content: '', steps: [] }
    setEditingInstance({
      content: customData.content || '',
      steps: customData.steps || [],
      show_file_footer: customData.show_file_footer || false,
      show_feedback_footer: customData.show_feedback_footer || false,
    })
  }

  const saveInstance = async (projectId: string, phase: string) => {
    if (!editingInstance) return
    setSavingInstance(true)
    const instance = getInstance(projectId, phase)

    // Preserve intake links in custom_data
    const links = intakeLinks[projectId]
    const dataToSave: Record<string, unknown> = { ...editingInstance }
    if (phase === 'intake' && links) {
      dataToSave.linked_quote_id = links.quote_id || undefined
      dataToSave.linked_invoice_id = links.invoice_id || undefined
      dataToSave.linked_assignment_id = links.assignment_id || undefined

      // Auto-propagate linked quote/invoice/assignment to buttons + unfade die stappen.
      const steps = dataToSave.steps as PhaseStep[]
      for (const step of steps) {
        if (!step.elements) continue
        for (const el of step.elements) {
          if (el.type === 'button' && el.data.action === 'quote' && links.quote_id) {
            el.data.quoteId = links.quote_id
            if (step.faded) step.faded = false
          }
          if (el.type === 'button' && el.data.action === 'invoice' && links.invoice_id) {
            el.data.invoiceId = links.invoice_id
            if (step.faded) step.faded = false
          }
          if (el.type === 'button' && el.data.action === 'assignment' && links.assignment_id) {
            el.data.assignmentId = links.assignment_id
            if (step.faded) step.faded = false
          }
        }
      }
    }

    if (instance) {
      await supabase.from('project_phases').update({
        custom_data: dataToSave,
      }).eq('id', instance.id)
    }

    // Auto-set linked quotes to 'sent' status
    const quoteIds: string[] = []
    for (const step of editingInstance.steps) {
      if (step.elements) {
        for (const el of step.elements) {
          if (el.type === 'button' && el.data.action === 'quote' && el.data.quoteId) {
            quoteIds.push(el.data.quoteId)
          }
        }
      }
    }
    if (quoteIds.length > 0) {
      await supabase.from('quotes').update({ status: 'sent' }).in('id', quoteIds).eq('status', 'draft')
    }

    await fetchPhaseInstances()

    // Send notification for card update
    const project = projects.find(p => p.id === projectId)
    if (project) {
      createNotification(projectId, 'card_update', 'Je portaal is bijgewerkt', `De ${phaseLabels[phase as ProjectPhase] || phase}-fase is bijgewerkt.`)
    }

    setSavingInstance(false)
  }

  const updateInstanceStep = (index: number, field: string, value: string | boolean | CardElement[]) => {
    if (!editingInstance) return
    const newSteps = [...editingInstance.steps]
    newSteps[index] = { ...newSteps[index], [field]: value }
    setEditingInstance({ ...editingInstance, steps: newSteps })
  }

  const addInstanceStep = () => {
    if (!editingInstance) return
    setEditingInstance({
      ...editingInstance,
      steps: [...editingInstance.steps, { id: crypto.randomUUID(), title: '', description: '', completed: false, faded: false }],
    })
  }

  const removeInstanceStep = (index: number) => {
    if (!editingInstance) return
    setEditingInstance({
      ...editingInstance,
      steps: editingInstance.steps.filter((_, i) => i !== index),
    })
  }

  const toggleStepCompleted = async (projectId: string, phase: string, stepId: string) => {
    const instance = getInstance(projectId, phase)
    if (!instance?.custom_data?.steps) return

    const stepTitle = instance.custom_data.steps.find((s: PhaseStep) => s.id === stepId)?.title || 'deze stap'
    const isCompleted = instance.custom_data.steps.find((s: PhaseStep) => s.id === stepId)?.completed
    const action = isCompleted ? 'als niet voltooid markeren' : 'als voltooid markeren'

    if (!confirm(`Weet je zeker dat je "${stepTitle}" wilt ${action}?`)) return

    const updatedSteps = instance.custom_data.steps.map((s: PhaseStep) =>
      s.id === stepId ? { ...s, completed: !s.completed } : s
    )
    await supabase.from('project_phases').update({
      custom_data: { ...instance.custom_data, steps: updatedSteps },
    }).eq('id', instance.id)
    await fetchPhaseInstances()

    // Also update editingInstance if open
    if (editingInstance) {
      setEditingInstance({
        ...editingInstance,
        steps: editingInstance.steps.map(s => s.id === stepId ? { ...s, completed: !s.completed } : s),
      })
    }
  }

  const toggleStepFaded = (index: number) => {
    if (!editingInstance) return
    const newSteps = [...editingInstance.steps]
    newSteps[index] = { ...newSteps[index], faded: !newSteps[index].faded }
    setEditingInstance({ ...editingInstance, steps: newSteps })
  }

  const toggleExpand = (projectId: string) => {
    if (expandedProject === projectId) {
      setExpandedProject(null)
      setEditingInstance(null)
    } else {
      setExpandedProject(projectId)
      const project = projects.find(p => p.id === projectId)
      if (project) {
        const phase = activePhaseTab[projectId] || project.current_phase
        setActivePhaseTab(prev => ({ ...prev, [projectId]: phase }))
        const instance = getInstance(projectId, phase)
        if (instance) {
          openInstanceEditor(instance)
        } else {
          setEditingInstance(null)
        }
      }
    }
  }

  const switchPhaseTab = (projectId: string, phase: ProjectPhase) => {
    setActivePhaseTab(prev => ({ ...prev, [projectId]: phase }))
    setReloadDropdownId(null)
    const instance = getInstance(projectId, phase)
    if (instance) {
      openInstanceEditor(instance)
    } else {
      setEditingInstance(null)
    }
  }

  // Helper to format datetime-local value for the input
  const toDatetimeLocal = (isoString: string | null) => {
    if (!isoString) return ''
    const d = new Date(isoString)
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  // Projects after viewMode + search + phase + client filters, before letter filter.
  // Used to determine which letters have available projects (so empty letters can be faded).
  const baseFilteredProjects = projects.filter((p) => {
    const projectStatus = p.status || 'active'
    if (viewMode === 'active' && projectStatus !== 'active') return false
    if (viewMode === 'archived' && projectStatus !== 'archived') return false
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (filterPhase !== 'all' && p.current_phase !== filterPhase) return false
    if (filterClient !== 'all' && p.client_id !== filterClient) return false
    return true
  })

  const lettersWithProjects = new Set(
    baseFilteredProjects.map((p) => (p.name?.[0] || '').toLowerCase()).filter((c) => /[a-z]/.test(c))
  )

  const filteredProjects = projects.filter((p) => {
    const projectStatus = p.status || 'active'
    if (viewMode === 'active' && projectStatus !== 'active') return false
    if (viewMode === 'archived' && projectStatus !== 'archived') return false
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (filterPhase !== 'all' && p.current_phase !== filterPhase) return false
    if (filterClient !== 'all' && p.client_id !== filterClient) return false
    if (filterLetter !== 'all' && (p.name?.[0] || '').toLowerCase() !== filterLetter) return false
    return true
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6 sm:mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Domeinen</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">Beheer je domeinen</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setViewMode('active')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${viewMode === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Actief
            </button>
            <button
              type="button"
              onClick={() => setViewMode('archived')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${viewMode === 'archived' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Archive className="w-3.5 h-3.5" />
              Gearchiveerd
            </button>
          </div>
          {viewMode === 'active' && (
            <button onClick={() => { setFormData(emptyForm); setShowForm(true) }}
              className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors text-sm">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nieuw domein</span>
              <span className="sm:hidden">Nieuw</span>
            </button>
          )}
        </div>
      </div>

      {/* Alfabet-balk */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-3 py-2 mb-3 flex items-center gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setFilterLetter('all')}
          className={`px-2.5 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors flex-shrink-0 ${
            filterLetter === 'all'
              ? 'bg-primary text-white'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Alle
        </button>
        <div className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />
        {Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i)).map((letter) => {
          const hasProjects = lettersWithProjects.has(letter)
          const isActive = filterLetter === letter
          return (
            <button
              key={letter}
              type="button"
              onClick={() => setFilterLetter(letter)}
              disabled={!hasProjects && !isActive}
              className={`w-7 h-7 text-xs sm:text-sm font-medium rounded-md transition-colors flex-shrink-0 uppercase ${
                isActive
                  ? 'bg-primary text-white'
                  : hasProjects
                  ? 'text-gray-700 hover:bg-gray-100'
                  : 'text-gray-300 cursor-not-allowed'
              }`}
            >
              {letter}
            </button>
          )
        })}
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Zoeken op domeinnaam..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={filterPhase}
            onChange={(e) => setFilterPhase(e.target.value as ProjectPhase | 'all')}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white cursor-pointer"
          >
            <option value="all">Alle fasen</option>
            {(Object.entries(phaseLabels) as [ProjectPhase, string][]).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white cursor-pointer"
          >
            <option value="all">Alle klanten</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        {(searchQuery || filterPhase !== 'all' || filterClient !== 'all' || filterLetter !== 'all') && (
          <span className="text-xs text-gray-400">
            {filteredProjects.length} van {projects.length} domeinen
          </span>
        )}
      </div>

      {/* Create modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Nieuw domein</h2>
              <button onClick={closeForm} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Domeinnaam</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm"
                  placeholder="bijv. Bakkerij De Gouden Aar" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Website URL</label>
                <div className="relative">
                  <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="url" value={formData.url} onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm"
                    placeholder="https://voorbeeld.nl" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Klant koppelen</label>
                <select value={formData.client_id} onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm">
                  <option value="">Geen klant (later koppelen)</option>
                  {clients.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Verwachte opleverdatum</label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeForm} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Annuleren</button>
                <button type="submit" className="flex-1 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">Aanmaken</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Projects list */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm animate-pulse"><div className="h-28" /></div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nog geen domeinen</h3>
          <p className="text-gray-500 mt-1">Maak je eerste domein aan om te beginnen.</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Geen resultaten</h3>
          <p className="text-gray-500 mt-1">Pas je filters aan om domeinen te vinden.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProjects.map((project) => {
            const isExpanded = expandedProject === project.id
            const currentTab = activePhaseTab[project.id] || project.current_phase
            const tabInstance = getInstance(project.id, currentTab)
            const tabTemplates = getTemplatesForPhase(currentTab)

            return (
              <div key={project.id} className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow overflow-hidden">
                {/* ── Sectie 1: Header ── */}
                <div className="bg-gray-50/80 px-5 sm:px-6 py-4 border-b border-gray-100">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <InlineEdit value={project.name} onSave={(name) => updateProject(project.id, { name })} displayValue={project.name} placeholder="Domeinnaam" />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="relative" ref={phaseDropdownId === project.id ? phaseDropdownRef : undefined}>
                        <button onClick={() => setPhaseDropdownId(phaseDropdownId === project.id ? null : project.id)}
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${phaseColors[project.current_phase]}`}>
                          {phaseLabels[project.current_phase]}
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {phaseDropdownId === project.id && (
                          <div className="absolute top-full right-0 mt-1.5 bg-white rounded-xl shadow-xl shadow-gray-200/50 border border-gray-100 py-1 z-50 min-w-[160px]">
                            {(Object.entries(phaseLabels) as [ProjectPhase, string][]).map(([key, label]) => (
                              <button key={key} onClick={() => handlePhaseChange(project, key)}
                                className={`flex items-center gap-2.5 w-full px-3.5 py-2 text-sm transition-colors ${key === project.current_phase ? 'bg-gray-50 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${key === project.current_phase ? 'bg-primary' : 'bg-gray-300'}`} />
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="relative" ref={settingsDropdownId === project.id ? settingsDropdownRef : undefined}>
                        <button onClick={() => setSettingsDropdownId(settingsDropdownId === project.id ? null : project.id)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" title="Instellingen">
                          <Settings className="w-4 h-4" />
                        </button>
                        {settingsDropdownId === project.id && (
                          <div className="absolute top-full right-0 mt-1.5 bg-white rounded-xl shadow-xl shadow-gray-200/50 border border-gray-100 py-1 z-50 min-w-[220px]">
                            {/* API Key */}
                            <div className="px-3.5 py-2.5">
                              <div className="flex items-center gap-2 mb-1.5">
                                <Key className="w-3.5 h-3.5 text-gray-400" />
                                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">API Key</span>
                              </div>
                              {project.api_key ? (
                                <div className="flex items-center gap-1.5">
                                  <code className="text-xs text-gray-500 font-mono truncate flex-1">{project.api_key}</code>
                                  <button
                                    onClick={() => { navigator.clipboard.writeText(project.api_key!) }}
                                    className="p-1 text-gray-400 hover:text-primary rounded hover:bg-primary/5 transition-colors"
                                    title="Kopieer"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => { if (confirm('API key verwijderen?')) updateProject(project.id, { api_key: null }) }}
                                    className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors"
                                    title="Verwijderen"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => updateProject(project.id, { api_key: crypto.randomUUID() })}
                                  className="text-[11px] text-primary hover:text-primary/80 font-medium transition-colors"
                                >
                                  Genereer API key
                                </button>
                              )}
                            </div>
                            <div className="border-t border-gray-100 my-1" />
                            {/* Archive / Restore */}
                            {(project.status || 'active') === 'active' ? (
                              <button
                                onClick={() => { setSettingsDropdownId(null); handleArchive(project.id) }}
                                className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                              >
                                <Archive className="w-4 h-4" />
                                Archiveren
                              </button>
                            ) : (
                              <button
                                onClick={() => { setSettingsDropdownId(null); handleRestore(project.id) }}
                                className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-green-700 hover:bg-green-50 transition-colors"
                              >
                                <ArchiveRestore className="w-4 h-4" />
                                Herstellen
                              </button>
                            )}
                            {/* Delete */}
                            <button
                              onClick={() => { setSettingsDropdownId(null); handleDelete(project.id) }}
                              className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              {(project.status || 'active') === 'archived' ? 'Definitief verwijderen' : 'Verwijderen'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Sectie 4: Templates ── */}
                <div className="border-t border-gray-100">
                  <button onClick={() => toggleExpand(project.id)}
                    className="w-full px-5 sm:px-6 py-3 flex items-center justify-between text-sm hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-600">Templates</span>
                      {(() => {
                        const loadedCount = phases.filter(p => getInstance(project.id, p)).length
                        return loadedCount > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">
                            {loadedCount}/{phases.length} fases
                          </span>
                        ) : null
                      })()}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100">
                      <div className="flex overflow-x-auto border-b border-gray-100">
                        {phases.map((phase) => {
                          const isActive = currentTab === phase
                          const hasInstance = !!getInstance(project.id, phase)
                          const isCurrent = phase === project.current_phase
                          const colors = phaseTabColors[phase]
                          return (
                            <button key={phase} onClick={() => switchPhaseTab(project.id, phase)}
                              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                                isActive ? colors.active : `border-transparent ${colors.inactive}`
                              }`}>
                              {hasInstance && (
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                              )}
                              {phaseLabels[phase]}
                              {isCurrent && (
                                <span className="text-[9px] font-bold uppercase tracking-wider opacity-50">actief</span>
                              )}
                            </button>
                          )
                        })}
                      </div>

                      <div className="px-5 sm:px-6 py-5 sm:py-6">
                        {!tabInstance && (
                          <div>
                            {tabTemplates.length > 0 ? (
                              <div>
                                <p className="text-sm text-gray-500 mb-3">
                                  Kies een template om in te laden voor de fase <span className="font-medium">{phaseLabels[currentTab]}</span>:
                                </p>
                                <div className="space-y-2">
                                  {tabTemplates.map((t) => (
                                    <button key={t.id} onClick={() => loadTemplate(project.id, currentTab, t)}
                                      className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-primary hover:bg-primary/5 transition-colors text-left">
                                      <div>
                                        <p className="text-sm font-medium text-gray-900">{t.title}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">{t.steps?.length || 0} stappen</p>
                                      </div>
                                      <Layers className="w-4 h-4 text-gray-400" />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-6">
                                <p className="text-sm text-gray-400">Geen templates beschikbaar voor de fase &quot;{phaseLabels[currentTab]}&quot;.</p>
                                <p className="text-xs text-gray-400 mt-1">Maak eerst een template aan via het Templates menu.</p>
                              </div>
                            )}
                          </div>
                        )}

                        {tabInstance && editingInstance && (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-gray-400">
                                Template ingeladen voor <span className="font-medium">{phaseLabels[currentTab]}</span>. Bewerk hieronder de inhoud specifiek voor dit domein.
                              </p>
                              {tabTemplates.length > 0 && (
                                <div className="relative" ref={reloadDropdownId === `${project.id}_${currentTab}` ? reloadDropdownRef : undefined}>
                                  {tabTemplates.length === 1 ? (
                                    <button onClick={() => { if (confirm('Template opnieuw inladen? Domein-specifieke aanpassingen worden overschreven.')) loadTemplate(project.id, currentTab, tabTemplates[0]) }}
                                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary transition-colors whitespace-nowrap">
                                      <RotateCcw className="w-3 h-3" />
                                      Herlaad
                                    </button>
                                  ) : (
                                    <>
                                      <button onClick={() => setReloadDropdownId(reloadDropdownId === `${project.id}_${currentTab}` ? null : `${project.id}_${currentTab}`)}
                                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary transition-colors whitespace-nowrap">
                                        <RotateCcw className="w-3 h-3" />
                                        Herlaad
                                      </button>
                                      {reloadDropdownId === `${project.id}_${currentTab}` && (
                                        <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50 min-w-[180px]">
                                          {tabTemplates.map((t) => (
                                            <button key={t.id} onClick={() => { setReloadDropdownId(null); if (confirm(`Template "${t.title}" opnieuw inladen?`)) loadTemplate(project.id, currentTab, t) }}
                                              className="w-full px-3 py-2 text-xs text-left text-gray-600 hover:bg-gray-50 transition-colors">
                                              {t.title}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1.5">Inhoud (zichtbaar voor klant)</label>
                              <textarea value={editingInstance.content}
                                onChange={(e) => setEditingInstance({ ...editingInstance, content: e.target.value })}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm resize-none"
                                rows={3} placeholder="Tekst of instructies voor de klant..." />
                            </div>

                            <div className="flex flex-wrap gap-x-6 gap-y-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editingInstance.show_file_footer || false}
                                  onChange={(e) => setEditingInstance({ ...editingInstance, show_file_footer: e.target.checked })}
                                  className="w-3.5 h-3.5 rounded text-primary border-gray-300 focus:ring-primary/30"
                                />
                                <span className="text-xs text-gray-600">Bestanden delen footer</span>
                              </label>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-medium text-gray-500">Cards (zichtbaar voor klant)</label>
                                <button type="button" onClick={addInstanceStep}
                                  className="flex items-center gap-1 text-xs text-primary hover:text-primary-600 font-medium transition-colors">
                                  <Plus className="w-3 h-3" />
                                  Card toevoegen
                                </button>
                              </div>
                              {editingInstance.steps.length === 0 ? (
                                <div className="border border-dashed border-gray-200 rounded-lg p-4 text-center">
                                  <p className="text-xs text-gray-400">Nog geen cards.</p>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {editingInstance.steps.map((step, index) => {
                                    const isStepExpanded = expandedStepId === step.id
                                    const elemCount = step.elements?.length || 0
                                    return (
                                      <div key={step.id} className={`border border-gray-200 rounded-lg overflow-hidden ${step.faded ? 'bg-amber-50/50 border-amber-200' : 'bg-gray-50'} ${step.completed ? 'ring-2 ring-green-200' : ''}`}>
                                        <div className="flex gap-2 items-start p-3">
                                          <div className="flex-1">
                                            <input type="text" value={step.title}
                                              onChange={(e) => updateInstanceStep(index, 'title', e.target.value)}
                                              className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                                              placeholder="Card titel" />
                                          </div>
                                          <div className="flex items-center gap-0.5 mt-1">
                                            <button
                                              type="button"
                                              onClick={() => toggleStepCompleted(project.id, currentTab, step.id)}
                                              className={`p-1 rounded transition-colors ${step.completed ? 'text-green-500 hover:text-green-700 bg-green-50' : 'text-gray-400 hover:text-green-500 hover:bg-green-50'}`}
                                              title={step.completed ? 'Markeer als niet voltooid' : 'Markeer als voltooid'}
                                            >
                                              <CheckCircle className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => toggleStepFaded(index)}
                                              className={`p-1 rounded transition-colors ${step.faded ? 'text-amber-500 hover:text-amber-700 bg-amber-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                                              title={step.faded ? 'Zichtbaar maken' : 'Faden (nog niet aan de beurt)'}
                                            >
                                              {step.faded ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                            </button>
                                            <button type="button" onClick={() => removeInstanceStep(index)}
                                              className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors">
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </div>
                                        <button type="button" onClick={() => setExpandedStepId(isStepExpanded ? null : step.id)}
                                          className="w-full flex items-center justify-between px-3 py-2 border-t border-gray-200 hover:bg-gray-100 transition-colors">
                                          <span className="text-xs font-medium text-gray-500">
                                            {elemCount} {elemCount === 1 ? 'element' : 'elementen'}
                                          </span>
                                          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isStepExpanded ? 'rotate-180' : ''}`} />
                                        </button>
                                        {isStepExpanded && (
                                          <div className="px-3 pb-3 pt-2 border-t border-gray-200 bg-white">
                                            <CardElementsEditor
                                              elements={step.elements || []}
                                              onChange={(elements) => updateInstanceStep(index, 'elements', elements)}
                                              projectId={project.id}
                                            />
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>

                            <div className="flex justify-end">
                              <button onClick={() => saveInstance(project.id, currentTab)}
                                disabled={savingInstance}
                                className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                                <Save className="w-4 h-4" />
                                {savingInstance ? 'Opslaan...' : 'Opslaan'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Sectie 5: Fase-inhoud tabs ── */}
                <div className="border-t border-gray-100">
                  <div className="flex border-b border-gray-100 px-5 sm:px-6 overflow-x-auto">
                    {(() => {
                      const activeTab = domainCardTab[project.id] || 'algemeen'
                      return (
                        <button
                          key="algemeen"
                          onClick={() => setDomainCardTab(prev => ({ ...prev, [project.id]: 'algemeen' }))}
                          className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'algemeen'
                              ? 'border-gray-700 text-gray-900'
                              : 'border-transparent text-gray-400 hover:text-gray-600'
                          }`}
                        >
                          Algemeen
                        </button>
                      )
                    })()}
                    {phases.map((phase) => {
                      const activeTab = domainCardTab[project.id] || 'algemeen'
                      const colors = phaseTabColors[phase]
                      return (
                        <button key={phase}
                          onClick={() => setDomainCardTab(prev => ({ ...prev, [project.id]: phase }))}
                          className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === phase
                              ? colors.active
                              : `border-transparent ${colors.inactive}`
                          }`}
                        >
                          {phaseLabels[phase]}
                        </button>
                      )
                    })}
                  </div>

                    {/* Algemeen tab content */}
                    {(domainCardTab[project.id] || 'algemeen') === 'algemeen' && (
                      <div className="px-5 sm:px-6 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Website</p>
                            {project.url && (
                              <div className="flex items-center gap-1.5">
                                <Globe className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:text-primary-600 transition-colors truncate">
                                  {project.url.replace(/^https?:\/\//, '')}
                                </a>
                                <ExternalLink className="w-3 h-3 text-primary/50 flex-shrink-0" />
                              </div>
                            )}
                            <InlineEdit value={project.url || ''} onSave={(url) => updateProject(project.id, { url: url || null })} type="url"
                              placeholder={project.url ? 'Wijzig URL' : 'URL toevoegen'} icon={Pencil} displayValue={project.url ? '' : 'URL toevoegen'} />
                          </div>
                          <div className="space-y-1.5 sm:col-span-2">
                            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Klanten</p>
                            <div className="space-y-1">
                              {(projectClients[project.id] || []).length === 0 && project.client_id && (() => {
                                const clientName = (project.client as unknown as { name: string })?.name || 'Onbekend'
                                return (
                                  <div className="bg-amber-50 rounded-lg border border-amber-100 px-3 py-2 flex items-center gap-2">
                                    <Users className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                    <span className="text-sm font-medium text-gray-700 flex-1 truncate">{clientName}</span>
                                    <button
                                      onClick={() => addClientToProject(project.id, project.client_id!)}
                                      className="text-xs text-primary hover:text-primary-600 font-medium whitespace-nowrap"
                                    >
                                      Activeer
                                    </button>
                                  </div>
                                )
                              })()}
                              {(projectClients[project.id] || []).map((pc) => {
                                const clientName = (pc.client as unknown as { name: string })?.name || 'Onbekend'
                                const clientEmail = (pc.client as unknown as { email: string })?.email || ''
                                const isClientExpanded = expandedClientId === pc.id
                                return (
                                  <div key={pc.id} className="bg-gray-50 rounded-lg border border-gray-100">
                                    <button
                                      onClick={() => setExpandedClientId(isClientExpanded ? null : pc.id)}
                                      className="flex items-center gap-2 w-full px-3 py-2 text-left"
                                    >
                                      <Users className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                      <span className="text-sm font-medium text-gray-700 flex-1 truncate">{clientName}</span>
                                      <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isClientExpanded ? 'rotate-180' : ''}`} />
                                    </button>
                                    {isClientExpanded && (
                                      <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                                        <p className="text-xs text-gray-400 mb-2">{clientEmail}</p>
                                        <div className="space-y-1.5">
                                          <label className="flex items-center gap-2 cursor-pointer group">
                                            <input type="checkbox" checked={pc.notify_invoices}
                                              onChange={(e) => toggleProjectClientPref(pc.id, 'notify_invoices', e.target.checked, project.id)}
                                              className="w-3.5 h-3.5 rounded text-primary border-gray-300 focus:ring-primary/30" />
                                            <FileText className="w-3.5 h-3.5 text-gray-400" />
                                            <span className="text-xs text-gray-600 group-hover:text-gray-800">Factuur e-mails</span>
                                          </label>
                                          <label className="flex items-center gap-2 cursor-pointer group">
                                            <input type="checkbox" checked={pc.notify_quotes}
                                              onChange={(e) => toggleProjectClientPref(pc.id, 'notify_quotes', e.target.checked, project.id)}
                                              className="w-3.5 h-3.5 rounded text-primary border-gray-300 focus:ring-primary/30" />
                                            <FileCheck className="w-3.5 h-3.5 text-gray-400" />
                                            <span className="text-xs text-gray-600 group-hover:text-gray-800">Offerte e-mails</span>
                                          </label>
                                          <label className="flex items-center gap-2 cursor-pointer group">
                                            <input type="checkbox" checked={pc.notify_portal}
                                              onChange={(e) => toggleProjectClientPref(pc.id, 'notify_portal', e.target.checked, project.id)}
                                              className="w-3.5 h-3.5 rounded text-primary border-gray-300 focus:ring-primary/30" />
                                            <Bell className="w-3.5 h-3.5 text-gray-400" />
                                            <span className="text-xs text-gray-600 group-hover:text-gray-800">Portaal meldingen</span>
                                          </label>
                                          <label className="flex items-center gap-2 cursor-pointer group">
                                            <input type="checkbox" checked={pc.notify_tickets}
                                              onChange={(e) => toggleProjectClientPref(pc.id, 'notify_tickets', e.target.checked, project.id)}
                                              className="w-3.5 h-3.5 rounded text-primary border-gray-300 focus:ring-primary/30" />
                                            <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                                            <span className="text-xs text-gray-600 group-hover:text-gray-800">Ticket reacties</span>
                                          </label>
                                          <label className="flex items-center gap-2 cursor-pointer group">
                                            <input type="checkbox" checked={pc.notify_punch_cards}
                                              onChange={(e) => toggleProjectClientPref(pc.id, 'notify_punch_cards', e.target.checked, project.id)}
                                              className="w-3.5 h-3.5 rounded text-primary border-gray-300 focus:ring-primary/30" />
                                            <Ticket className="w-3.5 h-3.5 text-gray-400" />
                                            <span className="text-xs text-gray-600 group-hover:text-gray-800">Strippenkaart afschrijvingen</span>
                                          </label>
                                        </div>
                                        <button
                                          onClick={() => { if (confirm(`${clientName} verwijderen van dit domein?`)) removeClientFromProject(pc.id, project.id) }}
                                          className="flex items-center gap-1 mt-2 text-xs text-red-400 hover:text-red-600 transition-colors"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                          Ontkoppelen
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                            <div className="relative" ref={clientDropdownId === project.id ? clientDropdownRef : undefined}>
                              <button onClick={() => setClientDropdownId(clientDropdownId === project.id ? null : project.id)}
                                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary transition-colors mt-1">
                                <UserPlus className="w-3.5 h-3.5" />
                                <span>Klant toevoegen</span>
                              </button>
                              {clientDropdownId === project.id && (
                                <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl shadow-xl shadow-gray-200/50 border border-gray-100 py-1 z-50 min-w-[200px]">
                                  {clients
                                    .filter(c => !(projectClients[project.id] || []).some(pc => pc.client_id === c.id))
                                    .map((c) => (
                                      <button key={c.id} onClick={() => { addClientToProject(project.id, c.id); setClientDropdownId(null) }}
                                        className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                                        <UserPlus className="w-3.5 h-3.5 text-gray-400" />
                                        {c.name}
                                      </button>
                                    ))}
                                  {clients.filter(c => !(projectClients[project.id] || []).some(pc => pc.client_id === c.id)).length === 0 && (
                                    <p className="px-3.5 py-2 text-xs text-gray-400 italic">Alle klanten al gekoppeld</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Intake tab content */}
                    {(domainCardTab[project.id] || 'algemeen') === 'intake' && (
                      <div className="px-5 sm:px-6 py-4 space-y-4">
                        {/* Datums — altijd zichtbaar in Intake-fase */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="flex items-center gap-3 bg-gray-50 rounded-lg border border-gray-100 px-3 py-2">
                            <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Opleverdatum</p>
                              <input type="date" value={project.due_date || ''}
                                onChange={(e) => updateProject(project.id, { due_date: e.target.value || null })}
                                className="text-sm text-gray-700 bg-transparent border-none p-0 focus:outline-none focus:ring-0 cursor-pointer hover:text-primary transition-colors w-full" />
                            </div>
                          </div>
                          <div className="flex items-center gap-3 bg-gray-50 rounded-lg border border-gray-100 px-3 py-2">
                            <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Startgesprek</p>
                              <input type="datetime-local" value={toDatetimeLocal(project.start_meeting_at)}
                                onChange={(e) => updateProject(project.id, { start_meeting_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                                className="text-sm text-gray-700 bg-transparent border-none p-0 focus:outline-none focus:ring-0 cursor-pointer hover:text-primary transition-colors w-full" />
                            </div>
                          </div>
                        </div>

                        {/* Offerte/opdracht/factuur koppelingen — alleen als er een intake-instance is */}
                        {getInstance(project.id, 'intake') && (() => {
                          const links = intakeLinks[project.id] || { quote_id: '', invoice_id: '', assignment_id: '' }
                          const quotes = projectQuotes[project.id]
                          const invoices = projectInvoices[project.id]
                          const assignments = projectAssignments[project.id]

                          if (!quotes && !invoices && !assignments) {
                            fetchProjectQuotesAndInvoices(project.id)
                            return <p className="text-xs text-gray-400">Laden...</p>
                          }

                          const intakeInstance = getInstance(project.id, 'intake')
                          const fadedWarnings: string[] = []
                          if (intakeInstance?.custom_data?.steps) {
                            for (const step of intakeInstance.custom_data.steps) {
                              if (!step.faded || !step.elements) continue
                              for (const el of step.elements) {
                                if (el.type === 'button') {
                                  if (el.data.action === 'quote' && links.quote_id) {
                                    fadedWarnings.push(`"${step.title || 'Naamloos'}" bevat een offerte-knop`)
                                  }
                                  if (el.data.action === 'assignment' && links.assignment_id) {
                                    fadedWarnings.push(`"${step.title || 'Naamloos'}" bevat een opdracht-knop`)
                                  }
                                }
                              }
                            }
                          }

                          return (
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Offerte</label>
                                  <div className="flex items-center gap-2">
                                    <FileCheck className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                    <select
                                      value={links.quote_id}
                                      onChange={(e) => {
                                        const newLinks = { ...links, quote_id: e.target.value }
                                        setIntakeLinks(prev => ({ ...prev, [project.id]: newLinks }))
                                        saveIntakeLinks(project.id, e.target.value, links.invoice_id, links.assignment_id)
                                      }}
                                      className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                                    >
                                      <option value="">Geen offerte</option>
                                      {(quotes || []).map((q) => (
                                        <option key={q.id} value={q.id}>
                                          {q.number} — €{((q.items || []).reduce((sum, it) => sum + (it.quantity || 0) * (it.price || 0), 0)).toFixed(2)}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Opdracht</label>
                                  <div className="flex items-center gap-2">
                                    <ClipboardCheck className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                    <select
                                      value={links.assignment_id}
                                      onChange={(e) => {
                                        const newLinks = { ...links, assignment_id: e.target.value }
                                        setIntakeLinks(prev => ({ ...prev, [project.id]: newLinks }))
                                        saveIntakeLinks(project.id, links.quote_id, links.invoice_id, e.target.value)
                                      }}
                                      className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                                    >
                                      <option value="">Geen opdracht</option>
                                      {(assignments || []).map((a) => (
                                        <option key={a.id} value={a.id}>{a.title}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Factuur</label>
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                    <select
                                      value={links.invoice_id}
                                      onChange={(e) => {
                                        const newLinks = { ...links, invoice_id: e.target.value }
                                        setIntakeLinks(prev => ({ ...prev, [project.id]: newLinks }))
                                        saveIntakeLinks(project.id, links.quote_id, e.target.value, links.assignment_id)
                                      }}
                                      className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                                    >
                                      <option value="">Geen factuur</option>
                                      {(invoices || []).map((inv) => (
                                        <option key={inv.id} value={inv.id}>
                                          {inv.number} — €{inv.amount.toFixed(2)}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                              {fadedWarnings.length > 0 && (
                                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                  <div className="text-xs text-amber-700">
                                    <p className="font-medium mb-0.5">Stappen niet zichtbaar voor klant:</p>
                                    {fadedWarnings.map((w, i) => (
                                      <p key={i}>• {w}</p>
                                    ))}
                                    <p className="mt-1 text-amber-600">Maak deze stappen zichtbaar zodat de klant ze kan zien.</p>
                                  </div>
                                </div>
                              )}
                              {savingIntakeLinks === project.id && (
                                <p className="text-xs text-primary">Opslaan...</p>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )}

                    {/* Design tab content */}
                    {(domainCardTab[project.id] || 'algemeen') === 'design' && (() => {
                      const imgs = designImages[project.id] || { styleguide: '', homepage: '', tweede: '' }
                      const designInstance = getInstance(project.id, 'design')
                      const approvals = (designInstance?.custom_data?.design_approvals || {}) as Record<string, { status?: string; declined_reason?: string; declined_name?: string; declined_at?: string; accepted_at?: string }>
                      const keyToApprovalType: Record<string, string> = { styleguide: 'styleguide', homepage: 'homepage', tweede: 'contactpage' }
                      const fields: { key: 'styleguide' | 'homepage' | 'tweede'; label: string }[] = [
                        { key: 'styleguide', label: 'Styleguide' },
                        { key: 'homepage', label: 'Homepage' },
                        { key: 'tweede', label: 'Contactpagina' },
                      ]
                      return (
                        <div className="px-5 sm:px-6 py-4">
                          <div className="grid grid-cols-3 gap-3">
                          {fields.map(({ key, label }) => {
                            const approval = approvals[keyToApprovalType[key]]
                            const isDeclined = approval?.status === 'declined'
                            const isAccepted = approval?.status === 'accepted'
                            const imageUrl = imgs[key]
                            const isUploading = uploadingDesignImage === `${project.id}_${key}`
                            return (
                              <div key={key}>
                                <div className="flex items-center gap-1.5 mb-2">
                                  {isDeclined ? (
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                                  ) : isAccepted ? (
                                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                                  ) : (
                                    <Palette className="w-3.5 h-3.5 text-gray-400" />
                                  )}
                                  <label className={`text-[11px] font-medium uppercase tracking-wider ${isDeclined ? 'text-red-500' : isAccepted ? 'text-green-500' : 'text-gray-400'}`}>{label}</label>
                                  {isDeclined && (
                                    <span className="text-[10px] font-medium text-red-500 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">Afgekeurd</span>
                                  )}
                                  {isAccepted && (
                                    <span className="text-[10px] font-medium text-green-600 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">Goedgekeurd</span>
                                  )}
                                </div>
                                {isDeclined && approval.declined_reason && (
                                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                                    <div className="text-xs text-red-700">
                                      <p className="font-medium">Feedback van {approval.declined_name || 'klant'}:</p>
                                      <p className="mt-0.5">{approval.declined_reason}</p>
                                    </div>
                                  </div>
                                )}
                                {imageUrl ? (
                                  <div className={`relative rounded-lg overflow-hidden border-2 ${
                                    isDeclined ? 'border-red-500' : isAccepted ? 'border-green-500' : 'border-gray-200'
                                  }`}>
                                    <img src={imageUrl} alt={label} className="w-full h-auto max-h-48 object-cover object-top" />
                                    <div className="absolute top-2 right-2 flex gap-1">
                                      <label className="p-1.5 bg-white/90 rounded-lg shadow-sm cursor-pointer hover:bg-white transition-colors" title="Vervangen">
                                        <Upload className="w-3.5 h-3.5 text-gray-600" />
                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="hidden"
                                          onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) uploadDesignImage(project.id, key, file)
                                            e.target.value = ''
                                          }}
                                        />
                                      </label>
                                      <button
                                        onClick={() => removeDesignImage(project.id, key)}
                                        className="p-1.5 bg-white/90 rounded-lg shadow-sm hover:bg-red-50 transition-colors"
                                        title="Verwijderen"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <label className={`flex flex-col items-center justify-center gap-1.5 w-full h-16 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                                    isUploading ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary hover:bg-gray-50'
                                  }`}>
                                    {isUploading ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                        <span className="text-[11px] text-primary">Uploaden...</span>
                                      </>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <Upload className="w-3.5 h-3.5 text-gray-400" />
                                        <span className="text-[11px] text-gray-500">Klik om afbeelding te uploaden</span>
                                      </div>
                                    )}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      disabled={isUploading}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) uploadDesignImage(project.id, key, file)
                                        e.target.value = ''
                                      }}
                                    />
                                  </label>
                                )}
                              </div>
                            )
                          })}
                          </div>
                          {savingDesignImages === project.id && (
                            <p className="text-xs text-primary mt-2">Opslaan...</p>
                          )}
                        </div>
                      )
                    })()}

                    {/* Development tab content */}
                    {(domainCardTab[project.id] || 'algemeen') === 'development' && (
                      <div className="px-5 sm:px-6 py-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {renderUrlFields(project, [
                            { label: 'Bestanden delen', value: project.file_sharing_url, field: 'file_sharing_url', icon: Upload },
                            { label: 'Stagingsite', value: project.staging_url, field: 'staging_url', icon: Globe },
                          ], updateProject)}
                        </div>
                      </div>
                    )}

                    {/* Other phases — empty state */}
                    {!['algemeen', 'intake', 'design', 'development'].includes(domainCardTab[project.id] || 'algemeen') && (
                      <div className="px-5 sm:px-6 py-8 text-center">
                        <p className="text-sm text-gray-400">
                          Beheer de inhoud van deze fase via de Templates sectie hierboven.
                        </p>
                      </div>
                    )}
                </div>

              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
