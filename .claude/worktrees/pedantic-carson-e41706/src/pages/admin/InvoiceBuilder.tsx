import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { generateTestNumber } from '../../lib/testNumbering'
import type { Product, QuoteItem, InvoiceStatus, YearFormat, InvoiceSettings, RecurrenceInterval } from '../../types'
import {
  ArrowLeft,
  Save,
  Loader2,
  Check,
  Calendar,
  Clock,
  Globe,
  Package,
  Type,
  Minus,
  Trash2,
  GripVertical,
  Search,
  ChevronDown,
  Repeat,
  Percent,
  Mail,
  MapPin,
  User,
} from 'lucide-react'

function generateInvoiceNumber(
  prefix: string,
  yearFormat: YearFormat,
  startNumber: number,
  existingNumbers: string[]
): string {
  const currentYear = new Date().getFullYear()
  const yearStr = yearFormat === 'YY' ? String(currentYear).slice(-2) : String(currentYear)
  const basePrefix = `${prefix}${yearStr}`
  let maxNum = startNumber - 1
  for (const num of existingNumbers) {
    if (num.startsWith(basePrefix)) {
      const suffix = num.slice(basePrefix.length)
      const parsed = parseInt(suffix, 10)
      if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed
    }
  }
  return `${basePrefix}${maxNum + 1}`
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function plus14Days(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().split('T')[0]
}

function genId(): string {
  return crypto.randomUUID()
}

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '')

const statusLabels: Record<InvoiceStatus, string> = { draft: 'Concept', sent: 'Verzonden', paid: 'Betaald' }

const recurrenceLabels: Record<RecurrenceInterval, string> = {
  daily: 'Dagelijks',
  weekly: 'Wekelijks',
  monthly: 'Maandelijks',
  yearly: 'Jaarlijks',
}

// Berekent het eerstvolgende moment waarop een terugkerende factuur moet draaien.
// Tijd is lokale "verzendtijd" (HH:MM); we slaan UTC op zodat pg_cron het correct vergelijkt.
//
// Anker is de factuurdatum (YYYY-MM-DD) — dáár hoort de eerste run op te vallen.
// Ligt dat moment al in het verleden? Dan schuiven we met het interval door tot
// we boven 'now' zitten, zodat een vergeten factuur niet meteen retro-actief
// een hele reeks aanmaakt.
function computeNextRunAt(interval: RecurrenceInterval, sendTime: string, anchorDate: string): Date {
  const [hh, mm] = sendTime.split(':').map((n) => parseInt(n, 10))
  const now = new Date()
  const next = new Date(`${anchorDate}T00:00:00`)
  next.setHours(hh || 9, mm || 0, 0, 0)
  while (next <= now) {
    if (interval === 'daily') next.setDate(next.getDate() + 1)
    else if (interval === 'weekly') next.setDate(next.getDate() + 7)
    else if (interval === 'monthly') next.setMonth(next.getMonth() + 1)
    else if (interval === 'yearly') next.setFullYear(next.getFullYear() + 1)
  }
  return next
}

interface ProjectWithClients {
  id: string
  name: string
  clients: { client_id: string; client_name: string; client_email: string; client_address: string; notify_invoices: boolean }[]
}

export default function InvoiceBuilder() {
  const navigate = useNavigate()
  const { id: editId } = useParams()
  const [searchParams] = useSearchParams()
  const isTest = searchParams.get('test') === '1'
  const fromQuoteId = searchParams.get('from_quote')

  // Data
  const [projects, setProjects] = useState<ProjectWithClients[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings | null>(null)

  // Form state
  const [number, setNumber] = useState('')
  const [projectId, setProjectId] = useState('')
  const [clientId, setClientId] = useState('')

  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(todayStr())
  const [dueDate, setDueDate] = useState(plus14Days())
  const [status, setStatus] = useState<InvoiceStatus>('draft')
  const [items, setItems] = useState<QuoteItem[]>([])
  const [discountPercent, setDiscountPercent] = useState(0)
  const [btwPercent, setBtwPercent] = useState(21)
  const [notes, setNotes] = useState('')
  const [isTestInvoice, setIsTestInvoice] = useState(isTest)

  // Terugkerend
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceInterval, setRecurrenceInterval] = useState<RecurrenceInterval>('monthly')
  const [recurrenceSendTime, setRecurrenceSendTime] = useState('09:00')
  const [recurrenceNextRunAt, setRecurrenceNextRunAt] = useState<string | null>(null)
  const [recurrenceLastRunAt, setRecurrenceLastRunAt] = useState<string | null>(null)

  // Aanbetaling — bij save splitst de factuur in een aanbetalingsfactuur
  // (die het toegewezen nummer behoudt) + een restfactuur (TMP-nummer).
  // Alleen beschikbaar bij nieuwe facturen (niet bij edit).
  const [isDeposit, setIsDeposit] = useState(false)
  const [depositPercent, setDepositPercent] = useState(30)

  // UI
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 })
  const productBtnRef = useRef<HTMLButtonElement>(null)
  const productPickerRef = useRef<HTMLDivElement>(null)

  // Load data
  useEffect(() => {
    const load = async () => {
      const [projectsRes, productsRes, settingsRes, invoicesRes] = await Promise.all([
        supabase.from('projects').select('id, name').order('name'),
        supabase.from('products').select('*').order('name'),
        supabase.from('invoice_settings').select('*').limit(1).single(),
        supabase.from('invoices').select('number'),
      ])

      // Fetch project_clients with client details
      const projectList = projectsRes.data || []
      const { data: pcData } = await supabase
        .from('project_clients')
        .select('project_id, client_id, notify_invoices, client:clients(name, email)')

      const { data: clientsData } = await supabase.from('clients').select('id, name, email, company')

      const projectsWithClients: ProjectWithClients[] = projectList.map((p) => {
        const pcs = (pcData || []).filter((pc) => pc.project_id === p.id)
        return {
          id: p.id,
          name: p.name,
          clients: pcs.map((pc) => {
            const client = clientsData?.find(c => c.id === pc.client_id)
            return {
              client_id: pc.client_id,
              client_name: (pc.client as unknown as { name: string })?.name || '',
              client_email: (pc.client as unknown as { email: string })?.email || '',
              client_address: client?.company || '',
              notify_invoices: pc.notify_invoices,
            }
          }),
        }
      })

      setProjects(projectsWithClients)
      setProducts(productsRes.data || [])
      if (settingsRes.data) setInvoiceSettings(settingsRes.data)

      // Set BTW based on KOR
      if (settingsRes.data?.kor_enabled) {
        setBtwPercent(0)
      }

      // Auto-generate number
      if (!editId) {
        if (isTest) {
          const testNums = (invoicesRes.data || []).map((i) => i.number)
          setNumber(generateTestNumber(testNums))
        } else if (settingsRes.data) {
          const nums = (invoicesRes.data || []).map((i) => i.number)
          setNumber(generateInvoiceNumber(
            settingsRes.data.invoice_prefix,
            settingsRes.data.year_format as YearFormat,
            settingsRes.data.start_number,
            nums
          ))
        }
      }

      // If creating from a quote, pre-fill with quote data
      if (!editId && fromQuoteId) {
        const { data: quote } = await supabase.from('quotes').select('*, client:clients(name, email, company)').eq('id', fromQuoteId).single()
        if (quote) {
          setProjectId(quote.project_id)
          setClientId(quote.client_id)
          const client = quote.client as unknown as { name: string; email: string; company: string | null }
          if (client) {
            setClientName(client.name || '')
            setClientEmail(client.email || '')
            setClientAddress(client.company || '')
          }
          setItems(quote.items || [])
          setDiscountPercent(quote.discount_percent || 0)
          setBtwPercent(quote.btw_percent ?? 21)
          setNotes(quote.notes || '')
        }
      }

      // If editing, load invoice
      if (editId) {
        const { data: invoice } = await supabase.from('invoices').select('*').eq('id', editId).single()
        if (invoice) {
          setNumber(invoice.number)
          setProjectId(invoice.project_id)
          setClientId(invoice.client_id)
          setClientName(invoice.client_name || '')
          setClientEmail(invoice.client_email || '')
          setClientAddress(invoice.client_address || '')
          setInvoiceDate(invoice.invoice_date || invoice.created_at?.split('T')[0] || todayStr())
          setDueDate(invoice.due_date)
          setStatus(invoice.status)
          setIsTestInvoice(invoice.is_test || false)
          setItems(invoice.items || [])
          setDiscountPercent(invoice.discount_percent || 0)
          setBtwPercent(invoice.btw_percent ?? 21)
          setNotes(invoice.notes || '')
          setIsRecurring(invoice.is_recurring || false)
          if (invoice.recurrence_interval) setRecurrenceInterval(invoice.recurrence_interval)
          if (invoice.recurrence_send_time) setRecurrenceSendTime(invoice.recurrence_send_time)
          setRecurrenceNextRunAt(invoice.recurrence_next_run_at || null)
          setRecurrenceLastRunAt(invoice.recurrence_last_run_at || null)
        }
      }

      setLoading(false)
    }
    load()
  }, [editId, isTest, fromQuoteId])

  // Close product picker on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        productPickerRef.current && !productPickerRef.current.contains(e.target as Node) &&
        productBtnRef.current && !productBtnRef.current.contains(e.target as Node)
      ) {
        setShowProductPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const toggleProductPicker = useCallback(() => {
    if (!showProductPicker && productBtnRef.current) {
      const rect = productBtnRef.current.getBoundingClientRect()
      setPickerPos({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - 320),
      })
    }
    setShowProductPicker((v) => !v)
  }, [showProductPicker])

  // When project changes, find the client with notify_invoices
  const handleProjectChange = (pid: string) => {
    setProjectId(pid)
    const project = projects.find((p) => p.id === pid)
    if (project) {
      const invoiceClient = project.clients.find((c) => c.notify_invoices) || project.clients[0]
      if (invoiceClient) {
        setClientId(invoiceClient.client_id)
        setClientName(invoiceClient.client_name)
        setClientEmail(invoiceClient.client_email)
        setClientAddress(invoiceClient.client_address)
      } else {
        setClientId('')
        setClientName('')
        setClientEmail('')
        setClientAddress('')
      }
    }
  }

  // When client changes within the same project
  const handleClientChange = (cid: string) => {
    setClientId(cid)
    const project = projects.find((p) => p.id === projectId)
    const client = project?.clients.find((c) => c.client_id === cid)
    if (client) {
      setClientName(client.client_name)
      setClientEmail(client.client_email)
      setClientAddress(client.client_address)
    }
  }

  // Item management
  const addProduct = (product: Product) => {
    const item: QuoteItem = {
      id: genId(),
      type: 'product',
      product_id: product.id,
      name: product.name,
      description: product.description,
      quantity: product.quantity_value,
      unit: product.quantity_unit,
      price: product.price,
      is_recurring: product.is_recurring,
    }
    setItems([...items, item])
    setShowProductPicker(false)
    setProductSearch('')
  }

  const addTitle = () => {
    setItems([...items, { id: genId(), type: 'title', title: '' }])
  }

  const addDivider = () => {
    setItems([...items, { id: genId(), type: 'divider' }])
  }

  const removeItem = (id: string) => {
    setItems(items.filter((i) => i.id !== id))
  }

  const updateItem = (id: string, updates: Partial<QuoteItem>) => {
    setItems(items.map((i) => (i.id === id ? { ...i, ...updates } : i)))
  }

  const moveItem = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= items.length) return
    const newItems = [...items]
    ;[newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]]
    setItems(newItems)
  }

  // Calculations
  const subtotal = items
    .filter((i) => i.type === 'product')
    .reduce((sum, i) => sum + (i.quantity || 0) * (i.price || 0), 0)

  const discountAmount = subtotal * (discountPercent / 100)
  const afterDiscount = subtotal - discountAmount
  const btwAmount = afterDiscount * (btwPercent / 100)
  const total = afterDiscount + btwAmount

  // Save
  const handleSave = async () => {
    if (!projectId || !clientId) return
    setSaving(true)
    setSaved(false)

    // Plan voor recurrence_next_run_at:
    //  - Nog nooit gedraaid (geen last_run): anker altijd op factuurdatum, zodat
    //    de eerste run op de factuurdatum + verzendtijd valt. Werkt ook als het
    //    sjabloon pas vanaf nu wordt aangezet op een bestaande factuur.
    //  - Wel al gedraaid: bestaande next_run_at behouden, tenzij interval/tijd is
    //    aangepast — dan vanaf vandaag opnieuw plannen om dubbele runs te voorkomen.
    let nextRunAt: string | null = null
    if (isRecurring) {
      if (!recurrenceLastRunAt) {
        nextRunAt = computeNextRunAt(recurrenceInterval, recurrenceSendTime, invoiceDate).toISOString()
      } else {
        const [hh, mm] = recurrenceSendTime.split(':').map((n) => parseInt(n, 10))
        const existingNext = recurrenceNextRunAt ? new Date(recurrenceNextRunAt) : null
        const sameTime = existingNext && existingNext.getHours() === (hh || 9) && existingNext.getMinutes() === (mm || 0)
        if (existingNext && sameTime) {
          nextRunAt = recurrenceNextRunAt
        } else {
          nextRunAt = computeNextRunAt(recurrenceInterval, recurrenceSendTime, todayStr()).toISOString()
        }
      }
    }

    const payload = {
      number,
      project_id: projectId,
      client_id: clientId,
      amount: Math.round(total * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      status,
      due_date: dueDate,
      invoice_date: invoiceDate,
      is_test: isTestInvoice,
      client_name: clientName,
      client_email: clientEmail,
      client_address: clientAddress,
      items,
      discount_percent: discountPercent,
      btw_percent: btwPercent,
      notes,
      is_recurring: isRecurring,
      recurrence_interval: isRecurring ? recurrenceInterval : null,
      recurrence_send_time: recurrenceSendTime,
      recurrence_next_run_at: nextRunAt,
    }

    if (editId) {
      await supabase.from('invoices').update(payload).eq('id', editId)
    } else if (isDeposit) {
      // Splitsen: deze factuur wordt de aanbetaling (behoudt het toegewezen nummer),
      // plus een restfactuur met TMP-nummer.
      const remainderPercent = 100 - depositPercent
      const baseAfterDiscount = subtotal * (1 - discountPercent / 100)
      const depositSubtotal = Math.round(baseAfterDiscount * (depositPercent / 100) * 100) / 100
      const remainderSubtotal = Math.round((baseAfterDiscount - depositSubtotal) * 100) / 100
      const depositTotal = Math.round(depositSubtotal * (1 + btwPercent / 100) * 100) / 100
      const remainderTotal = Math.round(remainderSubtotal * (1 + btwPercent / 100) * 100) / 100

      const depositItem: QuoteItem = {
        id: crypto.randomUUID(),
        type: 'product',
        name: `Aanbetaling ${depositPercent}%`,
        description: `Aanbetaling van ${depositPercent}% op opdracht (factuur ${number}).`,
        quantity: 1,
        unit: 'stuk',
        price: depositSubtotal,
      }
      const remainderItem: QuoteItem = {
        id: crypto.randomUUID(),
        type: 'product',
        name: `Restant ${remainderPercent}%`,
        description: `Restant van ${remainderPercent}% na aanbetaling op opdracht (origineel: ${number}).`,
        quantity: 1,
        unit: 'stuk',
        price: remainderSubtotal,
      }

      // TMP-nummer berekenen op basis van bestaande facturen met has_temp_number.
      const { data: existingInvs } = await supabase
        .from('invoices')
        .select('number, has_temp_number')
      let maxTemp = 0
      for (const inv of existingInvs || []) {
        if (!inv.has_temp_number) continue
        const m = (inv.number as string).match(/^TMP-(\d+)$/)
        if (m) {
          const n = parseInt(m[1], 10)
          if (!isNaN(n) && n > maxTemp) maxTemp = n
        }
      }
      const tempNum = `TMP-${maxTemp + 1}`

      // Aanbetalingsfactuur insert (behoudt nummer)
      const { data: deposit, error: depErr } = await supabase.from('invoices').insert({
        ...payload,
        items: [depositItem],
        subtotal: depositSubtotal,
        amount: depositTotal,
        discount_percent: 0,
        is_deposit_invoice: true,
        deposit_percentage: depositPercent,
      }).select('id').single()
      if (depErr) {
        alert('Aanbetalingsfactuur aanmaken mislukt: ' + depErr.message)
        setSaving(false)
        return
      }

      // Restfactuur insert (TMP-nummer)
      const { error: remErr } = await supabase.from('invoices').insert({
        ...payload,
        number: tempNum,
        items: [remainderItem],
        subtotal: remainderSubtotal,
        amount: remainderTotal,
        discount_percent: 0,
        is_remainder_invoice: true,
        has_temp_number: true,
        deposit_percentage: depositPercent,
        parent_invoice_id: deposit?.id || null,
      })
      if (remErr) {
        alert('Restfactuur aanmaken mislukt: ' + remErr.message + '\n\nDe aanbetalingsfactuur is wel aangemaakt.')
        setSaving(false)
        return
      }
    } else {
      await supabase.from('invoices').insert(payload)
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => navigate('/admin/facturen'), 800)
  }

  // Filtered products for picker
  const filteredProducts = products.filter((p) => {
    if (!productSearch) return true
    const q = productSearch.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
  })

  // Available clients for selected project
  const availableClients = projects.find((p) => p.id === projectId)?.clients || []

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  const korEnabled = invoiceSettings?.kor_enabled ?? false

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/facturen')}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {editId ? 'Factuur bewerken' : 'Nieuwe factuur'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm font-mono text-gray-500">{number}</span>
              {isTestInvoice && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                  Testfactuur
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !projectId || !clientId}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <Check className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saved ? 'Opgeslagen' : 'Opslaan'}
        </button>
      </div>

      {/* Basisgegevens */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Basisgegevens</h2>
        </div>
        <div className="p-6 space-y-5">
          {/* Row 1: Factuurnummer */}
          <div>
            <label className="block text-sm font-medium text-primary mb-1.5">Factuurnummer</label>
            <input
              type="text"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="w-full max-w-xs px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">Je kunt het factuurnummer handmatig aanpassen, bijv. voor facturen uit een ander systeem.</p>
          </div>

          {/* Row 2: Domein + Klant */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Domein</label>
              <div className="relative">
                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select
                  value={projectId}
                  onChange={(e) => handleProjectChange(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all appearance-none"
                  required
                >
                  <option value="">Selecteer een domein</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Klant</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select
                  value={clientId}
                  onChange={(e) => handleClientChange(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all appearance-none"
                  disabled={!projectId}
                  required
                >
                  <option value="">{projectId ? 'Selecteer een klant' : 'Selecteer eerst een domein'}</option>
                  {availableClients.map((c) => (
                    <option key={c.client_id} value={c.client_id}>{c.client_name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Row 3: Naam, E-mail, Adres */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Naam op factuur</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                  placeholder="Klantnaam"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                  placeholder="klant@email.nl"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Adres</label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                <textarea
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all resize-y min-h-[42px]"
                  rows={2}
                  placeholder="Straat, postcode, plaats"
                />
              </div>
            </div>
          </div>

          {/* Row 4: Factuurdatum, Vervaldatum, Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Factuurdatum</label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Vervaldatum</label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
              <div className="relative">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all appearance-none"
                >
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Aanbetaling — alleen bij nieuwe facturen */}
      {!editId && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-amber-500" />
              <h2 className="text-base font-semibold text-gray-900">Aanbetaling</h2>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-gray-600">Aanbetalingsfactuur</span>
              <input
                type="checkbox"
                checked={isDeposit}
                onChange={(e) => {
                  setIsDeposit(e.target.checked)
                  if (e.target.checked) setIsRecurring(false)
                }}
                className="sr-only peer"
              />
              <div className="relative w-10 h-6 bg-gray-200 peer-checked:bg-primary rounded-full transition-colors">
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isDeposit ? 'translate-x-4' : ''}`} />
              </div>
            </label>
          </div>
          {isDeposit ? (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Aanbetalingspercentage</label>
                  <div className="relative">
                    <Percent className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={depositPercent}
                      onChange={(e) => setDepositPercent(Math.min(99, Math.max(1, parseInt(e.target.value, 10) || 30)))}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                    />
                  </div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <p className="text-xs text-amber-800">
                  Bij opslaan wordt deze factuur opgesplitst: een <strong>aanbetalingsfactuur ({depositPercent}%)</strong> met het bovenstaande factuurnummer, en een <strong>restfactuur ({100 - depositPercent}%)</strong> met een tijdelijk nummer (TMP-X) dat je later kunt definiëren wanneer het project wordt afgerond.
                </p>
              </div>
            </div>
          ) : (
            <div className="px-6 py-5">
              <p className="text-sm text-gray-400">Eenmalige factuur voor het volledige bedrag. Zet de schakelaar aan om er een aanbetaling + restfactuur van te maken.</p>
            </div>
          )}
        </section>
      )}

      {/* Herhaling */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Repeat className="w-4 h-4 text-blue-500" />
            <h2 className="text-base font-semibold text-gray-900">Herhaling</h2>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-gray-600">Terugkerende factuur</span>
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => {
                setIsRecurring(e.target.checked)
                if (e.target.checked) setIsDeposit(false)
              }}
              className="sr-only peer"
            />
            <div className="relative w-10 h-6 bg-gray-200 peer-checked:bg-primary rounded-full transition-colors">
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isRecurring ? 'translate-x-4' : ''}`} />
            </div>
          </label>
        </div>
        {isRecurring ? (
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Interval</label>
                <div className="relative">
                  <Repeat className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <select
                    value={recurrenceInterval}
                    onChange={(e) => setRecurrenceInterval(e.target.value as RecurrenceInterval)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all appearance-none"
                  >
                    {(Object.keys(recurrenceLabels) as RecurrenceInterval[]).map((key) => (
                      <option key={key} value={key}>{recurrenceLabels[key]}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Verzendtijd</label>
                <div className="relative">
                  <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="time"
                    value={recurrenceSendTime}
                    onChange={(e) => setRecurrenceSendTime(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                  />
                </div>
              </div>
            </div>
            {recurrenceNextRunAt && (
              <p className="text-xs text-gray-500">
                Volgende verzending: <strong className="text-gray-700">
                  {new Date(recurrenceNextRunAt).toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short' })}
                </strong>
                {recurrenceLastRunAt && (
                  <span className="text-gray-400"> &middot; laatst gegenereerd {new Date(recurrenceLastRunAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                )}
              </p>
            )}
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <p className="text-xs text-blue-800">
                Deze factuur dient als <strong>sjabloon</strong>. Elke periode wordt er automatisch een nieuwe factuur uit gegenereerd met een vers factuurnummer. Het sjabloon zelf blijft staan in &quot;Terugkerende facturen&quot;.
              </p>
            </div>
          </div>
        ) : (
          <div className="px-6 py-5">
            <p className="text-sm text-gray-400">Eenmalige factuur. Zet de schakelaar aan om er een terugkerende factuur van te maken.</p>
          </div>
        )}
      </section>

      {/* Elementen */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Elementen</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={addTitle}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <Type className="w-3.5 h-3.5" />
              Titel
            </button>

            {/* Product picker trigger */}
            <button
              ref={productBtnRef}
              onClick={toggleProductPicker}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <Package className="w-3.5 h-3.5" />
              Dienst
            </button>

            {/* Product picker portal */}
            {showProductPicker && createPortal(
              <div
                ref={productPickerRef}
                className="fixed w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-[9999]"
                style={{ top: pickerPos.top, left: pickerPos.left }}
              >
                <div className="p-3 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      placeholder="Zoek product..."
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {filteredProducts.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-400">Geen producten gevonden</div>
                  ) : (
                    filteredProducts.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => addProduct(product)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">{product.name}</p>
                          <p className="text-xs text-gray-400">
                            {product.code} &middot; {product.quantity_value} {product.quantity_unit}
                            {product.is_recurring && ' \u00b7 Jaarlijks'}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-gray-700">
                          &euro;{product.price.toFixed(2)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>,
              document.body
            )}

            <button
              onClick={addDivider}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
              Scheidingslijn
            </button>
          </div>
        </div>

        <div className="p-6">
          {items.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-400">Voeg elementen toe om je factuur op te bouwen</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={item.id}>
                  {item.type === 'divider' ? (
                    <div className="flex items-center gap-2 group py-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveItem(index, -1)}
                          className="p-1 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Omhoog"
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex-1 border-t border-gray-200" />
                      <button
                        onClick={() => removeItem(item.id)}
                        className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : item.type === 'title' ? (
                    <div className="flex items-center gap-2 group">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveItem(index, -1)}
                          className="p-1 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={item.title || ''}
                        onChange={(e) => updateItem(item.id, { title: e.target.value })}
                        className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all"
                        placeholder="Sectietitel..."
                      />
                      <button
                        onClick={() => removeItem(item.id)}
                        className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    /* Product item */
                    <div className="flex items-start gap-2 group bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <div className="flex items-center gap-1 mt-2">
                        <button
                          onClick={() => moveItem(index, -1)}
                          className="p-1 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={item.name || ''}
                              onChange={(e) => updateItem(item.id, { name: e.target.value })}
                              className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                            />
                            {item.description && stripHtml(item.description).trim() ? (
                              <div
                                className="w-full px-3 py-1.5 mt-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-500 prose-quote"
                                dangerouslySetInnerHTML={{ __html: item.description }}
                              />
                            ) : (
                              <p className="w-full px-3 py-1.5 mt-1.5 text-xs text-gray-300 italic">Geen omschrijving</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={1}
                                value={item.quantity || 1}
                                onChange={(e) => updateItem(item.id, { quantity: parseInt(e.target.value) || 1 })}
                                className="w-16 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                              />
                              <span className="text-xs text-gray-400 w-14 truncate">{item.unit}</span>
                            </div>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">&euro;</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.price || 0}
                                onChange={(e) => updateItem(item.id, { price: parseFloat(e.target.value) || 0 })}
                                className="w-24 pl-6 pr-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                              />
                            </div>
                            <span className="text-sm font-semibold text-gray-700 w-20 text-right">
                              &euro;{((item.quantity || 0) * (item.price || 0)).toFixed(2)}
                            </span>
                          </div>
                        </div>
                        {item.is_recurring && (
                          <div className="mt-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 text-xs font-medium rounded-full">
                              <Repeat className="w-3 h-3" />
                              Jaarlijks
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="p-1 mt-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Notities & Totalen */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Notities */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Notities</h2>
          </div>
          <div className="p-6">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all resize-y min-h-[100px]"
              rows={4}
              placeholder="Optionele notities voor op de factuur..."
            />
          </div>
        </section>

        {/* Totalen */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Totalen</h2>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Subtotaal</span>
                <span className="text-sm font-medium text-gray-900">&euro; {subtotal.toFixed(2)}</span>
              </div>
              {discountPercent > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Korting ({discountPercent}%)</span>
                    <span className="text-sm text-red-500 font-medium">- &euro; {discountAmount.toFixed(2)}</span>
                  </div>
                </>
              )}
              {!korEnabled && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">BTW</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={btwPercent}
                      onChange={(e) => setBtwPercent(parseFloat(e.target.value) || 0)}
                      className="w-14 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    />
                    <span className="text-sm text-gray-400">%</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">&euro; {btwAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-gray-900">Totaal</span>
                  <span className="text-xl font-bold text-primary">&euro; {total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {korEnabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
          <p className="text-xs text-amber-700">
            <strong>KOR actief:</strong> Er wordt geen BTW berekend op deze factuur (Kleineondernemersregeling).
          </p>
        </div>
      )}
    </div>
  )
}
