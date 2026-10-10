import { supabase } from './supabase'

// Portaalgebruik: een ingelogde klant bekijkt een pagina of document. De database telt
// alleen klanten mee (niet de admin) en dezelfde pagina binnen 30 minuten één keer.
// Mag nooit iets laten mislukken, dus fouten worden genegeerd.
export function trackPortalView(path: string, docType?: 'quote' | 'invoice', docId?: string) {
  void supabase
    .rpc('log_portal_view', { p_path: path, p_doc_type: docType ?? null, p_doc_id: docId ?? null })
    .then(() => undefined, () => undefined)
}

// Kennisbank: telt een gelezen artikel, anoniem
export function trackArticleView(slug: string) {
  void supabase.rpc('kb_register_view', { p_slug: slug }).then(() => undefined, () => undefined)
}
