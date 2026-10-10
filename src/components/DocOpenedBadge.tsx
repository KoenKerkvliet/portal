import { Eye } from 'lucide-react'
import { formatDateTime, formatRelative, type DocOpens } from '../lib/portalActivity'

// Oogje bij een offerte of factuur: wanneer de klant hem voor het laatst opende
export default function DocOpenedBadge({ opens }: { opens?: DocOpens }) {
  if (!opens) return null
  return (
    <span title={`Laatst geopend op ${formatDateTime(opens.last)}${opens.count > 1 ? ` (${opens.count} keer)` : ''}`}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
      <Eye className="w-3 h-3" />
      {formatRelative(opens.last)}
    </span>
  )
}
