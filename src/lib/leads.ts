import type { Lead, LeadPriority, LeadStatus } from '../types'

// Prioriteit komt uit de scanner en is niet handmatig aan te passen: hij wordt
// bij elke scan opnieuw bepaald. De volgorde hieronder is ook de sorteervolgorde
// in het overzicht — de beste kansen bovenaan.
export const PRIORITIES: Record<LeadPriority, { label: string; short: string; dot: string; badge: string }> = {
  geen_site: {
    label: 'Geen website',
    short: 'Geen site',
    dot: 'bg-gray-400',
    badge: 'bg-gray-100 text-gray-700',
  },
  social: {
    label: 'Alleen social media',
    short: 'Alleen social',
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700',
  },
  hoog: {
    label: 'Hoog potentieel',
    short: 'Hoog',
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700',
  },
  gemiddeld: {
    label: 'Gemiddeld',
    short: 'Gemiddeld',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700',
  },
  ok: {
    label: 'Website is OK',
    short: 'OK',
    dot: 'bg-green-500',
    badge: 'bg-green-50 text-green-700',
  },
}

export const PRIORITY_ORDER: LeadPriority[] = ['geen_site', 'social', 'hoog', 'gemiddeld', 'ok']

// Status is van jou: een scan raakt deze kolom nooit aan.
export const STATUSES: Record<LeadStatus, { label: string; badge: string }> = {
  nieuw: { label: 'Nog niet benaderd', badge: 'bg-gray-100 text-gray-600' },
  interessant: { label: 'Interessant', badge: 'bg-purple-50 text-purple-700' },
  contact_gelegd: { label: 'Contact gelegd', badge: 'bg-green-50 text-green-700' },
  mail_gestuurd: { label: 'Mail gestuurd', badge: 'bg-blue-50 text-blue-700' },
  in_beraad: { label: 'In beraad bij hen', badge: 'bg-indigo-50 text-indigo-700' },
  nog_opvolgen: { label: 'Nog opvolgen', badge: 'bg-amber-50 text-amber-700' },
  niet_interessant: { label: 'Niet interessant', badge: 'bg-red-50 text-red-700' },
}

export const STATUS_ORDER: LeadStatus[] = [
  'nieuw',
  'interessant',
  'contact_gelegd',
  'mail_gestuurd',
  'in_beraad',
  'nog_opvolgen',
  'niet_interessant',
]

export const todayISO = () => new Date().toISOString().slice(0, 10)

export const formatDate = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export const formatScanned = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Nooit'

/**
 * Sorteersleutel: afgeschreven leads onderaan, daarboven de beste kansen
 * eerst, en daarbinnen de laagste score.
 */
export const leadSortKey = (lead: Lead): number[] => [
  lead.status === 'niet_interessant' ? 1 : 0,
  PRIORITY_ORDER.indexOf(lead.priority ?? 'ok'),
  lead.score ?? 0,
]

/** Vergelijkt twee leads op hun sorteersleutel; gelijk? dan op naam. */
export const compareLeads = (a: Lead, b: Lead) => {
  const ka = leadSortKey(a)
  const kb = leadSortKey(b)
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i]
  }
  return a.name.localeCompare(b.name)
}

/** Alleen de plaatsnaam uit een volledig adres, voor een compacte tabel. */
export const city = (address: string | null) => {
  if (!address) return ''
  const parts = address.split(',').map((p) => p.trim())
  const candidate = parts.length >= 2 ? parts[parts.length - 2] : parts[0]
  // "6411 HK Heerlen" -> "Heerlen"
  return candidate.replace(/^\d{4}\s?[A-Z]{2}\s+/, '')
}

/** Telefoonnummer als bel-link, spaties eruit. */
export const telHref = (phone: string | null) => (phone ? `tel:${phone.replace(/\s/g, '')}` : undefined)

export const hostname = (url: string | null) => {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
