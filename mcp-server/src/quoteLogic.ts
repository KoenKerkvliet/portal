import { randomUUID } from 'node:crypto'

export type YearFormat = 'YY' | 'YYYY'

export type QuoteItemInput =
  | {
      type: 'product'
      product_id?: string
      name?: string
      description?: string
      quantity?: number
      unit?: string
      price?: number
      is_recurring?: boolean
    }
  | { type: 'title'; title: string }
  | { type: 'divider' }

export interface QuoteItem {
  id: string
  type: 'product' | 'title' | 'divider'
  product_id?: string
  name?: string
  description?: string
  quantity?: number
  unit?: string
  price?: number
  is_recurring?: boolean
  title?: string
}

export function generateQuoteNumber(
  prefix: string,
  yearFormat: YearFormat,
  startNumber: number,
  existingNumbers: string[],
): string {
  const currentYear = new Date().getFullYear()
  const yearStr = yearFormat === 'YY' ? String(currentYear).slice(-2) : String(currentYear)
  const basePrefix = `${prefix}${yearStr}`
  let maxNum = startNumber - 1
  for (const num of existingNumbers) {
    if (num.startsWith(basePrefix)) {
      const suffix = num.slice(basePrefix.length)
      const parsed = parseInt(suffix, 10)
      if (!Number.isNaN(parsed) && parsed > maxNum) maxNum = parsed
    }
  }
  return `${basePrefix}${maxNum + 1}`
}

export function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export function plusDaysStr(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function calcQuoteTotal(
  items: QuoteItem[],
  discountPercent: number,
  btwPercent: number,
): { subtotal: number; discountAmount: number; afterDiscount: number; btwAmount: number; total: number } {
  const subtotal = items
    .filter((i) => i.type === 'product')
    .reduce((sum, i) => sum + (i.quantity || 0) * (i.price || 0), 0)
  const discountAmount = subtotal * (discountPercent / 100)
  const afterDiscount = subtotal - discountAmount
  const btwAmount = afterDiscount * (btwPercent / 100)
  const total = afterDiscount + btwAmount
  return { subtotal, discountAmount, afterDiscount, btwAmount, total }
}

interface ProductRow {
  id: string
  name: string
  description: string
  quantity_value: number
  quantity_unit: string
  price: number
  is_recurring: boolean
}

export function normalizeItems(
  inputs: QuoteItemInput[],
  productLookup: Map<string, ProductRow>,
): QuoteItem[] {
  return inputs.map((raw) => {
    if (raw.type === 'divider') {
      return { id: randomUUID(), type: 'divider' }
    }
    if (raw.type === 'title') {
      return { id: randomUUID(), type: 'title', title: raw.title }
    }
    // product
    if (raw.product_id) {
      const p = productLookup.get(raw.product_id)
      if (!p) throw new Error(`Onbekend product_id: ${raw.product_id}`)
      return {
        id: randomUUID(),
        type: 'product',
        product_id: p.id,
        name: raw.name ?? p.name,
        description: raw.description ?? p.description,
        quantity: raw.quantity ?? p.quantity_value,
        unit: raw.unit ?? p.quantity_unit,
        price: raw.price ?? p.price,
        is_recurring: raw.is_recurring ?? p.is_recurring,
      }
    }
    if (!raw.name) throw new Error('Een product-item zonder product_id moet minimaal "name" hebben')
    return {
      id: randomUUID(),
      type: 'product',
      name: raw.name,
      description: raw.description ?? '',
      quantity: raw.quantity ?? 1,
      unit: raw.unit ?? 'stuks',
      price: raw.price ?? 0,
      is_recurring: raw.is_recurring ?? false,
    }
  })
}
