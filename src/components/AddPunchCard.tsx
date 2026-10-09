import { useState } from 'react'
import { Gift, Loader2, Plus, Receipt } from 'lucide-react'
import { supabase } from '../lib/supabase'

// Een kaart toevoegen kan als cadeau (bijv. voor een review, € 0) of omdat de klant
// via een factuur heeft betaald: dan telt hij mee als verkochte kaart met de prijs.
type AddKind = 'gift' | 'paid'

// Dezelfde pakketten als in de strippenkaartwinkel
const PAID_PACKAGES = [
  { strips: 12, price: 40, label: '60 minuten (12 strippen) · € 40' },
  { strips: 36, price: 100, label: '180 minuten (36 strippen) · € 100' },
  { strips: 60, price: 160, label: '300 minuten (60 strippen) · € 160' },
]

// Knop 'Strippenkaart toevoegen' die openklapt tot de keuze cadeau / betaald via factuur.
// Gebruikt op de pagina Onderhoud en in de onderhoudssectie van de domeinpagina.
export default function AddPunchCard({ projectId, nextNumber, onAdded, align = 'end' }: {
  projectId: string
  nextNumber: number
  onAdded: () => void
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<AddKind>('gift')
  const [giftPunches, setGiftPunches] = useState(6)
  const [paidPackage, setPaidPackage] = useState(0)
  const [saving, setSaving] = useState(false)

  const add = async () => {
    const pkg = PAID_PACKAGES[paidPackage]
    setSaving(true)
    // Vervaldatum regelt de database (36 maanden, of geen bij websitebeheer); dit is alleen een terugvaloptie
    const { error } = await supabase.from('punch_cards').insert({
      project_id: projectId,
      number: nextNumber,
      total_punches: kind === 'paid' ? pkg.strips : giftPunches,
      used_punches: 0,
      is_gift: kind === 'gift',
      price: kind === 'paid' ? pkg.price : 0,
      status: 'active',
      purchased_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    })
    setSaving(false)
    if (error) {
      alert('Strippenkaart toevoegen mislukt: ' + error.message)
      return
    }
    setOpen(false)
    onAdded()
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-medium text-purple-600 hover:text-purple-700 transition-colors">
        <Plus className="w-3.5 h-3.5" />
        Strippenkaart toevoegen
      </button>
    )
  }

  const selectClass = 'text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-300'
  return (
    <div className={`flex items-center gap-3 flex-wrap ${align === 'end' ? 'justify-end' : ''}`}>
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
        {([['gift', 'Cadeau', Gift], ['paid', 'Betaald via factuur', Receipt]] as const).map(([value, label, Icon]) => (
          <button key={value} type="button" onClick={() => setKind(value)}
            className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
              kind === value ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>
      {kind === 'gift' ? (
        <select value={giftPunches} onChange={(e) => setGiftPunches(Number(e.target.value))} className={selectClass}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
            <option key={n} value={n}>{n} strippen</option>
          ))}
        </select>
      ) : (
        <select value={paidPackage} onChange={(e) => setPaidPackage(Number(e.target.value))} className={selectClass}>
          {PAID_PACKAGES.map((p, i) => (
            <option key={p.strips} value={i}>{p.label}</option>
          ))}
        </select>
      )}
      <button type="button" onClick={add} disabled={saving}
        className="flex items-center gap-1.5 text-xs font-medium bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : kind === 'gift' ? <Gift className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        {kind === 'gift' ? 'Schenken' : 'Toevoegen'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
        Annuleren
      </button>
    </div>
  )
}
