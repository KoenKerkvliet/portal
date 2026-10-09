// Links zonder inloggen naar een offerte, factuur of opdracht (zie Edge Function
// public-document). De geheime code wordt bij de eerste mail aangemaakt en daarna
// hergebruikt, zodat eerder verstuurde links blijven werken.
// Vereist een Supabase-client met service_role (de database laat alleen admin en
// service_role de code zetten).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PORTAL_URL = 'https://portal.designpixels.nl'

const PATHS = {
  quotes: 'offerte',
  invoices: 'factuur',
  assignments: 'opdracht',
  project_phases: 'design', // de Design-fase van een domein
  form_submissions: 'vragenlijst', // een vragenlijst (formulier) voor een domein
} as const

export type PublicDocTable = keyof typeof PATHS

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export async function ensurePublicToken(db: SupabaseClient, table: PublicDocTable, id: string): Promise<string> {
  const { data: current, error } = await db.from(table).select('public_token').eq('id', id).single()
  if (error) throw new Error(`Publieke link ophalen mislukt: ${error.message}`)
  if (current?.public_token) return current.public_token as string

  // Alleen zetten als er nog geen code is; bij een gelijktijdige aanroep wint de eerste
  const token = newToken()
  const { data: updated, error: updateError } = await db
    .from(table)
    .update({ public_token: token })
    .eq('id', id)
    .is('public_token', null)
    .select('public_token')
  if (updateError) throw new Error(`Publieke link aanmaken mislukt: ${updateError.message}`)
  if (updated && updated.length > 0) return token

  const { data: again } = await db.from(table).select('public_token').eq('id', id).single()
  if (!again?.public_token) throw new Error('Publieke link aanmaken mislukt')
  return again.public_token as string
}

export async function publicDocumentUrl(db: SupabaseClient, table: PublicDocTable, id: string): Promise<string> {
  const token = await ensurePublicToken(db, table, id)
  return `${PORTAL_URL}/d/${PATHS[table]}/${token}`
}
