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
  tweede_mail: { label: 'Tweede mail gestuurd', badge: 'bg-sky-100 text-sky-800' },
  in_beraad: { label: 'In beraad bij hen', badge: 'bg-indigo-50 text-indigo-700' },
  nog_opvolgen: { label: 'Nog opvolgen', badge: 'bg-amber-50 text-amber-700' },
  niet_interessant: { label: 'Niet interessant', badge: 'bg-red-50 text-red-700' },
}

export const STATUS_ORDER: LeadStatus[] = [
  'nieuw',
  'interessant',
  'contact_gelegd',
  'mail_gestuurd',
  'tweede_mail',
  'in_beraad',
  'nog_opvolgen',
  'niet_interessant',
]

export const todayISO = () => new Date().toISOString().slice(0, 10)

// Datum (YYYY-MM-DD) een aantal werkdagen of kalenderdagen na vandaag
export function addWorkdays(n: number, from = new Date()): string {
  const d = new Date(from)
  let added = 0
  while (added < n) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) added++
  }
  return d.toLocaleDateString('en-CA')
}

export function addDays(n: number, from = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}

// Wat er automatisch meeverandert als je de status van een lead aanpast: laatst contact,
// de volgende opvolgdatum en (voor het resultaatoverzicht) eerste contact en reactie.
// Je kunt de datums daarna gewoon met de hand aanpassen.
export function statusChangePatch(lead: Pick<Lead, 'first_contacted_at' | 'replied_at' | 'follow_up_at'>, status: LeadStatus): Partial<Lead> {
  const today = new Date().toLocaleDateString('en-CA')
  const firstContact = lead.first_contacted_at ? {} : { first_contacted_at: today }
  switch (status) {
    case 'mail_gestuurd':
      return { ...firstContact, last_contact_at: today, follow_up_at: addWorkdays(5) }
    case 'tweede_mail':
      return { ...firstContact, last_contact_at: today, follow_up_at: addWorkdays(10) }
    case 'contact_gelegd':
      return { ...firstContact, last_contact_at: today, follow_up_at: addWorkdays(5) }
    case 'in_beraad':
      // Verenigingen beslissen in een bestuursvergadering: na een maand pas weer navragen
      return { ...firstContact, replied_at: lead.replied_at ?? today, last_contact_at: today, follow_up_at: addDays(28) }
    case 'nog_opvolgen':
      return { follow_up_at: lead.follow_up_at ?? today }
    case 'niet_interessant':
      return { follow_up_at: null }
    default:
      return {}
  }
}

/** Benaderd -> reactie -> klant, over alle leads of vanaf een datum (YYYY-MM-DD). */
export function leadFunnel(leads: Pick<Lead, 'first_contacted_at' | 'replied_at' | 'client_id'>[], since?: string) {
  const contacted = leads.filter((l) => l.first_contacted_at && (!since || l.first_contacted_at >= since))
  return {
    contacted: contacted.length,
    replied: contacted.filter((l) => l.replied_at || l.client_id).length,
    clients: contacted.filter((l) => l.client_id).length,
  }
}

export const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–')

export const formatDate = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export const formatScanned = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Nooit'

// Volgorde waarin statussen bovenaan komen bij sorteren op opvolging:
// waar iets loopt eerst, de onaangeroerde voorraad daaronder, afgeschreven
// leads onderaan.
export const STATUS_SORT_ORDER: LeadStatus[] = [
  'in_beraad',        // zij beslissen, hier wil je bovenop zitten
  'tweede_mail',      // laatste poging loopt: binnenkort doorhakken
  'mail_gestuurd',    // jij wacht op antwoord
  'contact_gelegd',
  'nog_opvolgen',
  'interessant',      // wel gemarkeerd, nog niets mee gedaan
  'nieuw',            // de voorraad
  'niet_interessant', // altijd onderaan
]

export type LeadSortMode = 'opvolging' | 'kans'

export const SORT_MODES: Record<LeadSortMode, { label: string; hint: string }> = {
  opvolging: {
    label: 'Opvolging eerst',
    hint: 'Lopende gesprekken bovenaan, daaronder de voorraad op kans gesorteerd',
  },
  kans: {
    label: 'Beste kans eerst',
    hint: 'Geen website en alleen social bovenaan, ongeacht de status',
  },
}

// Een status die (nog) niet in de volgorde staat hoort onderaan, niet bovenaan
// — wat indexOf met zijn -1 wel zou doen.
const statusRank = (status: LeadStatus) => {
  const index = STATUS_SORT_ORDER.indexOf(status)
  return index === -1 ? STATUS_SORT_ORDER.length : index
}

/** Sorteersleutel per modus; lager is hoger in de lijst. */
const leadSortKey = (lead: Lead, mode: LeadSortMode): number[] => {
  const kans = [PRIORITY_ORDER.indexOf(lead.priority ?? 'ok'), lead.score ?? 0]
  return mode === 'opvolging'
    ? [statusRank(lead.status), ...kans]
    // Ook hier zakken afgeschreven leads naar de onderkant.
    : [lead.status === 'niet_interessant' ? 1 : 0, ...kans]
}

/** Vergelijker voor Array.sort; bij gelijke sleutel op naam. */
export const makeLeadComparator = (mode: LeadSortMode) => (a: Lead, b: Lead) => {
  const ka = leadSortKey(a, mode)
  const kb = leadSortKey(b, mode)
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

// Standaardtekst voor de redesignpagina van een lead; per lead aan te passen
export const redesignDefaultTitle = (name: string) => `Een nieuwe website voor ${name}`
export const REDESIGN_DEFAULT_INTRO =
  'Ik heb alvast uitgewerkt hoe je nieuwe website eruit zou kunnen zien. In het scherm zie je de homepage, ' +
  'daaronder staat het volledige ontwerp. Helemaal vrijblijvend: gewoon om te laten zien wat er mogelijk is.'

export const REDESIGN_URL = 'https://portal.designpixels.nl/r'

// Leesbare, korte code voor de link: naam van de lead + 10 willekeurige tekens
// (31^10 mogelijkheden, dus niet te raden). Zonder makkelijk te verwarren tekens (0/o, 1/l/i).
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export function newRedesignToken(name: string): string {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/, '') || 'redesign'
  const code = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
  return `${slug}-${code}`
}

// De eerste versie van de pagina gebruikte een lange code van 48 tekens
export const isLongRedesignToken = (token: string) => /^[0-9a-f]{48}$/.test(token)
