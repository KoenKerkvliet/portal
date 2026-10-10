import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Search, KeyRound, ExternalLink } from 'lucide-react'

interface Props {
  onClose: () => void
  /** Wordt aangeroepen zodra GitHub de scan heeft aangenomen. */
  onStarted: (runsUrl: string) => void
}

const REGIOS = [
  { value: 'parkstad', label: 'Parkstad' },
  { value: 'zuid-limburg', label: 'Zuid-Limburg' },
]

export default function LeadScanDialog({ onClose, onStarted }: Props) {
  const [checking, setChecking] = useState(true)
  const [needsToken, setNeedsToken] = useState(false)
  const [token, setToken] = useState('')
  const [zoekterm, setZoekterm] = useState('')
  const [regio, setRegio] = useState('parkstad')
  const [max, setMax] = useState('20')
  const [typeLabel, setTypeLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Eén keer kijken of de GitHub-token al is ingesteld.
  useEffect(() => {
    let active = true
    supabase.functions
      .invoke('start-lead-scan', { body: { action: 'status' } })
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError('Kan de scanner niet bereiken.')
        else setNeedsToken(!data?.tokenConfigured)
        setChecking(false)
      })
    return () => { active = false }
  }, [])

  const saveToken = async () => {
    setBusy(true)
    setError('')
    const { data, error: fnError } = await supabase.functions.invoke('start-lead-scan', {
      body: { action: 'save-token', token },
    })
    setBusy(false)
    if (fnError || data?.error) {
      setError(data?.error || 'Opslaan mislukt.')
      return
    }
    setToken('')
    setNeedsToken(false)
  }

  const start = async () => {
    if (!zoekterm.trim()) {
      setError('Vul een zoekterm in.')
      return
    }
    setBusy(true)
    setError('')
    const { data, error: fnError } = await supabase.functions.invoke('start-lead-scan', {
      body: { action: 'start', zoekterm, regio, max, type_label: typeLabel },
    })
    setBusy(false)
    if (data?.needsToken) {
      setNeedsToken(true)
      return
    }
    if (fnError || data?.error) {
      setError([data?.error, data?.detail].filter(Boolean).join(' — ') || 'Starten mislukt.')
      return
    }
    onStarted(data.runsUrl)
  }

  const field =
    'w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh] overflow-y-auto pointer-events-none">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">
              {needsToken ? 'Scanner koppelen' : 'Nieuwe scan'}
            </h2>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {checking ? (
              <p className="text-sm text-gray-500">Even kijken of de scanner klaarstaat...</p>
            ) : needsToken ? (
              <>
                <div className="flex gap-3 p-3 bg-amber-50 rounded-xl">
                  <KeyRound className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-900">
                    Eenmalig: het portaal heeft een GitHub-token nodig om de scan te mogen
                    starten. Maak er een aan met toegang tot <strong>lead-scanner</strong> en
                    de rechten <strong>Actions: read and write</strong>.
                  </p>
                </div>
                <a
                  href="https://github.com/settings/personal-access-tokens/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  Token aanmaken op GitHub
                  <ExternalLink className="w-3 h-3" />
                </a>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className={field}
                  placeholder="github_pat_..."
                  autoComplete="off"
                />
                <p className="text-xs text-gray-400">
                  De token wordt bewaard bij je overige integraties, in een tabel die
                  alleen de server kan lezen — de browser krijgt hem nooit te zien.
                </p>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Type bedrijf</label>
                  <input
                    value={zoekterm}
                    onChange={(e) => setZoekterm(e.target.value)}
                    className={field}
                    placeholder="nagelstudio, of: kapper, kapsalon"
                    autoFocus
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Meerdere zoektermen mag, gescheiden door komma's.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Regio</label>
                    <select value={regio} onChange={(e) => setRegio(e.target.value)} className={field}>
                      {REGIOS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Max per zoekterm</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={max}
                      onChange={(e) => setMax(e.target.value)}
                      className={field}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Type-label <span className="text-gray-400">(leeg = de zoekterm zelf)</span>
                  </label>
                  <input
                    value={typeLabel}
                    onChange={(e) => setTypeLabel(e.target.value)}
                    className={field}
                    placeholder="bijv. Vereniging"
                  />
                </div>
              </>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 transition-colors"
            >
              Annuleren
            </button>
            {!checking && (
              <button
                onClick={needsToken ? saveToken : start}
                disabled={busy || (needsToken ? !token.trim() : !zoekterm.trim())}
                className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {needsToken ? <KeyRound className="w-4 h-4" /> : <Search className="w-4 h-4" />}
                {busy ? 'Bezig...' : needsToken ? 'Token opslaan' : 'Scan starten'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
