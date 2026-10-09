// Afwezigheid (tabel absences): beheerd op het admin-dashboard, getoond aan klanten
// vanaf ANNOUNCE_DAYS voor de start tot en met de laatste dag.

export interface Absence {
  id: string
  starts_on: string // YYYY-MM-DD, eerste dag
  ends_on: string // YYYY-MM-DD, laatste dag (inclusief)
  message: string // reden die de zin aanvult: "Ik ben <reden> tot en met …", bijv. "op vakantie"
  emergency: string
  created_at: string
}

export const ANNOUNCE_DAYS = 14

const toDate = (ymd: string) => new Date(`${ymd}T12:00:00`)

const todayYmd = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const addDays = (ymd: string, days: number) => {
  const d = toDate(ymd)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const formatAbsenceDay = (ymd: string) =>
  toDate(ymd).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })

export type AbsenceState = 'active' | 'announced' | 'later' | 'past'

export function absenceState(a: Absence, today = todayYmd()): AbsenceState {
  if (a.ends_on < today) return 'past'
  if (a.starts_on <= today) return 'active'
  if (addDays(a.starts_on, -ANNOUNCE_DAYS) <= today) return 'announced'
  return 'later'
}

// De afwezigheid die klanten nu moeten zien (lopend, of binnen 14 dagen), of null
export function visibleAbsence(absences: Absence[], today = todayYmd()): Absence | null {
  return [...absences]
    .sort((x, y) => x.starts_on.localeCompare(y.starts_on))
    .find(a => ['active', 'announced'].includes(absenceState(a, today))) || null
}

export const ABSENCE_REASONS = ['op vakantie', 'vrij', 'met verlof', 'op cursus']

// Reden als deel van de zin: zonder hoofdletter en punt aan het eind; leeg = "afwezig"
export const absenceReason = (a: Pick<Absence, 'message'>) => {
  const r = a.message.trim().replace(/[.!]+$/, '')
  return r ? r.charAt(0).toLowerCase() + r.slice(1) : 'afwezig'
}

// Hoofdzin van de melding, in de ik-vorm, met de reden in de zin
export function absenceHeadline(a: Absence, today = todayYmd()): string {
  const sameDay = a.starts_on === a.ends_on
  const reason = absenceReason(a)
  if (absenceState(a, today) === 'active') {
    return sameDay ? `Ik ben vandaag ${reason}.` : `Ik ben ${reason} tot en met ${formatAbsenceDay(a.ends_on)}.`
  }
  return sameDay
    ? `Let op: op ${formatAbsenceDay(a.starts_on)} ben ik ${reason}.`
    : `Let op: van ${formatAbsenceDay(a.starts_on)} tot en met ${formatAbsenceDay(a.ends_on)} ben ik ${reason}.`
}

// Spoedregeling als losse vraag-en-antwoordzin
export const absenceEmergencyText = (a: Pick<Absence, 'emergency'>) =>
  a.emergency.trim() ? `Heb je spoed? ${a.emergency.trim()}` : ''
