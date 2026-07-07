import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Invoice, InvoiceSettings, QuoteItem } from '../../types'
import { generateInvoicePdfDoc } from '../../lib/invoicePdf'
import { ArrowLeft, Download, Loader2, FileText, Calendar, Hash, Building2 } from 'lucide-react'

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: 'Concept', color: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Verzonden', color: 'bg-blue-100 text-blue-700' },
  paid: { label: 'Betaald', color: 'bg-green-100 text-green-700' },
}

export default function InvoicePage() {
  const { invoiceId } = useParams()
  const navigate = useNavigate()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [settings, setSettings] = useState<InvoiceSettings | null>(null)
  const [projectName, setProjectName] = useState('')
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      if (!invoiceId) return

      const [invoiceRes, settingsRes] = await Promise.all([
        supabase.from('invoices').select('*, project:projects(name), client:clients(name, company, email)').eq('id', invoiceId).single(),
        supabase.from('invoice_settings').select('*').limit(1).single(),
      ])

      if (invoiceRes.data) {
        setInvoice(invoiceRes.data)
        setProjectName((invoiceRes.data.project as unknown as { name: string })?.name || '')
        const client = invoiceRes.data.client as unknown as { name: string; company: string; email: string }
        setClientName(invoiceRes.data.client_name || client?.name || '')
      }
      if (settingsRes.data) setSettings(settingsRes.data)
      setLoading(false)
    }
    fetch()
  }, [invoiceId])

  const handleDownloadPdf = async () => {
    if (!invoice) return
    setDownloading(true)
    const doc = await generateInvoicePdfDoc(invoice, settings, clientName)
    doc.save(`Factuur-${invoice.number}.pdf`)
    setDownloading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-lg font-medium text-gray-900">Factuur niet gevonden</h2>
        <button onClick={() => navigate('/')} className="mt-4 text-sm text-primary hover:underline">
          Terug naar portaal
        </button>
      </div>
    )
  }

  const items = (invoice.items || []) as QuoteItem[]
  const subtotal = items.filter(i => i.type === 'product').reduce((s, i) => s + (i.quantity || 0) * (i.price || 0), 0)
  const discountAmount = subtotal * ((invoice.discount_percent || 0) / 100)
  const afterDiscount = subtotal - discountAmount
  const btwAmount = afterDiscount * ((invoice.btw_percent || 0) / 100)
  const total = afterDiscount + btwAmount
  const korEnabled = settings?.kor_enabled ?? false
  const status = statusLabels[invoice.status] || { label: invoice.status, color: 'bg-gray-100 text-gray-600' }
  const invoiceDate = invoice.invoice_date || invoice.created_at

  return (
    <div className="max-w-3xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug naar portaal
        </button>
        <button
          onClick={handleDownloadPdf}
          disabled={downloading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download PDF
        </button>
      </div>

      {/* Invoice document */}
      {invoice.has_temp_number && (
        <div className="mb-4 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <FileText className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-orange-800">Voorlopige restfactuur</p>
            <p className="text-orange-700 mt-0.5">
              Deze factuur heeft nog een tijdelijk nummer ({invoice.number}). Bij het afsluiten van het project wordt het definitieve factuurnummer toegekend.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header with accent bar */}
        <div className="bg-gradient-to-r from-primary to-primary-600 px-8 py-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">
                  {invoice.is_deposit_invoice ? 'Aanbetalingsfactuur' : invoice.is_remainder_invoice ? 'Restfactuur' : 'Factuur'}
                </h1>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
                  {status.label}
                </span>
                {invoice.is_deposit_invoice && invoice.deposit_percentage && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                    {invoice.deposit_percentage}%
                  </span>
                )}
                {invoice.is_remainder_invoice && invoice.deposit_percentage && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                    {100 - invoice.deposit_percentage}%
                  </span>
                )}
              </div>
              <p className="text-white/70 text-sm mt-1">{invoice.number}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold">{settings?.company_name || 'DesignPixels'}</p>
              {settings && (
                <div className="text-white/70 text-xs mt-1 space-y-0.5">
                  {settings.address_line1 && <p>{settings.address_line1}</p>}
                  {(settings.postal_code || settings.city) && <p>{settings.postal_code} {settings.city}</p>}
                  {settings.iban && <p>IBAN: {settings.iban}</p>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Meta info */}
        <div className="px-8 py-5 bg-gray-50 border-b border-gray-100">
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-gray-400" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Klant</p>
                <p className="text-sm font-medium text-gray-900 mt-0.5">{invoice.client_name || clientName}</p>
                {projectName && <p className="text-xs text-gray-400">{projectName}</p>}
                {invoice.client_address && (
                  <p className="text-xs text-gray-400 whitespace-pre-line mt-0.5">{invoice.client_address}</p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 text-gray-400" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Datum</p>
                <p className="text-sm font-medium text-gray-900 mt-0.5">
                  {new Date(invoiceDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                {invoice.due_date && (
                  <p className="text-xs text-gray-400">
                    Vervalt op {new Date(invoice.due_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                <Hash className="w-4 h-4 text-gray-400" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Factuurnummer</p>
                <p className="text-sm font-medium text-gray-900 font-mono mt-0.5">{invoice.number}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="px-8 py-6">
          <div className="grid grid-cols-12 gap-2 pb-3 border-b border-gray-200">
            <div className="col-span-6">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Omschrijving</p>
            </div>
            <div className="col-span-2 text-right">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Aantal</p>
            </div>
            <div className="col-span-2 text-right">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Prijs</p>
            </div>
            <div className="col-span-2 text-right">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Totaal</p>
            </div>
          </div>

          <div className="divide-y divide-gray-50">
            {items.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                Geen factuurregels
              </div>
            ) : items.map((item, i) => {
              if (item.type === 'divider') {
                return <div key={i} className="py-3"><div className="border-t border-gray-200" /></div>
              }

              if (item.type === 'title') {
                return (
                  <div key={i} className="py-3">
                    <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                  </div>
                )
              }

              const lineTotal = (item.quantity || 0) * (item.price || 0)
              return (
                <div key={i} className="grid grid-cols-12 gap-2 py-3 items-start">
                  <div className="col-span-6">
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    {item.description && (
                      <div
                        className="text-xs text-gray-400 mt-0.5 prose-quote"
                        dangerouslySetInnerHTML={{ __html: item.description }}
                      />
                    )}
                    {item.is_recurring && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-medium rounded mt-1">
                        Jaarlijks terugkerend
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-sm text-gray-600">{item.quantity} {item.unit}</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-sm text-gray-600">&euro; {(item.price || 0).toFixed(2)}</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-sm font-semibold text-gray-900">&euro; {lineTotal.toFixed(2)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Totals */}
        <div className="px-8 py-5 bg-gray-50 border-t border-gray-100">
          <div className="flex justify-end">
            <div className="w-72 space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotaal</span>
                <span className="text-gray-900 font-medium">&euro; {subtotal.toFixed(2)}</span>
              </div>
              {invoice.discount_percent > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Korting ({invoice.discount_percent}%)</span>
                  <span className="text-red-500 font-medium">- &euro; {discountAmount.toFixed(2)}</span>
                </div>
              )}
              {!korEnabled && invoice.btw_percent > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">BTW ({invoice.btw_percent}%)</span>
                  <span className="text-gray-900 font-medium">&euro; {btwAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-2.5 flex justify-between">
                <span className="text-base font-bold text-gray-900">Totaal</span>
                <span className="text-xl font-bold text-primary">&euro; {total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="px-8 py-5 border-t border-gray-100">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Opmerkingen</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        {/* Payment info */}
        {settings?.iban && invoice.status !== 'paid' && (
          <div className="px-8 py-4 bg-blue-50 border-t border-blue-100">
            <p className="text-sm text-blue-700">
              Gelieve het bedrag {invoice.due_date && (<>vóór <span className="font-semibold">{new Date(invoice.due_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</span> </>)}over te maken naar <span className="font-semibold">{settings.iban}</span> o.v.v. factuurnummer <span className="font-semibold">{invoice.number}</span>.
            </p>
          </div>
        )}

        {/* KOR notice */}
        {korEnabled && (
          <div className="px-8 py-3 bg-amber-50 border-t border-amber-100">
            <p className="text-xs text-amber-700">
              Op grond van de Kleineondernemersregeling (KOR) is er geen BTW verschuldigd.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
