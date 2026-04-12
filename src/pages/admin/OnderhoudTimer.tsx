import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { PunchCard } from '../../types'
import { ArrowLeft, Play, Square, RotateCcw, Ticket, Clock, CheckCircle, Loader2 } from 'lucide-react'

export default function OnderhoudTimer() {
  const { projectId } = useParams()
  const [projectName, setProjectName] = useState('')
  const [cards, setCards] = useState<PunchCard[]>([])
  const [loading, setLoading] = useState(true)

  // Timer state
  const [running, setRunning] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [stopped, setStopped] = useState(false)
  const intervalRef = useRef<number | null>(null)

  // Log state
  const [description, setDescription] = useState('')
  const [suggestedStrips, setSuggestedStrips] = useState(0)
  const [customStrips, setCustomStrips] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const fetchData = useCallback(async () => {
    if (!projectId) return
    const [{ data: project }, { data: cardsData }] = await Promise.all([
      supabase.from('projects').select('name').eq('id', projectId).single(),
      supabase.from('punch_cards').select('*').eq('project_id', projectId).eq('status', 'active').order('number'),
    ])
    if (project) setProjectName(project.name)
    setCards(cardsData || [])
    setLoading(false)
  }, [projectId])

  useEffect(() => { fetchData() }, [fetchData])

  // Timer tick
  useEffect(() => {
    if (running) {
      intervalRef.current = window.setInterval(() => setSeconds(s => s + 1), 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  const totalRemaining = cards.reduce((sum, c) => sum + (c.total_punches - c.used_punches), 0)
  const availableMinutes = totalRemaining * 5

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const startTimer = () => {
    setRunning(true)
    setStopped(false)
    setConfirmed(false)
  }

  const stopTimer = () => {
    setRunning(false)
    setStopped(true)
    const minutes = Math.ceil(seconds / 60)
    const roundedMinutes = Math.ceil(minutes / 5) * 5
    const strips = roundedMinutes / 5
    setSuggestedStrips(strips)
    setCustomStrips(null)
  }

  const resetTimer = () => {
    setRunning(false)
    setStopped(false)
    setConfirmed(false)
    setSeconds(0)
    setSuggestedStrips(0)
    setCustomStrips(null)
  }

  const stripsToUse = customStrips ?? suggestedStrips

  const confirmLog = async () => {
    if (!projectId || stripsToUse <= 0) return
    setConfirming(true)

    let remaining = stripsToUse
    const now = new Date().toISOString()

    // Process cards oldest first
    for (const card of cards) {
      if (remaining <= 0) break
      const cardRemaining = card.total_punches - card.used_punches
      if (cardRemaining <= 0) continue

      const toUse = Math.min(remaining, cardRemaining)

      // Insert use records for each strip
      const uses = Array.from({ length: toUse }, (_, i) => ({
        punch_card_id: card.id,
        punch_index: card.used_punches + i + 1,
        description: description.trim() || 'Onderhoudswerkzaamheden',
        duration_minutes: 5,
        used_at: now,
      }))
      await supabase.from('punch_card_uses').insert(uses)

      // Update card
      const newUsed = card.used_punches + toUse
      const newStatus = newUsed >= card.total_punches ? 'used_up' : 'active'
      await supabase.from('punch_cards').update({
        used_punches: newUsed,
        status: newStatus,
      }).eq('id', card.id)

      remaining -= toUse
    }

    // Calculate new total remaining after deduction
    const newTotalRemaining = totalRemaining - stripsToUse
    const workDescription = description.trim() || 'Onderhoudswerkzaamheden'

    // Email clients
    try {
      const { data: projectClients } = await supabase
        .from('project_clients')
        .select('client:clients(email, name)')
        .eq('project_id', projectId)
        .eq('notify_punch_cards', true)

      if (projectClients) {
        for (const pc of projectClients) {
          const client = pc.client as unknown as { email: string; name: string }
          if (!client?.email) continue
          const emailHtml = `
            <!DOCTYPE html><html><head><meta charset="utf-8"></head>
            <body style="margin:0;padding:0;background:#f8f7fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              <div style="max-width:480px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
                <div style="background:linear-gradient(135deg,#9e86ff,#7c3aed);padding:32px;text-align:center;">
                  <h1 style="color:white;margin:0;font-size:22px;font-weight:700;">DesignPixels</h1>
                </div>
                <div style="padding:32px;">
                  <h2 style="color:#1f2937;margin:0 0 8px;font-size:20px;">🎫 Strippen afgeschreven</h2>
                  <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
                    Er ${stripsToUse === 1 ? 'is <strong>1 strip</strong>' : `zijn <strong>${stripsToUse} strippen</strong>`} afgeschreven voor <strong>${projectName}</strong>.
                  </p>
                  <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:16px;margin-bottom:16px;">
                    <p style="color:#6b7280;font-size:12px;font-weight:600;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.05em;">Werkzaamheden</p>
                    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0;">${workDescription}</p>
                  </div>
                  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;">
                    <table style="width:100%;border-collapse:collapse;">
                      <tr>
                        <td style="color:#6b7280;font-size:13px;padding:4px 0;">Afgeschreven</td>
                        <td style="color:#7c3aed;font-size:13px;font-weight:700;text-align:right;padding:4px 0;">${stripsToUse} strip${stripsToUse !== 1 ? 's' : ''}</td>
                      </tr>
                      <tr>
                        <td style="color:#6b7280;font-size:13px;padding:4px 0;">Resterend</td>
                        <td style="color:#16a34a;font-size:13px;font-weight:700;text-align:right;padding:4px 0;">${newTotalRemaining} strip${newTotalRemaining !== 1 ? 's' : ''}</td>
                      </tr>
                    </table>
                  </div>
                  <p style="color:#9ca3af;font-size:12px;margin:24px 0 0;">
                    Bekijk je strippenkaart in het klantportaal voor meer details.
                  </p>
                </div>
                <div style="padding:16px 32px;background:#f9fafb;text-align:center;">
                  <p style="color:#9ca3af;font-size:11px;margin:0;">&copy; ${new Date().getFullYear()} DesignPixels</p>
                </div>
              </div>
            </body></html>
          `
          await supabase.functions.invoke('send-test-email', {
            body: {
              to: client.email,
              subject: `Strippen afgeschreven — ${projectName}`,
              html: emailHtml,
            },
          })
        }
      }
    } catch (err) {
      console.error('Error sending punch card email:', err)
    }

    setConfirming(false)
    setConfirmed(true)
    fetchData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link to="/admin/onderhoud" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Terug naar onderhoud
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tijd loggen</h1>
        <p className="text-sm text-gray-500 mt-1">{projectName}</p>
      </div>

      {/* Available strips */}
      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold ${
          totalRemaining > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          <Ticket className="w-4 h-4" />
          {totalRemaining} strips beschikbaar
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-50 text-gray-600 border border-gray-200">
          <Clock className="w-4 h-4" />
          {availableMinutes} minuten
        </div>
      </div>

      {/* Timer */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
        <div className="text-6xl font-mono font-bold text-gray-900 mb-8 tabular-nums">
          {formatTime(seconds)}
        </div>

        <div className="flex items-center justify-center gap-3">
          {!running && !stopped && (
            <button onClick={startTimer}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-medium transition-colors">
              <Play className="w-5 h-5" />
              Start
            </button>
          )}
          {running && (
            <button onClick={stopTimer}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-medium transition-colors">
              <Square className="w-5 h-5" />
              Stop
            </button>
          )}
          {(running || stopped) && (
            <button onClick={resetTimer}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-medium transition-colors">
              <RotateCcw className="w-5 h-5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Result after stopping */}
      {stopped && !confirmed && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
          <h3 className="text-base font-bold text-gray-900">Tijd afronden</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Werkzaamheden</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-y"
              placeholder="Beschrijf de uitgevoerde werkzaamheden..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Werkelijke tijd</p>
              <p className="text-lg font-bold text-gray-900">{formatTime(seconds)}</p>
              <p className="text-xs text-gray-500">{Math.ceil(seconds / 60)} minuten</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-4 text-center border border-purple-100">
              <p className="text-xs text-purple-400 uppercase tracking-wider mb-1">Afgerond</p>
              <p className="text-lg font-bold text-purple-700">{stripsToUse * 5} minuten</p>
              <p className="text-xs text-purple-500">{stripsToUse} strip{stripsToUse !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Aantal strips aanpassen</label>
            <select
              value={stripsToUse}
              onChange={(e) => setCustomStrips(Number(e.target.value))}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {Array.from({ length: Math.min(12, totalRemaining) }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>
                  {n} strip{n !== 1 ? 's' : ''} ({n * 5} minuten){n === suggestedStrips ? ' — voorgesteld' : ''}
                </option>
              ))}
            </select>
          </div>

          {stripsToUse > totalRemaining && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600">
              Niet genoeg strips beschikbaar ({totalRemaining} over).
            </div>
          )}

          <button
            onClick={confirmLog}
            disabled={confirming || stripsToUse > totalRemaining || stripsToUse <= 0}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            {confirming ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
            {confirming ? 'Bezig met afschrijven...' : `${stripsToUse} strip${stripsToUse !== 1 ? 's' : ''} afschrijven`}
          </button>
        </div>
      )}

      {/* Confirmed */}
      {confirmed && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-900 mb-1">Strips afgeschreven</h3>
          <p className="text-sm text-gray-500">De klant kan de gelogde werkzaamheden nu zien op de strippenkaart.</p>
          <button onClick={resetTimer} className="mt-4 text-sm text-primary hover:text-primary/80 font-medium transition-colors">
            Opnieuw loggen
          </button>
        </div>
      )}
    </div>
  )
}
