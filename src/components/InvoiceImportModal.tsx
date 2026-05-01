import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseCsv, parseAmount, parseDate, mapHeaders } from '../lib/csv'
import type { InvoiceStatus, QuoteItem } from '../types'
import { X, Upload, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

type CsvField =
  | 'number'
  | 'status'
  | 'domain'
  | 'client_name'
  | 'client_email'
  | 'client_address'
  | 'invoice_date'
  | 'due_date'
  | 'paid_at'
  | 'subtotal'
  | 'btw_percent'
  | 'btw_amount'
  | 'total'
  | 'is_test'
  | 'notes'
  | 'item_description'
  | 'item_title'
  | 'item_code'
  | 'item_quantity'
  | 'item_price'
  | 'item_total'

const HEADER_ALIASES: Record<CsvField, string[]> = {
  number: ['factuurnummer', 'invoice number', 'nummer', 'factuurnr'],
  status: ['status'],
  domain: ['domein', 'project'],
  client_name: ['klantnaam', 'klant', 'klant naam', 'client name'],
  client_email: ['klant e mail', 'klant email', 'e mail', 'email', 'klant e-mail'],
  client_address: ['klantadres', 'adres', 'client address', 'address'],
  invoice_date: ['aanmaakdatum', 'factuurdatum', 'invoice date', 'datum'],
  due_date: ['vervaldatum', 'due date'],
  paid_at: ['betaald op', 'paid at', 'paid on'],
  subtotal: ['subtotaal', 'subtotal'],
  btw_percent: ['btw %', 'btw%', 'btw percent', 'vat percent', 'btw'],
  btw_amount: ['btw bedrag', 'btw amount', 'vat amount'],
  total: ['totaal', 'total', 'amount'],
  is_test: ['is test', 'test'],
  notes: ['notities', 'notes', 'opmerkingen'],
  item_description: ['item omschrijving', 'item description', 'omschrijving'],
  item_title: ['item titel', 'item title', 'titel'],
  item_code: ['item productcode', 'item code', 'productcode'],
  item_quantity: ['item aantal', 'item quantity', 'aantal'],
  item_price: ['item stukprijs', 'item price', 'stukprijs', 'prijs'],
  item_total: ['item totaal', 'item total', 'regeltotaal'],
}

const STATUS_MAP: Record<string, InvoiceStatus> = {
  concept: 'draft',
  draft: 'draft',
  verzonden: 'sent',
  sent: 'sent',
  betaald: 'paid',
  paid: 'paid',
}

interface ParsedInvoice {
  number: string
  status: InvoiceStatus
  domain: string
  client_name: string
  client_email: string
  client_address: string
  invoice_date: string
  due_date: string
  paid_at: string | null
  subtotal: number
  btw_percent: number
  btw_amount: number
  total: number
  is_test: boolean
  notes: string
  items: QuoteItem[]

  isDeposit: boolean
  isRemainder: boolean
  parentNumber: string | null
  depositPercentage: number | null

  projectId: string | null
  clientId: string | null

  validation: 'ok' | 'duplicate' | 'no-project' | 'no-client'
  reason?: string
}

function detectDepositPercentage(items: QuoteItem[], isDeposit: boolean): number | null {
  // Items might be "Webdesign Bronze (30% aanbetaling)" or "(70% restant)"
  for (const item of items) {
    const text = `${item.name || ''} ${item.title || ''}`
    const m = text.match(/(\d+)\s*%/)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > 0 && n < 100) return isDeposit ? n : 100 - n
    }
  }
  return null
}

function genId(): string {
  return crypto.randomUUID()
}

function parseInvoiceFromGroup(rows: string[][], colMap: Record<CsvField, number | undefined>): ParsedInvoice {
  const get = (row: string[], k: CsvField) => {
    const idx = colMap[k]
    return idx != null ? (row[idx] ?? '').trim() : ''
  }

  const first = rows[0]
  const numberRaw = get(first, 'number')
  const statusRaw = get(first, 'status').toLowerCase()
  const status: InvoiceStatus = STATUS_MAP[statusRaw] || 'draft'
  const isTestFlag = get(first, 'is_test').toLowerCase() === 'ja' || get(first, 'is_test').toLowerCase() === 'yes' || get(first, 'is_test').toLowerCase() === 'true'
  const isTest = isTestFlag || numberRaw.toUpperCase().startsWith('TEST-')

  const items: QuoteItem[] = []
  for (const r of rows) {
    const name = get(r, 'item_title') || get(r, 'item_description')
    if (!name) continue
    const item: QuoteItem = {
      id: genId(),
      type: 'product',
      name,
      description: get(r, 'item_description') !== get(r, 'item_title') ? get(r, 'item_description') : '',
      product_id: undefined,
      quantity: parseAmount(get(r, 'item_quantity')) || 1,
      unit: 'stuk',
      price: parseAmount(get(r, 'item_price')),
    }
    items.push(item)
  }

  const notes = get(first, 'notes')
  const isDeposit = /aanbetalingsfactuur/i.test(notes)
  const isRemainder = /restfactuur/i.test(notes)
  let parentNumber: string | null = null
  if (isRemainder) {
    const m = notes.match(/aanbetaling:\s*([^\s]+)/i)
    if (m) parentNumber = m[1]
  }
  const depositPct = (isDeposit || isRemainder) ? detectDepositPercentage(items, isDeposit) : null

  const invoiceDate = parseDate(get(first, 'invoice_date'))
  const dueDate = parseDate(get(first, 'due_date'), invoiceDate)
  const paidAtRaw = get(first, 'paid_at')

  return {
    number: numberRaw,
    status,
    domain: get(first, 'domain'),
    client_name: get(first, 'client_name'),
    client_email: get(first, 'client_email'),
    client_address: get(first, 'client_address'),
    invoice_date: invoiceDate,
    due_date: dueDate,
    paid_at: paidAtRaw ? parseDate(paidAtRaw) : null,
    subtotal: parseAmount(get(first, 'subtotal')),
    btw_percent: parseAmount(get(first, 'btw_percent')),
    btw_amount: parseAmount(get(first, 'btw_amount')),
    total: parseAmount(get(first, 'total')),
    is_test: isTest,
    notes,
    items,
    isDeposit,
    isRemainder,
    parentNumber,
    depositPercentage: depositPct,
    projectId: null,
    clientId: null,
    validation: 'ok',
  }
}

interface ProjectRow { id: string; name: string }
interface ClientRow { id: string; name: string; email: string | null }

export default function InvoiceImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [stage, setStage] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload')
  const [invoices, setInvoices] = useState<ParsedInvoice[]>([])
  const [error, setError] = useState<string | null>(null)
  const [importedCount, setImportedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)

  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [existingNumbers, setExistingNumbers] = useState<Set<string>>(new Set())

  // Pre-fetch lookup data once
  useEffect(() => {
    const load = async () => {
      const [projRes, clientRes, invRes] = await Promise.all([
        supabase.from('projects').select('id, name'),
        supabase.from('clients').select('id, name, email'),
        supabase.from('invoices').select('number'),
      ])
      setProjects(projRes.data || [])
      setClients(clientRes.data || [])
      setExistingNumbers(new Set((invRes.data || []).map((i) => i.number)))
    }
    load()
  }, [])

  const resolveAndValidate = (parsed: ParsedInvoice[]): ParsedInvoice[] => {
    return parsed.map((inv) => {
      if (existingNumbers.has(inv.number)) {
        return { ...inv, validation: 'duplicate', reason: `Factuurnummer ${inv.number} bestaat al` }
      }
      const projectId = inv.domain
        ? projects.find((p) => p.name.toLowerCase() === inv.domain.toLowerCase())?.id ?? null
        : null
      if (!projectId) {
        return { ...inv, validation: 'no-project', reason: inv.domain ? `Project "${inv.domain}" niet gevonden` : 'Geen project' }
      }
      let clientId: string | null = null
      if (inv.client_email) {
        clientId = clients.find((c) => (c.email || '').toLowerCase() === inv.client_email.toLowerCase())?.id ?? null
      }
      if (!clientId && inv.client_name) {
        clientId = clients.find((c) => c.name.toLowerCase() === inv.client_name.toLowerCase())?.id ?? null
      }
      if (!clientId) {
        return { ...inv, projectId, validation: 'no-client', reason: inv.client_email || inv.client_name ? `Klant "${inv.client_email || inv.client_name}" niet gevonden` : 'Geen klant' }
      }
      return { ...inv, projectId, clientId, validation: 'ok' }
    })
  }

  const handleFile = async (file: File) => {
    setError(null)
    try {
      const text = await file.text()
      const allRows = parseCsv(text)
      if (allRows.length < 2) {
        setError('CSV bestand bevat geen data of geen kolomkoppen')
        return
      }
      const hdrs = allRows[0]
      const dataRows = allRows.slice(1)
      const map = mapHeaders<CsvField>(hdrs, HEADER_ALIASES)

      if (map.number == null) {
        setError(`Verplichte kolom Factuurnummer ontbreekt. Gebruik een van: ${HEADER_ALIASES.number.join(' / ')}`)
        return
      }

      // Group by Factuurnummer + Aanmaakdatum (a number can repeat for deposit/remainder)
      const groups = new Map<string, string[][]>()
      for (const row of dataRows) {
        const num = (row[map.number] ?? '').trim()
        if (!num) continue
        const date = map.invoice_date != null ? (row[map.invoice_date] ?? '').trim() : ''
        const notes = map.notes != null ? (row[map.notes] ?? '').trim() : ''
        // Notes pattern disambiguates same-number deposit vs remainder (different notes)
        const key = `${num}|${date}|${notes}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(row)
      }

      const parsed: ParsedInvoice[] = []
      for (const rows of groups.values()) {
        parsed.push(parseInvoiceFromGroup(rows, map))
      }

      const validated = resolveAndValidate(parsed)
      setInvoices(validated)
      setStage('preview')
    } catch (err) {
      setError('CSV inlezen mislukt: ' + (err instanceof Error ? err.message : 'onbekende fout'))
    }
  }

  const handleConfirmImport = async () => {
    setStage('importing')
    let imported = 0
    let skipped = 0
    let failed = 0

    const okInvoices = invoices.filter((i) => i.validation === 'ok')
    skipped = invoices.length - okInvoices.length

    // Insert non-remainders first, build a map number -> inserted UUID
    const numberToId = new Map<string, string>()
    const remainders: ParsedInvoice[] = []

    for (const inv of okInvoices) {
      if (inv.isRemainder) {
        remainders.push(inv)
        continue
      }
      const payload = {
        number: inv.number,
        project_id: inv.projectId,
        client_id: inv.clientId,
        amount: inv.total,
        subtotal: inv.subtotal,
        status: inv.status,
        due_date: inv.due_date,
        invoice_date: inv.invoice_date,
        is_test: inv.is_test,
        client_name: inv.client_name || null,
        client_email: inv.client_email || null,
        client_address: inv.client_address || null,
        items: inv.items,
        discount_percent: 0,
        btw_percent: inv.btw_percent,
        notes: inv.notes,
        is_deposit_invoice: inv.isDeposit,
        is_remainder_invoice: false,
        has_temp_number: false,
        deposit_percentage: inv.depositPercentage,
        parent_invoice_id: null,
      }
      const { data, error: insErr } = await supabase.from('invoices').insert(payload).select('id').single()
      if (insErr || !data) {
        console.error('Insert mislukt voor', inv.number, insErr)
        failed++
      } else {
        imported++
        numberToId.set(inv.number, data.id)
      }
    }

    // Now insert remainders, linking parent_invoice_id
    for (const inv of remainders) {
      let parentId: string | null = null
      if (inv.parentNumber) {
        parentId = numberToId.get(inv.parentNumber) ?? null
        if (!parentId) {
          // Maybe parent already existed in DB before this import
          const { data } = await supabase.from('invoices').select('id').eq('number', inv.parentNumber).limit(1).single()
          if (data) parentId = data.id
        }
      }
      const hasTemp = inv.number.toUpperCase().startsWith('DRAFT-')
      const payload = {
        number: inv.number,
        project_id: inv.projectId,
        client_id: inv.clientId,
        amount: inv.total,
        subtotal: inv.subtotal,
        status: inv.status,
        due_date: inv.due_date,
        invoice_date: inv.invoice_date,
        is_test: inv.is_test,
        client_name: inv.client_name || null,
        client_email: inv.client_email || null,
        client_address: inv.client_address || null,
        items: inv.items,
        discount_percent: 0,
        btw_percent: inv.btw_percent,
        notes: inv.notes,
        is_deposit_invoice: false,
        is_remainder_invoice: true,
        has_temp_number: hasTemp,
        deposit_percentage: inv.depositPercentage,
        parent_invoice_id: parentId,
      }
      const { error: insErr } = await supabase.from('invoices').insert(payload)
      if (insErr) {
        console.error('Insert restfactuur mislukt voor', inv.number, insErr)
        failed++
      } else {
        imported++
      }
    }

    setImportedCount(imported)
    setSkippedCount(skipped)
    setFailedCount(failed)
    setStage('done')
  }

  const okCount = invoices.filter((i) => i.validation === 'ok').length
  const duplicateCount = invoices.filter((i) => i.validation === 'duplicate').length
  const noProjectCount = invoices.filter((i) => i.validation === 'no-project').length
  const noClientCount = invoices.filter((i) => i.validation === 'no-client').length

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={stage !== 'importing' ? onClose : undefined} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-8" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Facturen importeren uit CSV</h2>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors" disabled={stage === 'importing'}>
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-6 py-5">
            {stage === 'upload' && (
              <div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 text-sm text-blue-900">
                  <p className="font-medium mb-1">Hoe werkt het?</p>
                  <ul className="text-xs text-blue-800 space-y-0.5 ml-1">
                    <li>• Multi-row facturen (meerdere regels met hetzelfde factuurnummer) worden automatisch gegroepeerd</li>
                    <li>• Projecten en klanten worden gekoppeld op naam/e-mail. Niet-bestaande worden overgeslagen</li>
                    <li>• Bestaande factuurnummers worden overgeslagen (geen duplicaten)</li>
                    <li>• Aanbetalings- en restfacturen worden gedetecteerd uit de notities en correct gelinkt</li>
                  </ul>
                </div>

                <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl py-12 px-6 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors">
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="text-sm font-medium text-gray-700">Kies CSV-bestand</p>
                  <p className="text-xs text-gray-400 mt-0.5">Export uit je vorige facturatiesysteem</p>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleFile(f)
                    }}
                  />
                </label>

                {error && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
              </div>
            )}

            {stage === 'preview' && (
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wider">Klaar</p>
                    <p className="text-2xl font-bold text-green-700 mt-0.5">{okCount}</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Bestaat al</p>
                    <p className="text-2xl font-bold text-amber-700 mt-0.5">{duplicateCount}</p>
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider">Geen project</p>
                    <p className="text-2xl font-bold text-red-700 mt-0.5">{noProjectCount}</p>
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider">Geen klant</p>
                    <p className="text-2xl font-bold text-red-700 mt-0.5">{noClientCount}</p>
                  </div>
                </div>

                <p className="text-xs text-gray-500 mb-2">{invoices.length} facturen herkend, {okCount} worden geimporteerd</p>

                <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-96">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Status</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Nummer</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Datum</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Domein</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Klant</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Items</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-500">Totaal</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Bijzonder</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv, i) => {
                        const validationColors: Record<typeof inv.validation, string> = {
                          'ok': 'bg-green-50 text-green-700',
                          'duplicate': 'bg-amber-50 text-amber-700',
                          'no-project': 'bg-red-50 text-red-700',
                          'no-client': 'bg-red-50 text-red-700',
                        }
                        const validationLabel: Record<typeof inv.validation, string> = {
                          'ok': 'OK',
                          'duplicate': 'Bestaat al',
                          'no-project': 'Geen project',
                          'no-client': 'Geen klant',
                        }
                        return (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-3 py-1.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${validationColors[inv.validation]}`}>
                                {validationLabel[inv.validation]}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 font-mono">{inv.number}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{inv.invoice_date}</td>
                            <td className="px-3 py-1.5">{inv.domain || '—'}</td>
                            <td className="px-3 py-1.5">{inv.client_name || inv.client_email || '—'}</td>
                            <td className="px-3 py-1.5">{inv.items.length}</td>
                            <td className="px-3 py-1.5 text-right font-mono">&euro; {inv.total.toFixed(2)}</td>
                            <td className="px-3 py-1.5 text-[10px] text-gray-500">
                              {inv.is_test && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded mr-1">Test</span>}
                              {inv.isDeposit && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded mr-1">Aanbetaling</span>}
                              {inv.isRemainder && <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded mr-1">Restfactuur</span>}
                              {inv.reason && <span className="text-red-500">{inv.reason}</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {stage === 'importing' && (
              <div className="py-12 text-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-700">Facturen worden geimporteerd...</p>
              </div>
            )}

            {stage === 'done' && (
              <div className="py-8 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-lg font-medium text-gray-900">{importedCount} facturen geimporteerd</p>
                <p className="text-sm text-gray-500 mt-1">
                  {skippedCount > 0 && <>{skippedCount} overgeslagen · </>}
                  {failedCount > 0 && <span className="text-red-600">{failedCount} mislukt · </span>}
                  Klaar
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
            {stage === 'preview' && (
              <>
                <button onClick={() => { setStage('upload'); setInvoices([]); setError(null) }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                  Ander bestand
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={okCount === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  Importeer {okCount} facturen
                </button>
              </>
            )}
            {(stage === 'upload' || stage === 'preview') && (
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                Annuleren
              </button>
            )}
            {stage === 'done' && (
              <button onClick={onImported} className="px-5 py-2 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors">
                Klaar
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
