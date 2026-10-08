// Factuur-PDF als base64 voor een mailbijlage, met dezelfde opmaak als de
// download in het portaal (zie invoicePdfLayout.ts).

import jspdfModule from 'npm:jspdf@4.2.1'
import { drawInvoicePdf, type PdfInvoice, type PdfSettings } from './invoicePdfLayout.ts'

type JsPdfInstance = Parameters<typeof drawInvoicePdf>[0] & { output(type: 'datauristring'): string }

// De Node-build van jsPDF is CommonJS: de klasse zit op .jsPDF
const JsPDF = ((jspdfModule as unknown as { jsPDF?: unknown }).jsPDF ?? jspdfModule) as new () => JsPdfInstance

export function invoicePdfBase64(invoice: PdfInvoice, settings: PdfSettings | null, clientNameFallback: string): string {
  const doc = drawInvoicePdf(new JsPDF(), invoice, settings, clientNameFallback)
  return doc.output('datauristring').split(',').pop() || ''
}

// Probeert de PDF te maken; lukt dat niet, dan gaat de mail zonder bijlage (met link)
export function tryInvoicePdfBase64(invoice: PdfInvoice, settings: PdfSettings | null, clientNameFallback: string): string | null {
  try {
    return invoicePdfBase64(invoice, settings, clientNameFallback) || null
  } catch (e) {
    console.error('[invoicePdf] PDF maken mislukt:', e instanceof Error ? e.message : String(e))
    return null
  }
}
