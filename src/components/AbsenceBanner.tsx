import { useEffect, useState } from 'react'
import { CalendarOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { absenceHeadline, absenceState, visibleAbsence, type Absence } from '../lib/absence'

// Melding over afwezigheid, voor klanten. Leest alleen huidige en komende periodes
// (database staat dat ook zonder login toe) en verschijnt vanaf 14 dagen voor de start.
export default function AbsenceBanner({ width = 'max-w-5xl' }: { width?: string }) {
  const [absence, setAbsence] = useState<Absence | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('absences').select('*').order('starts_on').limit(10)
      setAbsence(visibleAbsence((data || []) as Absence[]))
    }
    load()
  }, [])

  if (!absence) return null
  const active = absenceState(absence) === 'active'

  return (
    <div className={`border-b ${active ? 'bg-amber-50 border-amber-200' : 'bg-primary/5 border-primary/10'}`} role="status">
      <div className={`${width} mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-start gap-2.5 text-sm`}>
        <CalendarOff className={`w-4 h-4 flex-shrink-0 mt-0.5 ${active ? 'text-amber-600' : 'text-primary'}`} />
        <p className={active ? 'text-amber-900' : 'text-gray-700'}>
          <strong className="font-semibold">{absenceHeadline(absence)}</strong>
          {absence.message && <> {absence.message}</>}
          {absence.emergency && <> <span className="whitespace-nowrap">Spoed?</span> {absence.emergency}</>}
        </p>
      </div>
    </div>
  )
}
