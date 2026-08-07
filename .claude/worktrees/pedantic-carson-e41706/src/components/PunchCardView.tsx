import { useState } from 'react'
import type { PunchCard, PunchCardUse } from '../types'
import { Gift, Check } from 'lucide-react'

interface Props {
  card: PunchCard
  uses?: PunchCardUse[]
}

export default function PunchCardView({ card, uses = [] }: Props) {
  const [expandedPunch, setExpandedPunch] = useState<number | null>(null)
  const remaining = card.total_punches - card.used_punches
  const isUsedUp = card.status === 'used_up' || remaining <= 0

  const expiresFormatted = card.expires_at
    ? new Date(card.expires_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const purchasedFormatted = new Date(card.purchased_at).toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'numeric', year: 'numeric',
  })

  // Map uses by punch_index for quick lookup
  const usesByIndex = new Map<number, PunchCardUse>()
  for (const use of uses) {
    usesByIndex.set(use.punch_index, use)
  }

  return (
    <div className={`w-full max-w-sm rounded-2xl overflow-hidden shadow-sm border ${isUsedUp ? 'bg-gray-50 border-gray-200 opacity-70' : 'bg-[#fdf9ef] border-amber-100'}`}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="w-11 h-11 rounded-xl border-2 border-purple-200 bg-purple-50 flex items-center justify-center">
          {card.is_gift ? (
            <Gift className="w-5 h-5 text-purple-500" />
          ) : (
            <span className="text-sm font-bold text-purple-600">{card.number}</span>
          )}
        </div>

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
          const use = usesByIndex.get(punchNumber)
          const isExpanded = expandedPunch === punchNumber
          const hasUse = isUsed && use

          const dateFormatted = use
            ? new Date(use.used_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()
            : null

          return (
            <div key={i}>
              <div
                onClick={hasUse ? () => setExpandedPunch(isExpanded ? null : punchNumber) : undefined}
                className={`flex items-center rounded-md px-2.5 py-1.5 transition-colors ${
                  isUsed
                    ? `bg-gray-100 ${hasUse ? 'cursor-pointer hover:bg-gray-150' : ''}`
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
                {isUsed && dateFormatted ? (
                  <div className="flex-1 flex justify-center">
                    <span
                      className="text-[10px] font-semibold text-gray-400 bg-white px-2 py-0.5 rounded shadow-sm border border-gray-100"
                      style={{
                        transform: `rotate(${((punchNumber * 7 + 3) % 11) - 5}deg) translateX(${((punchNumber * 13 + 5) % 11) - 5}px)`,
                      }}
                    >
                      {dateFormatted}
                    </span>
                  </div>
                ) : isUsed ? (
                  <div className="flex-1 h-px bg-gray-300 mx-2.5" />
                ) : null}
              </div>
              {/* Expanded description */}
              {isExpanded && use && (
                <div className="ml-8 mr-2 mt-0.5 mb-1 px-3 py-2 bg-white rounded-lg border border-gray-100 shadow-sm">
                  <p className="text-[10px] text-gray-400 mb-0.5">
                    {new Date(use.used_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                  <p className="text-xs text-gray-700">{use.description}</p>
                </div>
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
