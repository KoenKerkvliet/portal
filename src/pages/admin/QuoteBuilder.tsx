import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Product, QuoteItem, YearFormat, InvoiceSettings } from '../../types'
import {
  ArrowLeft,
  Save,
  Loader2,
  Check,
  Calendar,
  Globe,
  Package,
  Type,
  Minus,
  Trash2,
  GripVertical,
  Search,
  ChevronDown,
  Repeat,
} from 'lucide-react'

function generateQuoteNumber(
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

interface ProjectWithClients {
  id: string
  name: string
  clients: { client_id: string; client_name: string; notify_quotes: boolean }[]
}

export default function QuoteBuilder() {
  const navigate = useNavigate()
  const { id: editId } = useParams()
  const [searchParams] = useSearchParams()
  const isTest = searchParams.get('test') === '1'

  // Data
  const [projects, setProjects] = useState<ProjectWithClients[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings | null>(null)

  // Form state
  const [number, setNumber] = useState('')
  const [projectId, setProjectId] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientName, setClientName] = useState('')
  const [createdDate, setCreatedDate] = useState(todayStr())
  const [validUntil, setValidUntil] = useState(plus14Days())
  const [items, setItems] = useState<QuoteItem[]>([])
  const [discountPercent, setDiscountPercent] = useState(0)
  const [btwPercent, setBtwPercent] = useState(21)
  const [notes, setNotes] = useState('')
  const [isTestQuote, setIsTestQuote] = useState(isTest)

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
      // Fetch all needed data in parallel
      const [projectsRes, productsRes, settingsRes, invoiceRes, quotesRes] = await Promise.all([
        supabase.from('projects').select('id, name').order('name'),
        supabase.from('products').select('*').order('name'),
        supabase.from('quote_settings').select('*').limit(1).single(),
        supabase.from('invoice_settings').select('*').limit(1).single(),
        supabase.from('quotes').select('number'),
      ])

      // Fetch project_clients with client names
      const projectList = projectsRes.data || []
      const { data: pcData } = await supabase
        .from('project_clients')
        .select('project_id, client_id, notify_quotes, client:clients(name)')

      const projectsWithClients: ProjectWithClients[] = projectList.map((p) => {
        const pcs = (pcData || []).filter((pc) => pc.project_id === p.id)
        return {
          id: p.id,
          name: p.name,
          clients: pcs.map((pc) => ({
            client_id: pc.client_id,
            client_name: (pc.client as unknown as { name: string })?.name || '',
            notify_quotes: pc.notify_quotes,
          })),
        }
      })

      setProjects(projectsWithClients)
      setProducts(productsRes.data || [])
      if (invoiceRes.data) setInvoiceSettings(invoiceRes.data)

      // Set BTW based on KOR
      if (invoiceRes.data?.kor_enabled) {
        setBtwPercent(0)
      }

      // Auto-generate number
      if (!editId) {
        if (isTest) {
          setNumber('TEST-001')
        } else if (settingsRes.data) {
          const nums = (quotesRes.data || []).map((q) => q.number)
          setNumber(generateQuoteNumber(
            settingsRes.data.quote_prefix,
            settingsRes.data.year_format as YearFormat,
            settingsRes.data.start_number,
            nums
          ))
        }
      }

      // If editing, load quote
      if (editId) {
        const { data: quote } = await supabase.from('quotes').select('*').eq('id', editId).single()
        if (quote) {
          setNumber(quote.number)
          setProjectId(quote.project_id)
          setClientId(quote.client_id)
          setCreatedDate(quote.created_at?.split('T')[0] || todayStr())
          setValidUntil(quote.valid_until)
          setIsTestQuote(quote.is_test || false)
          setItems(quote.items || [])
          setDiscountPercent(quote.discount_percent || 0)
          setBtwPercent(quote.btw_percent ?? 21)
          setNotes(quote.notes || '')

          // Find client name
          const pc = (pcData || []).find((pc) => pc.client_id === quote.client_id)
          if (pc) setClientName((pc.client as unknown as { name: string })?.name || '')
        }
      }

      setLoading(false)
    }
    load()
  }, [editId, isTest])

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

  // When project changes, find the client with notify_quotes
  const handleProjectChange = (pid: string) => {
    setProjectId(pid)
    const project = projects.find((p) => p.id === pid)
    if (project) {
      const quoteClient = project.clients.find((c) => c.notify_quotes)
      if (quoteClient) {
        setClientId(quoteClient.client_id)
        setClientName(quoteClient.client_name)
      } else if (project.clients.length > 0) {
        setClientId(project.clients[0].client_id)
        setClientName(project.clients[0].client_name)
      } else {
        setClientId('')
        setClientName('')
      }
    }
  }

  // Item management
  const addProduct = (product: Product) => {
    const item: QuoteItem = {
      id: genId(),
      type: 'product',
      product_id: product.id,
      name: product.name,
      description: stripHtml(product.description),
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

    const payload = {
      number,
      project_id: projectId,
      client_id: clientId,
      amount: Math.round(total * 100) / 100,
      status: 'draft' as const,
      valid_until: validUntil,
      is_test: isTestQuote,
      items,
      discount_percent: discountPercent,
      btw_percent: btwPercent,
      notes,
      created_at: new Date(createdDate).toISOString(),
    }

    if (editId) {
      await supabase.from('quotes').update(payload).eq('id', editId)
    } else {
      await supabase.from('quotes').insert(payload)
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => navigate('/admin/offertes'), 800)
  }

  // Filtered products for picker
  const filteredProducts = products.filter((p) => {
    if (!productSearch) return true
    const q = productSearch.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
  })

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
            onClick={() => navigate('/admin/offertes')}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {editId ? 'Offerte bewerken' : 'Nieuwe offerte'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm font-mono text-gray-500">{number}</span>
              {isTestQuote && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                  Testofferte
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
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Domein */}
            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">Domein</label>
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
              {clientName && (
                <p className="text-xs text-gray-400 mt-1.5">
                  Klant: <span className="font-medium text-gray-600">{clientName}</span>
                </p>
              )}
            </div>

            {/* Aanmaakdatum */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Aanmaakdatum</label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={createdDate}
                  onChange={(e) => setCreatedDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                />
              </div>
            </div>

            {/* Geldig tot */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Geldig tot</label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                />
              </div>
            </div>
          </div>
        </div>
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
              <p className="text-sm text-gray-400">Voeg elementen toe om je offerte op te bouwen</p>
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
                            <input
                              type="text"
                              value={item.description || ''}
                              onChange={(e) => updateItem(item.id, { description: e.target.value })}
                              className="w-full px-3 py-1.5 mt-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                              placeholder="Omschrijving..."
                            />
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

      {/* Totalen */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="p-6">
          <div className="flex justify-end">
            <div className="w-80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Subtotaal:</span>
                <span className="text-sm font-medium text-gray-900">&euro; {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Korting (%):</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                  className="w-20 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
              {discountPercent > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Korting bedrag:</span>
                  <span className="text-red-500 font-medium">- &euro; {discountAmount.toFixed(2)}</span>
                </div>
              )}
              {!korEnabled && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">BTW (%):</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={btwPercent}
                      onChange={(e) => setBtwPercent(parseFloat(e.target.value) || 0)}
                      className="w-20 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">BTW bedrag:</span>
                    <span className="text-sm font-medium text-gray-900">&euro; {btwAmount.toFixed(2)}</span>
                  </div>
                </>
              )}
              <div className="border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-gray-900">Totaal:</span>
                  <span className="text-xl font-bold text-primary">&euro; {total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Opmerkingen */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Opmerkingen</h2>
        </div>
        <div className="p-6">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all resize-y min-h-[100px]"
            rows={4}
            placeholder="Voeg eventuele opmerkingen of voorwaarden toe..."
          />
        </div>
      </section>

      {korEnabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
          <p className="text-xs text-amber-700">
            <strong>KOR actief:</strong> Er wordt geen BTW berekend op deze offerte (Kleineondernemersregeling).
          </p>
        </div>
      )}
    </div>
  )
}
