// Rendert opgemaakte tekst (de HTML uit de Tiptap-editor) als echte PDF-tekst in
// een bestaand jsPDF-document. Geen html2canvas: de tekst blijft dus selecteerbaar
// en scherp, net als de rest van de offerte- en factuur-PDF's.
//
// Wordt gebruikt om content-bijlages achter de offerte te plakken, zodat de klant
// één bestand krijgt in plaats van een offerte plus losse documenten.

import type jsPDF from 'jspdf'

export interface RichTextPdfLayout {
  /** Linkermarge in mm. */
  margin: number
  /** Y-positie waarop een nieuwe pagina begint. */
  top: number
  /** Y-positie die niet overschreden mag worden voordat er een pagina bij komt. */
  bottom: number
  /** Beschikbare breedte in mm. */
  width: number
  /** Aangeroepen na elke doc.addPage(), bv. om een kop te tekenen. */
  onNewPage?: (doc: jsPDF) => void
}

interface Word {
  text: string
  bold: boolean
  italic: boolean
  /** Hoort er een spatie vóór dit woord? Leestekens volgen direct op het woord ervoor. */
  space: boolean
}

interface Collector {
  out: Word[]
  /** Stond er in de bron whitespace na het vorige stukje tekst? */
  pendingSpace: boolean
}

const BODY_SIZE = 9.5
const BODY_LINE = 4.6
const BODY_COLOR: [number, number, number] = [70, 70, 70]
const HEADING_COLOR: [number, number, number] = [40, 40, 40]
const MUTED_COLOR: [number, number, number] = [140, 140, 140]

const HEADING_SIZES: Record<string, number> = { h1: 15, h2: 12, h3: 10.5, h4: 10 }
const HEADING_SPACE_BEFORE: Record<string, number> = { h1: 4, h2: 6, h3: 5, h4: 4 }

function fontStyle(bold: boolean, italic: boolean): string {
  if (bold && italic) return 'bolditalic'
  if (bold) return 'bold'
  if (italic) return 'italic'
  return 'normal'
}

/**
 * Splitst een tekstnode in losse woorden met de opmaak die op dat moment geldt.
 * De spatiëring uit de bron blijft bewaard, zodat "<strong>jaar</strong>, verder"
 * niet als "jaar , verder" in de PDF belandt.
 */
function collectWords(node: Node, bold: boolean, italic: boolean, c: Collector): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const raw = (node.textContent || '').replace(/\s+/g, ' ')
    if (!raw) return
    if (!raw.trim()) {
      if (c.out.length > 0) c.pendingSpace = true
      return
    }

    if (raw.startsWith(' ')) c.pendingSpace = true
    const parts = raw.trim().split(' ').filter(Boolean)
    parts.forEach((text, i) => {
      c.out.push({
        text,
        bold,
        italic,
        space: i === 0 ? c.pendingSpace && c.out.length > 0 : true,
      })
    })
    c.pendingSpace = raw.endsWith(' ')
    return
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return
  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()

  if (tag === 'br') {
    c.out.push({ text: '\n', bold, italic, space: false })
    c.pendingSpace = false
    return
  }

  const nextBold = bold || tag === 'strong' || tag === 'b'
  const nextItalic = italic || tag === 'em' || tag === 'i'
  el.childNodes.forEach((child) => collectWords(child, nextBold, nextItalic, c))
}

function wordsOf(el: HTMLElement): Word[] {
  const c: Collector = { out: [], pendingSpace: false }
  el.childNodes.forEach((child) => collectWords(child, false, false, c))
  if (c.out.length > 0) c.out[0].space = false
  return c.out
}

/**
 * Tekent woorden met automatische regelafbreking en paginabreuken.
 * Geeft de nieuwe y-positie terug.
 */
function drawWords(
  doc: jsPDF,
  words: Word[],
  x: number,
  maxWidth: number,
  size: number,
  lineHeight: number,
  y: number,
  layout: RichTextPdfLayout,
): number {
  if (words.length === 0) return y

  doc.setFontSize(size)
  const spaceWidth = (): number => {
    doc.setFont('helvetica', 'normal')
    return doc.getTextWidth(' ')
  }

  let line: Word[] = []
  let lineWidth = 0

  const flush = (): void => {
    if (line.length === 0) return
    if (y + lineHeight > layout.bottom) {
      doc.addPage()
      y = layout.top
      layout.onNewPage?.(doc)
      doc.setFontSize(size)
    }
    let cursor = x
    line.forEach((word, i) => {
      if (i > 0 && word.space) cursor += spaceWidth()
      doc.setFont('helvetica', fontStyle(word.bold, word.italic))
      doc.setFontSize(size)
      doc.text(word.text, cursor, y)
      cursor += doc.getTextWidth(word.text)
    })
    y += lineHeight
    line = []
    lineWidth = 0
  }

  for (const word of words) {
    if (word.text === '\n') {
      flush()
      continue
    }
    doc.setFont('helvetica', fontStyle(word.bold, word.italic))
    doc.setFontSize(size)
    const width = doc.getTextWidth(word.text)
    const gap = line.length > 0 && word.space ? spaceWidth() : 0

    if (line.length > 0 && lineWidth + gap + width > maxWidth) {
      flush()
      line.push({ ...word, space: false })
      lineWidth = width
      continue
    }

    line.push(word)
    lineWidth += gap + width
  }
  flush()

  return y
}

/** Hoeveel regels heeft deze tekst nodig binnen een gegeven breedte? */
function measureLines(doc: jsPDF, words: Word[], maxWidth: number, size: number): string[] {
  doc.setFontSize(size)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (word.text === '\n') {
      lines.push(current)
      current = ''
      continue
    }
    const candidate = current ? `${current}${word.space ? ' ' : ''}${word.text}` : word.text
    doc.setFont('helvetica', fontStyle(word.bold, word.italic))
    doc.setFontSize(size)
    if (current && doc.getTextWidth(candidate) > maxWidth) {
      lines.push(current)
      current = word.text
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

function renderTable(
  doc: jsPDF,
  table: HTMLElement,
  y: number,
  layout: RichTextPdfLayout,
): number {
  const rows = Array.from(table.querySelectorAll('tr'))
  if (rows.length === 0) return y

  const cellSize = 8.5
  const cellLine = 4
  const padX = 2
  const padY = 2.6

  const columnCount = Math.max(
    ...rows.map((row) => row.querySelectorAll('td, th').length),
  )
  if (columnCount === 0) return y

  // Kolombreedte naar rato van de hoeveelheid tekst, met een ondergrens zodat
  // een smalle kolom niet tot losse letters wordt geknepen.
  const weights = new Array(columnCount).fill(0)
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('td, th'))
    cells.forEach((cell, i) => {
      weights[i] = Math.max(weights[i], (cell.textContent || '').trim().length)
    })
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0) || columnCount
  const minWidth = Math.min(22, layout.width / columnCount)
  let widths = weights.map((w) => Math.max(minWidth, (w / totalWeight) * layout.width))
  const scale = layout.width / widths.reduce((a, b) => a + b, 0)
  widths = widths.map((w) => w * scale)

  y += 2

  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('td, th')) as HTMLElement[]
    if (cells.length === 0) continue
    const isHeader = cells.some((c) => c.tagName.toLowerCase() === 'th')

    const cellLines = cells.map((cell, i) =>
      measureLines(doc, wordsOf(cell), widths[i] - padX * 2, cellSize),
    )
    const rowHeight = Math.max(...cellLines.map((l) => l.length)) * cellLine + padY * 2

    if (y + rowHeight > layout.bottom) {
      doc.addPage()
      y = layout.top
      layout.onNewPage?.(doc)
    }

    if (isHeader) {
      doc.setFillColor(245, 245, 247)
      doc.rect(layout.margin, y, layout.width, rowHeight, 'F')
    }

    doc.setDrawColor(225, 225, 228)
    doc.setLineWidth(0.1)
    doc.line(layout.margin, y + rowHeight, layout.margin + layout.width, y + rowHeight)

    doc.setFontSize(cellSize)
    doc.setTextColor(...(isHeader ? HEADING_COLOR : BODY_COLOR))

    let x = layout.margin
    cellLines.forEach((lines, i) => {
      doc.setFont('helvetica', isHeader ? 'bold' : 'normal')
      lines.forEach((line, lineIndex) => {
        doc.text(line, x + padX, y + padY + (lineIndex + 1) * cellLine - 1)
      })
      x += widths[i]
    })

    y += rowHeight
  }

  return y + 4
}

function renderList(
  doc: jsPDF,
  list: HTMLElement,
  ordered: boolean,
  y: number,
  layout: RichTextPdfLayout,
): number {
  const items = Array.from(list.children).filter(
    (child) => child.tagName.toLowerCase() === 'li',
  ) as HTMLElement[]

  const indent = 5
  let index = 1

  for (const item of items) {
    const marker = ordered ? `${index}.` : '•'
    index += 1

    // Genest lijstje binnen dit item apart afhandelen.
    const nested = Array.from(item.children).filter((c) =>
      ['ul', 'ol'].includes(c.tagName.toLowerCase()),
    ) as HTMLElement[]
    nested.forEach((n) => n.remove())

    if (y + BODY_LINE > layout.bottom) {
      doc.addPage()
      y = layout.top
      layout.onNewPage?.(doc)
    }

    doc.setFontSize(BODY_SIZE)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BODY_COLOR)
    doc.text(marker, layout.margin, y)

    y = drawWords(
      doc,
      wordsOf(item),
      layout.margin + indent,
      layout.width - indent,
      BODY_SIZE,
      BODY_LINE,
      y,
      layout,
    )

    for (const n of nested) {
      const nestedLayout: RichTextPdfLayout = {
        ...layout,
        margin: layout.margin + indent,
        width: layout.width - indent,
      }
      y = renderList(doc, n, n.tagName.toLowerCase() === 'ol', y, nestedLayout)
    }

    y += 1
  }

  return y + 1
}

function renderBlock(
  doc: jsPDF,
  el: HTMLElement,
  y: number,
  layout: RichTextPdfLayout,
): number {
  const tag = el.tagName.toLowerCase()

  if (tag === 'table') return renderTable(doc, el, y, layout)
  if (tag === 'ul') return renderList(doc, el, false, y, layout)
  if (tag === 'ol') return renderList(doc, el, true, y, layout)

  if (tag === 'hr') {
    if (y + 6 > layout.bottom) {
      doc.addPage()
      y = layout.top
      layout.onNewPage?.(doc)
    }
    y += 3
    doc.setDrawColor(225, 225, 228)
    doc.setLineWidth(0.2)
    doc.line(layout.margin, y, layout.margin + layout.width, y)
    return y + 5
  }

  if (HEADING_SIZES[tag]) {
    const words = wordsOf(el)
    if (words.length === 0) return y
    const size = HEADING_SIZES[tag]
    const lineHeight = size * 0.5
    y += HEADING_SPACE_BEFORE[tag]

    // Een kop onderaan een pagina zonder tekst eronder ziet er verweesd uit.
    if (y + lineHeight + BODY_LINE > layout.bottom) {
      doc.addPage()
      y = layout.top
      layout.onNewPage?.(doc)
    }

    doc.setTextColor(...HEADING_COLOR)
    y = drawWords(
      doc,
      words.map((w) => ({ ...w, bold: true })),
      layout.margin,
      layout.width,
      size,
      lineHeight,
      y,
      layout,
    )
    return y + 1.5
  }

  if (tag === 'blockquote') {
    const words = wordsOf(el)
    if (words.length === 0) return y
    const indent = 4
    const startY = y
    doc.setTextColor(...MUTED_COLOR)
    y = drawWords(
      doc,
      words.map((w) => ({ ...w, italic: true })),
      layout.margin + indent,
      layout.width - indent,
      BODY_SIZE,
      BODY_LINE,
      y,
      layout,
    )
    doc.setDrawColor(210, 210, 214)
    doc.setLineWidth(0.6)
    doc.line(layout.margin, startY - 3, layout.margin, y - 3)
    return y + 2
  }

  // p en alles wat er verder nog langskomt
  const words = wordsOf(el)
  if (words.length === 0) return y + 2
  doc.setTextColor(...BODY_COLOR)
  y = drawWords(doc, words, layout.margin, layout.width, BODY_SIZE, BODY_LINE, y, layout)
  return y + 2.5
}

/**
 * Rendert een stuk HTML in het document vanaf y en geeft de eind-y terug.
 * Blokken die niet meer passen krijgen automatisch een nieuwe pagina.
 */
export function renderRichTextToPdf(
  doc: jsPDF,
  html: string,
  startY: number,
  layout: RichTextPdfLayout,
): number {
  if (!html || !html.trim()) return startY

  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = parsed.body.firstElementChild
  if (!root) return startY

  let y = startY
  for (const child of Array.from(root.children)) {
    y = renderBlock(doc, child as HTMLElement, y, layout)
  }

  doc.setTextColor(...BODY_COLOR)
  return y
}
