// Genereert het volgende test-nummer in de reeks TEST-001, TEST-002, …
// Gebruikt door QuoteBuilder en InvoiceBuilder zodat elke nieuwe test-offerte
// of test-factuur een eigen oplopend nummer krijgt.

export function generateTestNumber(existingNumbers: Array<string | null | undefined>): string {
  let max = 0
  for (const num of existingNumbers) {
    if (!num) continue
    const m = num.match(/^TEST-(\d+)$/)
    if (m) {
      const n = parseInt(m[1], 10)
      if (!isNaN(n) && n > max) max = n
    }
  }
  return `TEST-${String(max + 1).padStart(3, '0')}`
}
