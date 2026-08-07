import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import type { InvoiceSettings, QuoteSettings, YearFormat } from '../../types'
import { Save, Loader2, Check, User, FileText, FileCheck, Building2, CreditCard, Hash } from 'lucide-react'

const currentYear = new Date().getFullYear()

function formatPreview(prefix: string, yearFormat: YearFormat, startNumber: number): string {
  const yearStr = yearFormat === 'YY' ? String(currentYear).slice(-2) : String(currentYear)
  return `${prefix}${yearStr}${startNumber}`
}

function formatNextYearPreview(prefix: string, yearFormat: YearFormat, startNumber: number): string {
  const nextYear = currentYear + 1
  const yearStr = yearFormat === 'YY' ? String(nextYear).slice(-2) : String(nextYear)
  return `${prefix}${yearStr}${startNumber}`
}

type Tab = 'profiel' | 'facturen' | 'offertes'

const tabs: { id: Tab; label: string; icon: typeof User }[] = [
  { id: 'profiel', label: 'Profiel', icon: User },
  { id: 'facturen', label: 'Facturen', icon: FileText },
  { id: 'offertes', label: 'Offertes', icon: FileCheck },
]

const defaultInvoiceSettings: Omit<InvoiceSettings, 'id' | 'created_at' | 'updated_at'> = {
  company_name: '',
  address_line1: '',
  address_line2: '',
  postal_code: '',
  city: '',
  country: 'Nederland',
  iban: '',
  btw_number: '',
  kvk_number: '',
  kor_enabled: false,
  invoice_prefix: 'INV',
  year_format: 'YY',
  start_number: 1,
}

const defaultQuoteSettings: Omit<QuoteSettings, 'id' | 'created_at' | 'updated_at'> = {
  quote_prefix: 'OFF',
  year_format: 'YY',
  start_number: 1,
}

export default function AdminSettings() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('profiel')

  // Profile state
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

  // Invoice settings state
  const [invoiceSettings, setInvoiceSettings] = useState(defaultInvoiceSettings)
  const [invoiceSettingsId, setInvoiceSettingsId] = useState<string | null>(null)
  const [invoiceLoading, setInvoiceLoading] = useState(true)
  const [invoiceSaving, setInvoiceSaving] = useState(false)
  const [invoiceSaved, setInvoiceSaved] = useState(false)

  // Quote settings state
  const [quoteSettings, setQuoteSettings] = useState(defaultQuoteSettings)
  const [quoteSettingsId, setQuoteSettingsId] = useState<string | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(true)
  const [quoteSaving, setQuoteSaving] = useState(false)
  const [quoteSaved, setQuoteSaved] = useState(false)

  // Load invoice settings
  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('invoice_settings').select('*').limit(1).single()
      if (data) {
        setInvoiceSettingsId(data.id)
        setInvoiceSettings({
          company_name: data.company_name || '',
          address_line1: data.address_line1 || '',
          address_line2: data.address_line2 || '',
          postal_code: data.postal_code || '',
          city: data.city || '',
          country: data.country || 'Nederland',
          iban: data.iban || '',
          btw_number: data.btw_number || '',
          kvk_number: data.kvk_number || '',
          kor_enabled: data.kor_enabled ?? false,
          invoice_prefix: data.invoice_prefix || 'INV',
          year_format: data.year_format || 'YY',
          start_number: data.start_number ?? 1,
        })
      }
      setInvoiceLoading(false)
    }
    fetch()
  }, [])

  // Load quote settings
  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('quote_settings').select('*').limit(1).single()
      if (data) {
        setQuoteSettingsId(data.id)
        setQuoteSettings({
          quote_prefix: data.quote_prefix || 'OFF',
          year_format: data.year_format || 'YY',
          start_number: data.start_number ?? 1,
        })
      }
      setQuoteLoading(false)
    }
    fetch()
  }, [])

  // Save handlers
  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileSaving(true)
    await supabase.from('profiles').update({ full_name: fullName }).eq('id', profile?.id)
    setProfileSaving(false)
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2000)
  }

  const handleInvoiceSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setInvoiceSaving(true)
    setInvoiceSaved(false)
    const payload = { ...invoiceSettings, updated_at: new Date().toISOString() }
    if (invoiceSettingsId) {
      await supabase.from('invoice_settings').update(payload).eq('id', invoiceSettingsId)
    } else {
      const { data } = await supabase.from('invoice_settings').insert(payload).select().single()
      if (data) setInvoiceSettingsId(data.id)
    }
    setInvoiceSaving(false)
    setInvoiceSaved(true)
    setTimeout(() => setInvoiceSaved(false), 3000)
  }

  const handleQuoteSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setQuoteSaving(true)
    setQuoteSaved(false)
    const payload = { ...quoteSettings, updated_at: new Date().toISOString() }
    if (quoteSettingsId) {
      await supabase.from('quote_settings').update(payload).eq('id', quoteSettingsId)
    } else {
      const { data } = await supabase.from('quote_settings').insert(payload).select().single()
      if (data) setQuoteSettingsId(data.id)
    }
    setQuoteSaving(false)
    setQuoteSaved(true)
    setTimeout(() => setQuoteSaved(false), 3000)
  }

  const updateInvoice = (field: string, value: string | number | boolean) => {
    setInvoiceSettings(prev => ({ ...prev, [field]: value }))
    setInvoiceSaved(false)
  }

  const updateQuote = (field: string, value: string | number) => {
    setQuoteSettings(prev => ({ ...prev, [field]: value }))
    setQuoteSaved(false)
  }

  const invoicePreview = formatPreview(invoiceSettings.invoice_prefix, invoiceSettings.year_format, invoiceSettings.start_number)
  const invoiceNextYearPreview = formatNextYearPreview(invoiceSettings.invoice_prefix, invoiceSettings.year_format, invoiceSettings.start_number)
  const quotePreview = formatPreview(quoteSettings.quote_prefix, quoteSettings.year_format, quoteSettings.start_number)
  const quoteNextYearPreview = formatNextYearPreview(quoteSettings.quote_prefix, quoteSettings.year_format, quoteSettings.start_number)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Instellingen</h1>
        <p className="text-gray-500 mt-1">Beheer je profiel, factuur- en offerte-instellingen</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-8 max-w-md">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profiel tab */}
      {activeTab === 'profiel' && (
        <div className="max-w-lg">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <form onSubmit={handleProfileSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input type="email" value={profile?.email || ''} disabled className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Naam</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <input type="text" value={profile?.role === 'admin' ? 'Super Admin' : 'Klant'} disabled className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-500" />
              </div>
              <button type="submit" disabled={profileSaving} className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
                <Save className="w-4 h-4" />
                {profileSaved ? 'Opgeslagen!' : profileSaving ? 'Opslaan...' : 'Opslaan'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Facturen tab */}
      {activeTab === 'facturen' && (
        <div className="max-w-3xl">
          {invoiceLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <form onSubmit={handleInvoiceSave} className="space-y-8">
              {/* Bedrijfsgegevens */}
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
                  <Building2 className="w-5 h-5 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-700">Bedrijfsgegevens</h2>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bedrijfsnaam</label>
                    <input type="text" value={invoiceSettings.company_name} onChange={(e) => updateInvoice('company_name', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all" placeholder="DesignPixels" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Adresregel 1</label>
                    <input type="text" value={invoiceSettings.address_line1} onChange={(e) => updateInvoice('address_line1', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all" placeholder="Straatnaam 123" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Adresregel 2 <span className="text-gray-400 font-normal">(optioneel)</span></label>
                    <input type="text" value={invoiceSettings.address_line2} onChange={(e) => updateInvoice('address_line2', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all" placeholder="Toevoeging, verdieping, etc." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
                      <input type="text" value={invoiceSettings.postal_code} onChange={(e) => updateInvoice('postal_code', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all" placeholder="1234 AB" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Plaats</label>
                      <input type="text" value={invoiceSettings.city} onChange={(e) => updateInvoice('city', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all" placeholder="Amsterdam" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Land</label>
                    <input type="text" value={invoiceSettings.country} onChange={(e) => updateInvoice('country', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all" placeholder="Nederland" />
                  </div>
                </div>
              </section>

              {/* Financiele gegevens */}
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
                  <CreditCard className="w-5 h-5 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-700">Financiele gegevens</h2>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
                    <input type="text" value={invoiceSettings.iban} onChange={(e) => updateInvoice('iban', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all font-mono" placeholder="NL00 BANK 0000 0000 00" />
                  </div>
                  <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4">
                    <input type="checkbox" id="kor_enabled" checked={invoiceSettings.kor_enabled} onChange={(e) => updateInvoice('kor_enabled', e.target.checked)} className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/30 mt-0.5" />
                    <div>
                      <label htmlFor="kor_enabled" className="text-sm font-medium text-gray-800 cursor-pointer">Kleineondernemersregeling (KOR)</label>
                      <p className="text-xs text-gray-500 mt-0.5">Als je de KOR gebruikt, wordt er geen BTW berekend of getoond op facturen en offertes.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {!invoiceSettings.kor_enabled && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">BTW-nummer</label>
                        <input type="text" value={invoiceSettings.btw_number} onChange={(e) => updateInvoice('btw_number', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all font-mono" placeholder="NL000000000B00" />
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">KVK-nummer</label>
                      <input type="text" value={invoiceSettings.kvk_number} onChange={(e) => updateInvoice('kvk_number', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all font-mono" placeholder="00000000" />
                    </div>
                  </div>
                </div>
              </section>

              {/* Factuurnummering */}
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
                  <Hash className="w-5 h-5 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-700">Factuurnummering</h2>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Prefix</label>
                      <input type="text" value={invoiceSettings.invoice_prefix} onChange={(e) => updateInvoice('invoice_prefix', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all font-mono" placeholder="INV" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Jaartal formaat</label>
                      <div className="flex gap-2 mt-0.5">
                        {(['YY', 'YYYY'] as YearFormat[]).map((fmt) => (
                          <button type="button" key={fmt} onClick={() => updateInvoice('year_format', fmt)} className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${invoiceSettings.year_format === fmt ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
                            {fmt === 'YY' ? `YY (${String(currentYear).slice(-2)})` : `YYYY (${currentYear})`}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Startnummer</label>
                      <input type="number" min={1} value={invoiceSettings.start_number} onChange={(e) => updateInvoice('start_number', parseInt(e.target.value) || 1)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all font-mono" placeholder="1" />
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Voorbeeld</p>
                    <div className="flex items-center gap-6">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Dit jaar — eerste factuur</p>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-primary" />
                          <span className="text-lg font-bold text-gray-900 font-mono">{invoicePreview}</span>
                        </div>
                      </div>
                      <div className="w-px h-10 bg-gray-200" />
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Volgend jaar — eerste factuur</p>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="text-lg font-bold text-gray-500 font-mono">{invoiceNextYearPreview}</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-3">
                      Elke volgende factuur telt op: {invoicePreview}, {formatPreview(invoiceSettings.invoice_prefix, invoiceSettings.year_format, invoiceSettings.start_number + 1)}, {formatPreview(invoiceSettings.invoice_prefix, invoiceSettings.year_format, invoiceSettings.start_number + 2)}, ...
                      <br />
                      Bij een nieuw jaar wordt het jaartal automatisch opgehoogd en start de nummering weer bij {invoiceSettings.start_number}.
                    </p>
                  </div>
                </div>
              </section>

              <div className="flex items-center gap-3">
                <button type="submit" disabled={invoiceSaving} className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50">
                  {invoiceSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : invoiceSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {invoiceSaved ? 'Opgeslagen' : 'Opslaan'}
                </button>
                {invoiceSaved && <span className="text-sm text-green-600 font-medium">Instellingen opgeslagen!</span>}
              </div>
            </form>
          )}
        </div>
      )}

      {/* Offertes tab */}
      {activeTab === 'offertes' && (
        <div className="max-w-3xl">
          {quoteLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <form onSubmit={handleQuoteSave} className="space-y-8">
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
                  <Hash className="w-5 h-5 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-700">Offertenummering</h2>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Prefix</label>
                      <input type="text" value={quoteSettings.quote_prefix} onChange={(e) => updateQuote('quote_prefix', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all font-mono" placeholder="OFF" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Jaartal formaat</label>
                      <div className="flex gap-2 mt-0.5">
                        {(['YY', 'YYYY'] as YearFormat[]).map((fmt) => (
                          <button type="button" key={fmt} onClick={() => updateQuote('year_format', fmt)} className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${quoteSettings.year_format === fmt ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
                            {fmt === 'YY' ? `YY (${String(currentYear).slice(-2)})` : `YYYY (${currentYear})`}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Startnummer</label>
                      <input type="number" min={1} value={quoteSettings.start_number} onChange={(e) => updateQuote('start_number', parseInt(e.target.value) || 1)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all font-mono" placeholder="1" />
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Voorbeeld</p>
                    <div className="flex items-center gap-6">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Dit jaar — eerste offerte</p>
                        <div className="flex items-center gap-2">
                          <FileCheck className="w-4 h-4 text-primary" />
                          <span className="text-lg font-bold text-gray-900 font-mono">{quotePreview}</span>
                        </div>
                      </div>
                      <div className="w-px h-10 bg-gray-200" />
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Volgend jaar — eerste offerte</p>
                        <div className="flex items-center gap-2">
                          <FileCheck className="w-4 h-4 text-gray-400" />
                          <span className="text-lg font-bold text-gray-500 font-mono">{quoteNextYearPreview}</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-3">
                      Elke volgende offerte telt op: {quotePreview}, {formatPreview(quoteSettings.quote_prefix, quoteSettings.year_format, quoteSettings.start_number + 1)}, {formatPreview(quoteSettings.quote_prefix, quoteSettings.year_format, quoteSettings.start_number + 2)}, ...
                      <br />
                      Bij een nieuw jaar wordt het jaartal automatisch opgehoogd en start de nummering weer bij {quoteSettings.start_number}.
                    </p>
                  </div>
                </div>
              </section>

              <div className="flex items-center gap-3">
                <button type="submit" disabled={quoteSaving} className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50">
                  {quoteSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : quoteSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {quoteSaved ? 'Opgeslagen' : 'Opslaan'}
                </button>
                {quoteSaved && <span className="text-sm text-green-600 font-medium">Instellingen opgeslagen!</span>}
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
