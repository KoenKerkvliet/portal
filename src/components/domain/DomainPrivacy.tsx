import { useCallback, useEffect, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { KeyRound, Loader2, Lock, Send, ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { ProjectClient } from '../../types'
import HelpTip from '../HelpTip'

interface SecureLinkSend {
  id: string
  recipient_email: string
  note: string
  has_password: boolean
  sent_at: string
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const inputClass = 'w-full h-9 px-3 text-sm text-gray-800 bg-white border border-gray-200 rounded-md placeholder:text-gray-300 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors'

// Algemeen > Privacy: een beveiligde link (bijv. van Inprivy) mailen voor privacygevoelige
// gegevens zoals inloggegevens. De link zelf wordt nergens bewaard, alleen dát hij is verstuurd.
export default function DomainPrivacy({ projectId, projectClients }: { projectId: string; projectClients: ProjectClient[] }) {
  const [to, setTo] = useState('')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [hasPassword, setHasPassword] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [history, setHistory] = useState<SecureLinkSend[]>([])

  const load = useCallback(async () => {
    const { data } = await supabase.from('secure_link_sends').select('*').eq('project_id', projectId)
      .order('sent_at', { ascending: false }).limit(10)
    setHistory((data || []) as SecureLinkSend[])
  }, [projectId])

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load])

  const clients = projectClients
    .map(pc => pc.client as unknown as { name: string; email: string } | undefined)
    .filter((c): c is { name: string; email: string } => !!c?.email)

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirm(`De beveiligde link nu mailen naar ${to.trim()}?`)) return
    setSending(true)
    setMessage(null)
    const { data, error } = await supabase.functions.invoke('send-secure-link', {
      body: { project_id: projectId, to, url, note, has_password: hasPassword },
    })
    setSending(false)
    let failure = ''
    if (error) {
      failure = 'Versturen mislukt.'
      if (error instanceof FunctionsHttpError) {
        try { failure = (await error.context.json())?.error || failure } catch { /* standaardmelding */ }
      }
    } else if (!data?.success) {
      failure = data?.error || 'Versturen mislukt.'
    }
    if (failure) {
      setMessage({ ok: false, text: failure })
      return
    }
    // Link en toelichting meteen uit het formulier halen
    setUrl('')
    setNote('')
    setHasPassword(false)
    setMessage({ ok: true, text: `Verstuurd naar ${data.sent_to}` })
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2.5 text-xs text-gray-600">
        <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <p>
          Stuur privacygevoelige gegevens, zoals inloggegevens, niet in een gewone mail. Maak een beveiligde link in Inprivy en mail die hier.
          De link zelf wordt nergens in het portaal bewaard.
        </p>
      </div>

      <form onSubmit={send} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">E-mailadres</label>
              <HelpTip text="Kies een klant van dit domein of typ een ander adres, bijvoorbeeld van een collega of externe partij." />
            </div>
            <input type="email" required list={`privacy-recipients-${projectId}`} value={to} onChange={(e) => setTo(e.target.value)}
              placeholder="naam@voorbeeld.nl" className={inputClass} />
            <datalist id={`privacy-recipients-${projectId}`}>
              {clients.map(c => <option key={c.email} value={c.email}>{c.name}</option>)}
            </datalist>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Waar gaat het over?</label>
              <HelpTip text="Optioneel. Komt in het onderwerp en de mail, bijvoorbeeld 'inloggegevens van je mailbox'. Zet hier geen geheime gegevens in." align="right" />
            </div>
            <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="bijv. inloggegevens van je mailbox" className={inputClass} />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Beveiligde link</label>
          </div>
          <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" spellCheck={false}
            placeholder="https://secrets.designpixels.nl/..." className={`${inputClass} font-mono text-xs`} />
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={hasPassword} onChange={(e) => setHasPassword(e.target.checked)}
              className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/30" />
            <span className="text-sm text-gray-700">Link heeft een wachtwoord (stuur ik apart)</span>
          </label>
          <button type="submit" disabled={sending || !to.trim() || !url.trim()}
            className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-primary hover:bg-primary-600 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Verzenden
          </button>
        </div>
        {message && <p className={`text-xs ${message.ok ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>}
      </form>

      {history.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Eerder verstuurd</p>
          <ul className="border border-gray-200 rounded-md divide-y divide-gray-100">
            {history.map(h => (
              <li key={h.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600">
                <Lock className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                <span className="font-medium text-gray-800 truncate">{h.recipient_email}</span>
                {h.note && <span className="truncate text-gray-500">· {h.note}</span>}
                {h.has_password && <span title="Met wachtwoord"><KeyRound className="w-3 h-3 text-gray-400" /></span>}
                <span className="ml-auto flex-shrink-0 text-gray-400">{formatDateTime(h.sent_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
