import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { InvoiceSettings, YearFormat } from '../../types'
import { Save, Loader2, Check, FileText, Building2, CreditCard, Hash } from 'lucide-react'

const currentYear = new Date().getFullYear()

function formatPreview(prefix: string, yearFormat: YearFormat, startNumber: number): string {
  const yearStr = yearFormat === 'YY'
    ? String(currentYear).slice(-2)
    : String(currentYear)
  return `${prefix}${yearStr}${startNumber}`
}

function formatNextYearPreview(prefix: string, yearFormat: YearFormat, startNumber: number): string {
  const nextYear = currentYear + 1
  const yearStr = yearFormat === 'YY'
    ? String(nextYear).slice(-2)
    : String(nextYear)
  return `${prefix}${yearStr}${startNumber}`
}

const defaultSettings: Omit<InvoiceSettings, 'id' | 'created_at' | 'updated_at'> = {
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

export default function InvoiceSettingsPage() {
  const [settings, setSettings] = useState(defaultSettings)
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('invoice_settings')
        .select('*')
        .limit(1)
        .single()

      if (data) {
        setSettingsId(data.id)
        setSettings({
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
      setLoading(false)
    }
    fetch()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaved(false)

    const payload = {
      ...settings,
      updated_at: new Date().toISOString(),
    }

    if (settingsId) {
      await supabase.from('invoice_settings').update(payload).eq('id', settingsId)
    } else {
      const { data } = await supabase.from('invoice_settings').insert(payload).select().single()
      if (data) setSettingsId(data.id)
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const update = (field: string, value: string | number | boolean) => {
    setSettings(prev => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  const preview = formatPreview(settings.invoice_prefix, settings.year_format, settings.start_number)
  const nextYearPreview = formatNextYearPreview(settings.invoice_prefix, settings.year_format, settings.start_number)

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Factuurinstellingen</h1>
        <p className="text-sm text-gray-500 mt-1">Stel je bedrijfsgegevens en factuurnummering in.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {/* Bedrijfsgegevens */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
            <Building2 className="w-5 h-5 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Bedrijfsgegevens</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bedrijfsnaam</label>
              <input
                type="text"
                value={settings.company_name}
                onChange={(e) => update('company_name', e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                placeholder="DesignPixels"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresregel 1</label>
              <input
                type="text"
                value={settings.address_line1}
                onChange={(e) => update('address_line1', e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                placeholder="Straatnaam 123"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresregel 2 <span className="text-gray-400 font-normal">(optioneel)</span></label>
              <input
                type="text"
                value={settings.address_line2}
                onChange={(e) => update('address_line2', e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                placeholder="Toevoeging, verdieping, etc."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
                <input
                  type="text"
                  value={settings.postal_code}
                  onChange={(e) => update('postal_code', e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                  placeholder="1234 AB"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plaats</label>
                <input
                  type="text"
                  value={settings.city}
                  onChange={(e) => update('city', e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                  placeholder="Amsterdam"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Land</label>
              <input
                type="text"
                value={settings.country}
                onChange={(e) => update('country', e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                placeholder="Nederland"
              />
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
              <input
                type="text"
                value={settings.iban}
                onChange={(e) => update('iban', e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all font-mono"
                placeholder="NL00 BANK 0000 0000 00"
              />
            </div>

            {/* KOR toggle */}
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4">
              <input
                type="checkbox"
                id="kor_enabled"
                checked={settings.kor_enabled}
                onChange={(e) => update('kor_enabled', e.target.checked)}
                className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/30 mt-0.5"
              />
              <div>
                <label htmlFor="kor_enabled" className="text-sm font-medium text-gray-800 cursor-pointer">
                  Kleineondernemersregeling (KOR)
                </label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Als je de KOR gebruikt, wordt er geen BTW berekend of getoond op facturen en offertes.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {!settings.kor_enabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">BTW-nummer</label>
                  <input
                    type="text"
                    value={settings.btw_number}
                    onChange={(e) => update('btw_number', e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all font-mono"
                    placeholder="NL000000000B00"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">KVK-nummer</label>
                <input
                  type="text"
                  value={settings.kvk_number}
                  onChange={(e) => update('kvk_number', e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all font-mono"
                  placeholder="00000000"
                />
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
                <input
                  type="text"
                  value={settings.invoice_prefix}
                  onChange={(e) => update('invoice_prefix', e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all font-mono"
                  placeholder="INV"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jaartal formaat</label>
                <div className="flex gap-2 mt-0.5">
                  {(['YY', 'YYYY'] as YearFormat[]).map((fmt) => (
                    <button
                      type="button"
                      key={fmt}
                      onClick={() => update('year_format', fmt)}
                      className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                        settings.year_format === fmt
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {fmt === 'YY' ? `YY (${String(currentYear).slice(-2)})` : `YYYY (${currentYear})`}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Startnummer</label>
                <input
                  type="number"
                  min={1}
                  value={settings.start_number}
                  onChange={(e) => update('start_number', parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all font-mono"
                  placeholder="1"
                />
              </div>
            </div>

            {/* Preview */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Voorbeeld</p>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Dit jaar — eerste factuur</p>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="text-lg font-bold text-gray-900 font-mono">{preview}</span>
                  </div>
                </div>
                <div className="w-px h-10 bg-gray-200" />
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Volgend jaar — eerste factuur</p>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="text-lg font-bold text-gray-500 font-mono">{nextYearPreview}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Elke volgende factuur telt op: {preview}, {formatPreview(settings.invoice_prefix, settings.year_format, settings.start_number + 1)}, {formatPreview(settings.invoice_prefix, settings.year_format, settings.start_number + 2)}, ...
                <br />
                Bij een nieuw jaar wordt het jaartal automatisch opgehoogd en start de nummering weer bij {settings.start_number}.
              </p>
            </div>
          </div>
        </section>

        {/* Save button */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
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
          {saved && (
            <span className="text-sm text-green-600 font-medium">Instellingen opgeslagen!</span>
          )}
        </div>
      </form>
    </div>
  )
}
