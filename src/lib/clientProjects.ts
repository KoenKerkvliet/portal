import { supabase } from './supabase'

// Vindt de client-record en alle gekoppelde project-IDs voor een ingelogde klant.
// Combineert project_clients (multi-client domeinen) met projects.client_id (de
// "primary"-pointer). Voorkomt dat secundaire klanten geen project zien op het portal.
export async function getClientAndProjectIds(profileId: string): Promise<{
  clientId: string | null
  projectIds: string[]
}> {
  const { data: client } = await supabase
    .from('clients').select('id').eq('profile_id', profileId).single()
  if (!client) return { clientId: null, projectIds: [] }

  const [{ data: pcRows }, { data: primaryRows }] = await Promise.all([
    supabase.from('project_clients').select('project_id').eq('client_id', client.id),
    supabase.from('projects').select('id').eq('client_id', client.id),
  ])
  const ids = Array.from(new Set([
    ...(pcRows || []).map((r) => r.project_id as string),
    ...(primaryRows || []).map((r) => r.id as string),
  ]))
  return { clientId: client.id, projectIds: ids }
}
