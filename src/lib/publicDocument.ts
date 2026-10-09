import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { InvoiceSettings, QuoteAttachment } from '../types'

// Offerte/factuur/opdracht via de geheime code uit de mail (Edge Function public-document)
export type PublicDocType = 'quote' | 'invoice' | 'assignment' | 'design' | 'form'

export interface PublicDocumentResult<T> {
  success: true
  document: T
  project_name: string
  client_name: string
  client_company: string
  settings: InvoiceSettings | null
  attachments: QuoteAttachment[]
}

export async function callPublicDocument<T>(body: { action: string; type: PublicDocType; token: string } & Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('public-document', { body })
  if (error) {
    let message = 'Er ging iets mis. Probeer het later opnieuw.'
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = await error.context.json()
        if (payload?.error) message = payload.error
      } catch { /* standaardmelding */ }
    }
    throw new Error(message)
  }
  return data as T
}
