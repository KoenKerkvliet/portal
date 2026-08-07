import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { QuoteSettings, YearFormat } from '../../types'
import { Save, Loader2, Check, FileCheck, Hash } from 'lucide-react'

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

const defaultSettings: Omit<QuoteSettings, 'id' | 'created_at' | 'updated_at'> = {
  quote_prefix: 'OFF',
  year_format: 'YY',
  start_number: 1,
}

export default function QuoteSettingsPage() {
  const [settings, setSettings] = useState(defaultSettings)
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('quote_settings')
        .select('*')
        .limit(1)
        .single()

      if (data) {
        setSettingsId(data.id)
        setSettings({
          quote_prefix: data.quote_prefix || 'OFF',
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
      await supabase.from('quote_settings').update(payload).eq('id', settingsId)
    } else {
      const { data } = await supabase.from('quote_settings').insert(payload).select().single()
      if (data) setSettingsId(data.id)
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const update = (field: string, value: string | number) => {
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

  const preview = formatPreview(settings.quote_prefix, settings.year_format, settings.start_number)
  const nextYearPreview = formatNextYearPreview(settings.quote_prefix, settings.year_format, settings.start_number)

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Offerte-instellingen</h1>
        <p className="text-sm text-gray-500 mt-1">Stel je offertenummering in.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {/* Offertenummering */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
            <Hash className="w-5 h-5 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Offertenummering</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prefix</label>
                <input
                  type="text"
                  value={settings.quote_prefix}
                  onChange={(e) => update('quote_prefix', e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all font-mono"
                  placeholder="OFF"
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
                  <p className="text-xs text-gray-400 mb-0.5">Dit jaar — eerste offerte</p>
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-primary" />
                    <span className="text-lg font-bold text-gray-900 font-mono">{preview}</span>
                  </div>
                </div>
                <div className="w-px h-10 bg-gray-200" />
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Volgend jaar — eerste offerte</p>
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-gray-400" />
                    <span className="text-lg font-bold text-gray-500 font-mono">{nextYearPreview}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Elke volgende offerte telt op: {preview}, {formatPreview(settings.quote_prefix, settings.year_format, settings.start_number + 1)}, {formatPreview(settings.quote_prefix, settings.year_format, settings.start_number + 2)}, ...
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
