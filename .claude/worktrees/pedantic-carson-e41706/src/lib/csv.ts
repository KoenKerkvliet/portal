// Shared CSV parsing helpers used by Kosten- and factuur-imports.

export function parseAmount(raw: string | undefined | null): number {
  if (raw == null) return 0
  let s = String(raw).trim().replace(/[€$£\s]/g, '')
  if (!s) return 0
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  if (hasDot && hasComma) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (hasComma) {
    s = s.replace(',', '.')
  }
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export function parseDate(raw: string | undefined | null, fallback?: string): string {
  if (!raw) return fallback ?? todayStr()
  const s = String(raw).trim()
  if (!s) return fallback ?? todayStr()
  // yyyy-mm-dd (optionally followed by space + time)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  // dd-mm-yyyy or dd/mm/yyyy
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/)
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return fallback ?? todayStr()
}

export function normalizeHeader(s: string): string {
  return s.toLowerCase().trim().replace(/[._-]/g, ' ').replace(/\s+/g, ' ')
}

// Robust CSV parser: handles quoted fields, escaped quotes, and , or ; delimiter.
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ','

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === delimiter) {
        row.push(field); field = ''
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++
        row.push(field); field = ''
        if (row.some((f) => f.length > 0)) rows.push(row)
        row = []
      } else {
        field += c
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    if (row.some((f) => f.length > 0)) rows.push(row)
  }
  return rows
}

// Map CSV header row to known field names via aliases (case- and punctuation-insensitive).
// Returns a record of field → column index (or undefined if header is missing).
export function mapHeaders<T extends string>(headers: string[], aliases: Record<T, string[]>): Record<T, number | undefined> {
  const map = {} as Record<T, number | undefined>
  const normalized = headers.map(normalizeHeader)
  for (const field of Object.keys(aliases) as T[]) {
    const found = normalized.findIndex((h) => aliases[field].some((a) => normalizeHeader(a) === h))
    map[field] = found >= 0 ? found : undefined
  }
  return map
}
