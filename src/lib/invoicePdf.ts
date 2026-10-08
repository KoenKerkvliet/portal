// Genereert de factuur-PDF (vector-tekst via jsPDF, geen html2canvas).
// Gedeeld tussen de klant-download (InvoicePage.tsx) en de admin "Versturen"-
// actie (Invoices.tsx). De opmaak zelf staat in supabase/functions/_shared, zodat
// de mails vanuit de Edge Functions exact dezelfde PDF meesturen.

import type { Invoice, InvoiceSettings } from '../types'
import { drawInvoicePdf } from '../../supabase/functions/_shared/invoicePdfLayout'

export async function generateInvoicePdfDoc(
  invoice: Invoice,
  settings: InvoiceSettings | null,
  clientNameFallback: string,
) {
  const { default: jsPDF } = await import('jspdf')
  return drawInvoicePdf(new jsPDF(), invoice, settings, clientNameFallback)
}
