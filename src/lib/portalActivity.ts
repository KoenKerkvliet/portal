import { supabase } from './supabase'

// Portaalgebruik in het beheer: zie supabase/add-portal-tracking.sql

export interface PortalEvent {
  id: string
  created_at: string
  kind: 'portal_view' | 'doc_open'
  client_id: string | null
  project_id: string | null
  path: string | null
  doc_type: string | null
  doc_id: string | null
  label: string
}

export interface DocOpens {
  last: string
  count: number
}

// "zojuist", "12 min geleden", "vandaag 14:05", "gisteren", "3 dagen geleden", "4 okt"
export function formatRelative(iso: string): string {
  const date = new Date(iso)
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return 'zojuist'
  if (minutes < 60) return `${minutes} min geleden`
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)
  if (days === 0) return `vandaag ${date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
  if (days === 1) return 'gisteren'
  if (days < 7) return `${days} dagen geleden`
  return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined })
}

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

// Hoe vaak en wanneer het laatst documenten zijn geopend (via de mail of in het portaal)
export async function fetchDocOpens(docType: string, ids: string[]): Promise<Record<string, DocOpens>> {
  if (ids.length === 0) return {}
  const { data } = await supabase
    .from('portal_events')
    .select('doc_id, created_at')
    .eq('kind', 'doc_open')
    .eq('doc_type', docType)
    .in('doc_id', ids)
    .order('created_at', { ascending: false })
  const result: Record<string, DocOpens> = {}
  for (const row of (data || []) as { doc_id: string; created_at: string }[]) {
    const entry = result[row.doc_id]
    if (entry) entry.count += 1
    else result[row.doc_id] = { last: row.created_at, count: 1 }
  }
  return result
}

// Leesbare naam voor een pagina in het klantportaal
export function portalPageLabel(path: string | null): string {
  const p = path || '/'
  if (p === '/') return 'Overzicht'
  if (p.startsWith('/support')) return 'Support'
  if (p.startsWith('/strippenkaart')) return 'Strippen kopen'
  if (p.startsWith('/bestanden')) return 'Bestanden'
  if (p.startsWith('/instellingen')) return 'Instellingen'
  if (p.startsWith('/voorwaarden')) return 'Voorwaarden'
  if (p.startsWith('/formulier')) return 'Vragenlijst'
  if (p.startsWith('/opdracht')) return 'Opdracht'
  if (p.startsWith('/design') || p.startsWith('/styleguide')) return 'Ontwerp'
  if (p.startsWith('/content')) return 'Informatiepagina'
  if (p.startsWith('/kennisbank')) return 'Kennisbank'
  return p
}
