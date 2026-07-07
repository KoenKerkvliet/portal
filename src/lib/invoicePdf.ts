// Genereert de factuur-PDF (vector-tekst via jsPDF, geen html2canvas).
// Gedeeld tussen de klant-download (InvoicePage.tsx) en de admin "Versturen"-
// actie (Invoices.tsx), zodat beide exact dezelfde lay-out opleveren.

import type { Invoice, InvoiceSettings, QuoteItem } from '../types'

function htmlToPlainText(html: string): string {
  let text = html
  text = text.replace(/<li[^>]*>/gi, '• ')
  text = text.replace(/<\/li>/gi, '\n')
  text = text.replace(/<\/p>/gi, '\n')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/h[1-6]>/gi, '\n')
  text = text.replace(/<\/div>/gi, '\n')
  text = text.replace(/<[^>]*>/g, '')
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&euro;/g, '€').replace(/&middot;/g, '·')
  text = text.replace(/\n{3,}/g, '\n\n').trim()
  return text
}

export async function generateInvoicePdfDoc(
  invoice: Invoice,
  settings: InvoiceSettings | null,
  clientNameFallback: string,
) {
  const s = settings || {
    company_name: '', address_line1: '', address_line2: '',
    postal_code: '', city: '', country: '', iban: '',
    btw_number: '', kvk_number: '', kor_enabled: false,
  } as Partial<InvoiceSettings>

  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  let y = 25

  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40, 40, 40)
  doc.text(s.company_name || 'DesignPixels', margin, y)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  const companyLines = [
    s.address_line1,
    s.address_line2,
    `${s.postal_code || ''} ${s.city || ''}`.trim(),
    s.country,
    s.kvk_number ? `KVK: ${s.kvk_number}` : '',
    !s.kor_enabled && s.btw_number ? `BTW: ${s.btw_number}` : '',
    s.iban ? `IBAN: ${s.iban}` : '',
  ].filter((l): l is string => Boolean(l))
  companyLines.forEach((line, i) => {
    doc.text(line, pageWidth - margin, 20 + i * 4, { align: 'right' })
  })

  y += 15

  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(158, 134, 255)
  doc.text('FACTUUR', margin, y)
  y += 10

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text(`Factuurnummer: ${invoice.number}`, margin, y)
  y += 5
  const invoiceDate = invoice.invoice_date || invoice.created_at
  doc.text(`Datum: ${new Date(invoiceDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, y)
  y += 5
  if (invoice.due_date) {
    doc.text(`Vervaldatum: ${new Date(invoice.due_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, y)
    y += 5
  }

  if (invoice.client_name || clientNameFallback) {
    doc.text(`Aan: ${invoice.client_name || clientNameFallback}`, margin, y)
    y += 5
  }
  if (invoice.client_address) {
    const addrLines = invoice.client_address.split('\n')
    addrLines.forEach((line) => {
      doc.text(line, margin, y)
      y += 5
    })
  }

  y += 5
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(120, 120, 120)
  doc.text('OMSCHRIJVING', margin, y)
  doc.text('AANTAL', pageWidth - margin - 70, y, { align: 'right' })
  doc.text('PRIJS', pageWidth - margin - 35, y, { align: 'right' })
  doc.text('TOTAAL', pageWidth - margin, y, { align: 'right' })
  y += 3

  doc.setDrawColor(230, 230, 230)
  doc.line(margin, y, pageWidth - margin, y)
  y += 5

  const items = (invoice.items || []) as QuoteItem[]
  items.forEach((item) => {
    if (y > 270) { doc.addPage(); y = 25 }

    if (item.type === 'divider') {
      doc.setDrawColor(230, 230, 230)
      doc.line(margin, y, pageWidth - margin, y)
      y += 6
    } else if (item.type === 'title') {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(40, 40, 40)
      doc.text(item.title || '', margin, y)
      y += 7
    } else if (item.type === 'product') {
      const lineTotal = (item.quantity || 0) * (item.price || 0)

      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(40, 40, 40)
      doc.text(item.name || '', margin, y)
      doc.setFont('helvetica', 'normal')
      doc.text(`${item.quantity} ${item.unit}`, pageWidth - margin - 70, y, { align: 'right' })
      doc.text(`€ ${(item.price || 0).toFixed(2)}`, pageWidth - margin - 35, y, { align: 'right' })
      doc.setFont('helvetica', 'bold')
      doc.text(`€ ${lineTotal.toFixed(2)}`, pageWidth - margin, y, { align: 'right' })
      y += 5

      if (item.description) {
        const plainDesc = htmlToPlainText(item.description)
        if (plainDesc) {
          doc.setFontSize(7.5)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(120, 120, 120)
          const paragraphs = plainDesc.split('\n')
          for (const para of paragraphs) {
            if (!para.trim()) { y += 1.5; continue }
            const wrapped = doc.splitTextToSize(para, contentWidth - 80)
            for (const wline of wrapped) {
              if (y > 270) { doc.addPage(); y = 25 }
              doc.text(wline, margin, y)
              y += 3
            }
          }
        }
      }

      if (item.is_recurring) {
        doc.setFontSize(7)
        doc.setTextColor(59, 130, 246)
        doc.text('Jaarlijks terugkerend', margin, y)
        y += 4
      }

      y += 3
    }
  })

  y += 3
  doc.setDrawColor(220, 220, 220)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  const subtotal = items.filter(i => i.type === 'product').reduce((sum, i) => sum + (i.quantity || 0) * (i.price || 0), 0)
  const discountAmount = subtotal * ((invoice.discount_percent || 0) / 100)
  const afterDiscount = subtotal - discountAmount
  const btwAmount = afterDiscount * ((invoice.btw_percent || 0) / 100)
  const total = afterDiscount + btwAmount

  const totalsX = pageWidth - margin - 60
  const valuesX = pageWidth - margin

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text('Subtotaal:', totalsX, y, { align: 'right' })
  doc.setTextColor(40, 40, 40)
  doc.text(`€ ${subtotal.toFixed(2)}`, valuesX, y, { align: 'right' })
  y += 6

  if (invoice.discount_percent > 0) {
    doc.setTextColor(100, 100, 100)
    doc.text(`Korting (${invoice.discount_percent}%):`, totalsX, y, { align: 'right' })
    doc.setTextColor(220, 38, 38)
    doc.text(`- € ${discountAmount.toFixed(2)}`, valuesX, y, { align: 'right' })
    y += 6
  }

  if (!s.kor_enabled && invoice.btw_percent > 0) {
    doc.setTextColor(100, 100, 100)
    doc.text(`BTW (${invoice.btw_percent}%):`, totalsX, y, { align: 'right' })
    doc.setTextColor(40, 40, 40)
    doc.text(`€ ${btwAmount.toFixed(2)}`, valuesX, y, { align: 'right' })
    y += 6
  }

  doc.setDrawColor(158, 134, 255)
  doc.setLineWidth(0.5)
  doc.line(totalsX - 20, y, pageWidth - margin, y)
  y += 6

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 100, 100)
  doc.text('Totaal:', totalsX, y, { align: 'right' })
  doc.setTextColor(158, 134, 255)
  doc.text(`€ ${total.toFixed(2)}`, valuesX, y, { align: 'right' })

  if (invoice.notes) {
    y += 15
    if (y > 260) { doc.addPage(); y = 25 }
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 100, 100)
    doc.text('Opmerkingen:', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    const noteLines = doc.splitTextToSize(invoice.notes, contentWidth)
    doc.text(noteLines, margin, y)
  }

  if (s.iban && invoice.status !== 'paid') {
    y += 15
    if (y > 260) { doc.addPage(); y = 25 }
    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
    doc.text(`Gelieve het bedrag over te maken naar: ${s.iban}`, margin, y)
    y += 5
    doc.text(`o.v.v. factuurnummer ${invoice.number}`, margin, y)
  }

  if (s.kor_enabled) {
    y += 12
    if (y > 270) { doc.addPage(); y = 25 }
    doc.setFontSize(7)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(140, 140, 140)
    doc.text('Op grond van de Kleineondernemersregeling (KOR) is er geen BTW verschuldigd.', margin, y)
  }

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(180, 180, 180)
    doc.text(`${s.company_name || 'DesignPixels'} — Factuur ${invoice.number}`, margin, 290)
    doc.text(`Pagina ${i} van ${pageCount}`, pageWidth - margin, 290, { align: 'right' })
  }

  return doc
}
