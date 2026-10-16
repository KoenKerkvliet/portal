import { useState } from 'react'
import { Check, Copy, Download, Eye, ExternalLink, ImagePlus, Loader2, Monitor, Trash2, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { renderMonitorImage } from './MonitorPreview'
import { newBoardToken } from '../lib/tasks'
import { REDESIGN_DEFAULT_INTRO, REDESIGN_URL, redesignDefaultTitle } from '../lib/leads'
import type { Lead } from '../types'

const formatViewed = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// Redesignpagina van een lead: design file uploaden, titel en intro aanpassen en de
// link kopiëren om zelf te mailen. Uploaden of vervangen stuurt niets naar de lead.
export default function LeadRedesign({ lead, onSave }: {
  lead: Lead
  onSave: (patch: Partial<Lead>) => Promise<void>
}) {
  const [uploading, setUploading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const url = lead.redesign_token ? `${REDESIGN_URL}/${lead.redesign_token}` : ''
  const active = !!lead.redesign_image_url && !!url

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `leads/${lead.id}/redesign_${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('design-images').upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('design-images').getPublicUrl(path)
      // De eerste keer: code en standaardtekst erbij. Daarna blijft de link hetzelfde.
      await onSave({
        redesign_image_url: data.publicUrl,
        ...(lead.redesign_token ? {} : { redesign_token: newBoardToken() }),
        ...(lead.redesign_title ? {} : { redesign_title: redesignDefaultTitle(lead.name) }),
        ...(lead.redesign_intro ? {} : { redesign_intro: REDESIGN_DEFAULT_INTRO }),
      })
    } catch (err) {
      console.error('Upload error:', err)
      alert('Upload mislukt. Probeer het opnieuw.')
    } finally {
      setUploading(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Kopieer de link:', url)
    }
  }

  // De monitor met de homepage als JPG, om in de mail te zetten
  const downloadMonitor = async () => {
    if (!lead.redesign_image_url) return
    setDownloading(true)
    try {
      const blob = await renderMonitorImage(lead.redesign_image_url)
      const slug = lead.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `redesign-${slug || 'lead'}.jpg`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } catch (err) {
      console.error('Monitorafbeelding maken mislukt:', err)
      alert('De monitorafbeelding maken is mislukt. Probeer het opnieuw.')
    } finally {
      setDownloading(false)
    }
  }

  const fileInput = (
    <input type="file" accept="image/*" className="hidden" disabled={uploading}
      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
  )

  return (
    <div className="mt-6 pt-5 border-t border-gray-200/70">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Redesignpagina</p>

      {!lead.redesign_image_url ? (
        <label className={`flex items-center gap-3 px-4 py-4 border-2 border-dashed border-gray-200 rounded-xl bg-white text-xs text-gray-500 transition-colors ${uploading ? 'opacity-60' : 'cursor-pointer hover:border-primary/40 hover:text-primary'}`}>
          {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
          <span>
            <span className="font-medium text-gray-700">Upload de design file</span> (1920px breed, de hele pagina).
            Je krijgt een link naar een pagina met het ontwerp in een monitor die je zelf kunt mailen.
          </span>
          {fileInput}
        </label>
      ) : (
        <div className="grid md:grid-cols-[160px_1fr] gap-4">
          <div>
            <a href={lead.redesign_image_url} target="_blank" rel="noopener noreferrer" title="Open op ware grootte">
              <img src={lead.redesign_image_url} alt="" className="w-40 h-28 rounded-lg border border-gray-200 object-cover object-top bg-white" />
            </a>
            <div className="flex items-center gap-1 mt-2">
              <label className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 rounded-md hover:bg-gray-100 hover:text-gray-700 transition-colors ${uploading ? 'opacity-60' : 'cursor-pointer'}`}
                title="Nieuwe versie uploaden; de link blijft hetzelfde">
                {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                Vervangen
                {fileInput}
              </label>
              <button type="button"
                onClick={() => { if (confirm('Design file weghalen? De link toont dan niets meer, tot je een nieuwe uploadt.')) onSave({ redesign_image_url: null }) }}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 rounded-md hover:bg-red-50 hover:text-red-600 transition-colors"
                title="Weghalen">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <button type="button" onClick={downloadMonitor} disabled={downloading}
              className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 border border-gray-200 bg-white rounded-lg hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-60"
              title="Monitor met de homepage als afbeelding, voor in je mail">
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Monitor className="w-3.5 h-3.5" />}
              Monitor downloaden
              {!downloading && <Download className="w-3 h-3 text-gray-400" />}
            </button>
          </div>

          <div className="space-y-2 min-w-0">
            <input
              key={`title-${lead.redesign_title ?? ''}`}
              defaultValue={lead.redesign_title ?? ''}
              onBlur={(e) => { if (e.target.value !== (lead.redesign_title ?? '')) onSave({ redesign_title: e.target.value || null }) }}
              placeholder={redesignDefaultTitle(lead.name)}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <textarea
              key={`intro-${lead.redesign_intro ?? ''}`}
              defaultValue={lead.redesign_intro ?? ''}
              onBlur={(e) => { if (e.target.value !== (lead.redesign_intro ?? '')) onSave({ redesign_intro: e.target.value || null }) }}
              rows={3}
              placeholder={REDESIGN_DEFAULT_INTRO}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y"
            />
            {active && (
              <div className="flex items-center gap-1.5">
                <input readOnly value={url} onFocus={(e) => e.target.select()}
                  className="flex-1 min-w-0 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 focus:outline-none" />
                <button type="button" onClick={copy}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Gekopieerd' : 'Kopieer link'}
                </button>
                <a href={url} target="_blank" rel="noopener noreferrer" title="Bekijk de pagina (telt niet mee als bezoek)"
                  className="p-1.5 text-gray-400 hover:text-primary border border-gray-200 bg-white rounded-lg transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
              <Eye className="w-3.5 h-3.5 text-gray-400" />
              {lead.redesign_views > 0 && lead.redesign_first_viewed_at && lead.redesign_last_viewed_at ? (
                <span>
                  <span className="font-medium text-violet-700">{lead.redesign_views}× bekeken</span>
                  {' '}· eerst {formatViewed(lead.redesign_first_viewed_at)}
                  {lead.redesign_views > 1 && <> · laatst {formatViewed(lead.redesign_last_viewed_at)}</>}
                </span>
              ) : (
                <span>Nog niet bekeken</span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
