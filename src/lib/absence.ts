// Afwezigheid (tabel absences): beheerd op het admin-dashboard, getoond aan klanten
// vanaf ANNOUNCE_DAYS voor de start tot en met de laatste dag.

export interface Absence {
  id: string
  starts_on: string // YYYY-MM-DD, eerste dag
  ends_on: string // YYYY-MM-DD, laatste dag (inclusief)
  message: string
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

// Hoofdzin van de melding, in de ik-vorm
export function absenceHeadline(a: Absence, today = todayYmd()): string {
  const sameDay = a.starts_on === a.ends_on
  if (absenceState(a, today) === 'active') {
    return sameDay ? 'Ik ben vandaag afwezig.' : `Ik ben afwezig tot en met ${formatAbsenceDay(a.ends_on)}.`
  }
  return sameDay
    ? `Let op: op ${formatAbsenceDay(a.starts_on)} ben ik afwezig.`
    : `Let op: van ${formatAbsenceDay(a.starts_on)} tot en met ${formatAbsenceDay(a.ends_on)} ben ik afwezig.`
}
