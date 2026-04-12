import type { PunchCard } from '../types'
import { Gift, Check } from 'lucide-react'

interface Props {
  card: PunchCard
}

export default function PunchCardView({ card }: Props) {
  const remaining = card.total_punches - card.used_punches
  const isUsedUp = card.status === 'used_up' || remaining <= 0

  const expiresFormatted = card.expires_at
    ? new Date(card.expires_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const purchasedFormatted = new Date(card.purchased_at).toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'numeric', year: 'numeric',
  })

  return (
    <div className={`w-full max-w-sm rounded-2xl overflow-hidden shadow-sm border ${isUsedUp ? 'bg-gray-50 border-gray-200 opacity-70' : 'bg-[#fdf9ef] border-amber-100'}`}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        {/* Left: gift icon or card number */}
        <div className={`w-11 h-11 rounded-xl border-2 flex items-center justify-center ${
          card.is_gift
            ? 'border-purple-200 bg-purple-50'
            : 'border-purple-200 bg-purple-50'
        }`}>
          {card.is_gift ? (
            <Gift className="w-5 h-5 text-purple-500" />
          ) : (
            <span className="text-sm font-bold text-purple-600">{card.number}</span>
          )}
        </div>

        {/* Right: logo */}
        <div className="flex items-center gap-1.5">
          <div className="grid grid-cols-2 gap-0.5">
            <div className="w-1.5 h-1.5 rounded-sm bg-purple-400" />
            <div className="w-1.5 h-1.5 rounded-sm bg-purple-300" />
            <div className="w-1.5 h-1.5 rounded-sm bg-purple-300" />
            <div className="w-1.5 h-1.5 rounded-sm bg-purple-500" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-purple-400 leading-none">Design</p>
            <p className="text-sm font-bold text-purple-600 leading-none">Pixels</p>
          </div>
        </div>
      </div>

      {/* Purple banner */}
      <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-5 py-3 text-center">
        <h3 className="text-white font-extrabold text-lg tracking-wider uppercase">Strippenkaart</h3>
        {expiresFormatted && (
          <p className="text-purple-200 text-xs mt-0.5">Geldig tot: {expiresFormatted}</p>
        )}
      </div>

      {/* Punches */}
      <div className="px-4 py-3 space-y-1">
        {Array.from({ length: card.total_punches }, (_, i) => {
          const punchNumber = i + 1
          const isUsed = punchNumber <= card.used_punches
          return (
            <div
              key={i}
              className={`flex items-center rounded-md px-2.5 py-1.5 transition-colors ${
                isUsed
                  ? 'bg-gray-100'
                  : 'bg-white border border-gray-100'
              }`}
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                isUsed
                  ? 'bg-gray-200 text-gray-400'
                  : 'bg-purple-100 text-purple-600'
              }`}>
                {isUsed ? <Check className="w-3 h-3 text-gray-400" /> : punchNumber}
              </div>
              {isUsed && (
                <div className="flex-1 h-px bg-gray-300 mx-2.5" />
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-amber-100 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          <span className="font-bold text-purple-600">{remaining}</span> van {card.total_punches} strips over
        </p>
        <p className="text-xs text-gray-400">
          Aangekocht: {purchasedFormatted}
        </p>
      </div>
    </div>
  )
}
