import type { SectionTab } from '../components/SectionTabs'

// Menu-items in het beheer die uit meerdere pagina's bestaan, elk als tabblad
export const SUPPORT_TABS: SectionTab[] = [
  { to: '/admin/tickets', label: 'Tickets' },
  { to: '/admin/chatgesprekken', label: 'Chatgesprekken' },
]

export const MAINTENANCE_TABS: SectionTab[] = [
  { to: '/admin/onderhoud', label: 'Strippenkaarten' },
  { to: '/admin/werkzaamheden', label: 'Werkzaamheden' },
]

export const LIBRARY_TABS: SectionTab[] = [
  { to: '/admin/templates', label: 'Templates' },
  { to: '/admin/formulieren', label: 'Formulieren' },
  { to: '/admin/contentpaginas', label: "Contentpagina's" },
  { to: '/admin/bijlages', label: 'Bijlages' },
]
