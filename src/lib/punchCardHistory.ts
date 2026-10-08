import type { PunchCardUse } from '../types'

export interface HistoryEntry {
  key: string
  used_at: string
  description: string
  strips: number
  minutes: number
  cardIds: string[]
}

// Eén tijdregistratie schrijft per strip een rij weg; voeg die samen tot één regel
export function groupUses(uses: PunchCardUse[]): HistoryEntry[] {
  const entries = new Map<string, HistoryEntry>()
  for (const use of uses) {
    const key = `${use.used_at}|${use.description}`
    const entry = entries.get(key)
    if (entry) {
      entry.strips += 1
      entry.minutes += use.duration_minutes || 0
      if (!entry.cardIds.includes(use.punch_card_id)) entry.cardIds.push(use.punch_card_id)
    } else {
      entries.set(key, {
        key,
        used_at: use.used_at,
        description: use.description,
        strips: 1,
        minutes: use.duration_minutes || 0,
        cardIds: [use.punch_card_id],
      })
    }
  }
  return [...entries.values()].sort((a, b) => b.used_at.localeCompare(a.used_at))
}
