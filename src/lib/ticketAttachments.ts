import { supabase } from './supabase'

export const TICKET_ATTACHMENT_BUCKET = 'ticket-attachments'

// De bucket is niet publiek, dus bijlages worden met een tijdelijke signed URL
// getoond. Een uur is ruim genoeg om een ticket te lezen zonder de link daarna
// nog bruikbaar te laten zijn.
const SIGNED_URL_TTL_SECONDS = 60 * 60

/**
 * Pad binnen de bucket. De eerste map is altijd het project-id: daar hangen de
 * storage-policies op (zie supabase/add-ticket-attachments-storage.sql).
 */
export function ticketAttachmentPath(projectId: string, ticketId: string | null, file: File): string {
  const rawExt = file.name.includes('.') ? file.name.split('.').pop() || '' : ''
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'jpg'
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return `${projectId}/${ticketId || 'new'}/${unique}.${ext}`
}

/**
 * Uploadt een bijlage. Geeft het storage-pad terug (dat slaan we op in
 * attachment_url) of een foutmelding die je aan de gebruiker kunt tonen.
 */
export async function uploadTicketAttachment(
  file: File,
  path: string
): Promise<{ path: string; error: null } | { path: null; error: string }> {
  const { error } = await supabase.storage
    .from(TICKET_ATTACHMENT_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' })

  if (error) {
    console.error('Ticket attachment upload failed:', error)
    return { path: null, error: `Bijlage uploaden mislukt: ${error.message}` }
  }
  return { path, error: null }
}

/**
 * Zet de opgeslagen waarde om naar een bruikbare URL. Rijen van vóór deze
 * wijziging kunnen nog een volledige URL bevatten; die geven we ongewijzigd
 * terug. Alle nieuwe rijen bevatten een storage-pad.
 */
export async function getTicketAttachmentUrl(value: string): Promise<string | null> {
  if (/^https?:\/\//i.test(value)) return value

  const { data, error } = await supabase.storage
    .from(TICKET_ATTACHMENT_BUCKET)
    .createSignedUrl(value, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    console.error('Signed URL voor ticketbijlage mislukt:', error)
    return null
  }
  return data.signedUrl
}
