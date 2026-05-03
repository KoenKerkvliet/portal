// Helpers voor de Financiën-export (ZIP met CSV's, PDF, samenvatting en bonnen).

import jsPDF from 'jspdf'
import type { BankTransaction, Expense, Invoice, ExpenseAttachment } from '../types'

// ---- CSV ----------------------------------------------------------------

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function csvLine(values: unknown[]): string {
  return values.map(csvEscape).join(';')
}

function nlDate(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function nlMoney(n: number): string {
  return Number(n).toFixed(2).replace('.', ',')
}

const CATEGORY_LABELS: Record<string, string> = {
  private_deposit: 'Privé inleg',
  private_withdrawal: 'Privé opname',
  private_purchase: 'Privé aankoop',
  interest: 'Rente',
}

const isPrivateCat = (c: string | null) =>
  c === 'private_deposit' || c === 'private_withdrawal' || c === 'private_purchase'

export function generateTransactionsCsv(
  txs: BankTransaction[],
  invoiceById: Map<string, Invoice>,
  expenseById: Map<string, Expense>,
): string {
  const lines: string[] = []
  lines.push(csvLine([
    'Datum', 'Tegenpartij', 'IBAN', 'Omschrijving',
    'Bedrag', 'Valuta', 'Type betaling', 'Koppeling',
  ]))
  for (const t of txs) {
    let koppeling = ''
    if (t.invoice_id) {
      const inv = invoiceById.get(t.invoice_id)
      koppeling = `Factuur ${inv?.number ?? t.invoice_id}`
    } else if (t.expense_id) {
      const ex = expenseById.get(t.expense_id)
      koppeling = `Kost: ${ex?.vendor ?? ex?.description ?? t.expense_id}`
    } else if (t.category) {
      koppeling = CATEGORY_LABELS[t.category] ?? t.category
    }
    lines.push(csvLine([
      nlDate(t.booked_at),
      t.counterparty_name ?? '',
      t.counterparty_iban ?? '',
      t.description,
      nlMoney(Number(t.amount)),
      t.currency,
      t.payment_type ?? '',
      koppeling,
    ]))
  }
  return lines.join('\n')
}

export function generateExpensesCsv(expenses: Expense[]): string {
  const lines: string[] = []
  lines.push(csvLine([
    'Datum', 'Leverancier', 'Omschrijving', 'Categorie',
    'Excl. BTW', 'BTW%', 'BTW', 'Totaal', 'Valuta',
    'Factuurnummer', 'Notities',
  ]))
  for (const e of expenses) {
    lines.push(csvLine([
      nlDate(e.expense_date),
      e.vendor ?? '',
      e.description,
      e.category ?? '',
      nlMoney(Number(e.amount_excl_btw)),
      Number(e.btw_percent),
      nlMoney(Number(e.btw_amount)),
      nlMoney(Number(e.amount_incl_btw)),
      e.currency,
      e.invoice_number ?? '',
      e.notes ?? '',
    ]))
  }
  return lines.join('\n')
}

// ---- Samenvatting -------------------------------------------------------

export function generateSummaryText(opts: {
  txs: BankTransaction[]
  expenses: Expense[]
  dateFrom: string
  dateTo: string
}): string {
  const { txs, expenses, dateFrom, dateTo } = opts

  // Privé-transacties tellen niet mee in totalen
  const business = txs.filter((t) => !isPrivateCat(t.category))
  let income = 0, expense = 0
  for (const t of business) {
    if (t.amount >= 0) income += Number(t.amount)
    else expense += Math.abs(Number(t.amount))
  }
  const balance = income - expense

  const totalKosten = expenses.reduce((s, e) => s + Number(e.amount_incl_btw), 0)

  const out: string[] = []
  out.push('Financieel overzicht')
  out.push('=========================')
  out.push(`Periode: ${nlDate(dateFrom)} t/m ${nlDate(dateTo)}`)
  out.push(`Gegenereerd: ${new Date().toLocaleString('nl-NL', { dateStyle: 'full', timeStyle: 'short' })}`)
  out.push('')
  out.push('Banktransacties (privé uitgesloten):')
  out.push(`  Aantal:      ${business.length}`)
  out.push(`  Inkomsten:   € ${nlMoney(income)}`)
  out.push(`  Uitgaven:    € ${nlMoney(expense)}`)
  out.push(`  Saldo:       € ${nlMoney(balance)}`)
  out.push('')
  out.push('Kosten (geadministreerd):')
  out.push(`  Aantal:      ${expenses.length}`)
  out.push(`  Totaal incl: € ${nlMoney(totalKosten)}`)
  out.push('')
  return out.join('\n')
}

// ---- PDF ----------------------------------------------------------------

const PAGE_MARGIN = 14 // mm
const LINE_HEIGHT = 5

function formatPeriod(from: string, to: string): string {
  return `${nlDate(from)} t/m ${nlDate(to)}`
}

export function generatePdfReport(opts: {
  txs: BankTransaction[]
  expenses: Expense[]
  invoiceById: Map<string, Invoice>
  expenseById: Map<string, Expense>
  dateFrom: string
  dateTo: string
}): Blob {
  const { txs, expenses, invoiceById, expenseById, dateFrom, dateTo } = opts
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - 2 * PAGE_MARGIN

  let y = PAGE_MARGIN

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - PAGE_MARGIN) {
      doc.addPage()
      y = PAGE_MARGIN
    }
  }

  // ---- Header ----
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Financieel overzicht', PAGE_MARGIN, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(`Periode: ${formatPeriod(dateFrom, dateTo)}`, PAGE_MARGIN, y)
  y += 4
  doc.text(
    `Gegenereerd: ${new Date().toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short' })}`,
    PAGE_MARGIN, y,
  )
  doc.setTextColor(0)
  y += 10

  // ---- Samenvatting ----
  const business = txs.filter((t) => !isPrivateCat(t.category))
  let income = 0, expense = 0
  for (const t of business) {
    if (t.amount >= 0) income += Number(t.amount)
    else expense += Math.abs(Number(t.amount))
  }
  const balance = income - expense

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Samenvatting', PAGE_MARGIN, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const summaryLines = [
    [`Inkomsten`, `€ ${nlMoney(income)}`],
    [`Uitgaven`, `€ ${nlMoney(expense)}`],
    [`Saldo`, `€ ${nlMoney(balance)}`],
    [`Aantal banktransacties`, String(business.length)],
    [`Aantal kosten`, String(expenses.length)],
  ]
  for (const [label, value] of summaryLines) {
    doc.text(label, PAGE_MARGIN, y)
    doc.text(value, PAGE_MARGIN + 80, y)
    y += LINE_HEIGHT
  }
  y += 4
  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text('Privé-transacties zijn uitgesloten van de totalen.', PAGE_MARGIN, y)
  doc.setTextColor(0)
  y += 8

  // ---- Tabel: Banktransacties ----
  if (txs.length > 0) {
    ensureSpace(20)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(`Banktransacties (${txs.length})`, PAGE_MARGIN, y)
    y += 5
    doc.setFontSize(8)

    const txCols = [
      { label: 'Datum', w: 22 },
      { label: 'Tegenpartij', w: 45 },
      { label: 'Omschrijving', w: 70 },
      { label: 'Bedrag', w: 22, align: 'right' as const },
      { label: 'Koppeling', w: contentWidth - 22 - 45 - 70 - 22 },
    ]

    const drawTxHeader = () => {
      doc.setFont('helvetica', 'bold')
      doc.setFillColor(245, 245, 245)
      doc.rect(PAGE_MARGIN, y - 4, contentWidth, 6, 'F')
      let x = PAGE_MARGIN
      for (const col of txCols) {
        doc.text(col.label, col.align === 'right' ? x + col.w - 2 : x + 1, y, col.align === 'right' ? { align: 'right' } : undefined)
        x += col.w
      }
      y += 4
      doc.setFont('helvetica', 'normal')
    }
    drawTxHeader()

    for (const t of txs) {
      ensureSpace(LINE_HEIGHT + 1)
      if (y === PAGE_MARGIN) drawTxHeader()
      let x = PAGE_MARGIN
      const valuesText = [
        nlDate(t.booked_at),
        (t.counterparty_name ?? '').slice(0, 28),
        (t.description ?? '').slice(0, 45),
        `${t.amount >= 0 ? '+' : '-'} € ${nlMoney(Math.abs(Number(t.amount)))}`,
        t.invoice_id
          ? `Fact. ${invoiceById.get(t.invoice_id)?.number ?? '?'}`
          : t.expense_id
            ? `Kost: ${(expenseById.get(t.expense_id)?.vendor ?? '?').slice(0, 18)}`
            : t.category
              ? CATEGORY_LABELS[t.category] ?? t.category
              : '',
      ]
      txCols.forEach((col, i) => {
        if (i === 3) doc.setTextColor(t.amount >= 0 ? 22 : 192, t.amount >= 0 ? 163 : 38, t.amount >= 0 ? 74 : 38)
        else doc.setTextColor(0)
        doc.text(
          valuesText[i],
          col.align === 'right' ? x + col.w - 2 : x + 1,
          y,
          col.align === 'right' ? { align: 'right' } : undefined,
        )
        x += col.w
      })
      doc.setTextColor(0)
      y += LINE_HEIGHT
    }
    y += 5
  }

  // ---- Tabel: Kosten ----
  if (expenses.length > 0) {
    ensureSpace(20)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(`Kosten (${expenses.length})`, PAGE_MARGIN, y)
    y += 5
    doc.setFontSize(8)

    const exCols = [
      { label: 'Datum', w: 22 },
      { label: 'Leverancier', w: 45 },
      { label: 'Omschrijving', w: 75 },
      { label: 'Categorie', w: contentWidth - 22 - 45 - 75 - 25 },
      { label: 'Totaal', w: 25, align: 'right' as const },
    ]

    const drawExHeader = () => {
      doc.setFont('helvetica', 'bold')
      doc.setFillColor(245, 245, 245)
      doc.rect(PAGE_MARGIN, y - 4, contentWidth, 6, 'F')
      let x = PAGE_MARGIN
      for (const col of exCols) {
        doc.text(col.label, col.align === 'right' ? x + col.w - 2 : x + 1, y, col.align === 'right' ? { align: 'right' } : undefined)
        x += col.w
      }
      y += 4
      doc.setFont('helvetica', 'normal')
    }
    drawExHeader()

    for (const e of expenses) {
      ensureSpace(LINE_HEIGHT + 1)
      if (y === PAGE_MARGIN) drawExHeader()
      let x = PAGE_MARGIN
      const valuesText = [
        nlDate(e.expense_date),
        (e.vendor ?? '').slice(0, 28),
        (e.description ?? '').slice(0, 48),
        (e.category ?? '').slice(0, 18),
        `€ ${nlMoney(Number(e.amount_incl_btw))}`,
      ]
      exCols.forEach((col, i) => {
        doc.text(
          valuesText[i],
          col.align === 'right' ? x + col.w - 2 : x + 1,
          y,
          col.align === 'right' ? { align: 'right' } : undefined,
        )
        x += col.w
      })
      y += LINE_HEIGHT
    }
  }

  // Page numbers
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(140)
    doc.text(
      `Pagina ${i} van ${pageCount}`,
      pageWidth - PAGE_MARGIN,
      pageHeight - 8,
      { align: 'right' },
    )
    doc.setTextColor(0)
  }

  return doc.output('blob')
}

// ---- Bijlages -----------------------------------------------------------

function safeFs(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()
}

export function buildAttachmentFilename(
  expense: Expense,
  att: ExpenseAttachment,
  duplicateIndex = 0,
): string {
  const datePart = expense.expense_date
  const vendor = safeFs(expense.vendor ?? 'leverancier')
  const desc = safeFs((expense.description ?? '').slice(0, 40))
  const ext = att.filename.includes('.') ? att.filename.split('.').pop() : 'bin'
  const suffix = duplicateIndex > 0 ? `_${duplicateIndex + 1}` : ''
  return `${datePart}_${vendor}_${desc}${suffix}.${ext}`
}
