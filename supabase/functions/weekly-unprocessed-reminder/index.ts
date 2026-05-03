// Wekelijkse reminder-mail met openstaande (niet verwerkte) banktransacties.
// Aanroepbaar handmatig (POST) of via pg_cron (zie onderaan add-bunq-tables.sql).
// Stuurt alleen mail als er minstens één onverwerkte transactie is.
//
// Vereiste secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automatisch)
//   EMAILIT_API_KEY                          (zelf zetten)
// Optioneel:
//   EMAILIT_FROM     — default 'DesignPixels <noreply@designpixels.nl>'
//   ADMIN_EMAIL      — default 'koen.kerkvliet@designpixels.nl'
//   PORTAL_URL       — default 'https://portal.designpixels.nl'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import jsPDF from 'https://esm.sh/jspdf@3.0.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Tx = {
  id: string
  booked_at: string
  amount: number
  currency: string
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
}

function nlDate(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function nlDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function nlMoney(n: number): string {
  return Number(n).toFixed(2).replace('.', ',')
}

// ---- PDF ---------------------------------------------------------------

const PAGE_MARGIN = 14
const LINE_HEIGHT = 5

function buildPdf(txs: Tx[]): Uint8Array {
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

  // Header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Niet verwerkte banktransacties', PAGE_MARGIN, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(
    `Gegenereerd: ${new Date().toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short' })}`,
    PAGE_MARGIN, y,
  )
  y += 4
  doc.text(`Aantal: ${txs.length}`, PAGE_MARGIN, y)
  doc.setTextColor(0)
  y += 10

  // Tabel
  const cols = [
    { label: 'Datum', w: 22 },
    { label: 'Tegenpartij', w: 50 },
    { label: 'Omschrijving', w: 80 },
    { label: 'Bedrag', w: contentWidth - 22 - 50 - 80, align: 'right' as const },
  ]

  const drawHeader = () => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setFillColor(245, 245, 245)
    doc.rect(PAGE_MARGIN, y - 4, contentWidth, 6, 'F')
    let x = PAGE_MARGIN
    for (const col of cols) {
      doc.text(
        col.label,
        col.align === 'right' ? x + col.w - 2 : x + 1,
        y,
        col.align === 'right' ? { align: 'right' } : undefined,
      )
      x += col.w
    }
    y += 4
    doc.setFont('helvetica', 'normal')
  }
  drawHeader()

  for (const t of txs) {
    ensureSpace(LINE_HEIGHT + 1)
    if (y === PAGE_MARGIN) drawHeader()
    let x = PAGE_MARGIN
    const row = [
      nlDate(t.booked_at),
      (t.counterparty_name ?? '—').slice(0, 32),
      (t.description ?? '').slice(0, 50),
      `${t.amount >= 0 ? '+' : '-'} € ${nlMoney(Math.abs(Number(t.amount)))}`,
    ]
    cols.forEach((col, i) => {
      if (i === 3) doc.setTextColor(t.amount >= 0 ? 22 : 192, t.amount >= 0 ? 163 : 38, t.amount >= 0 ? 74 : 38)
      else doc.setTextColor(0)
      doc.text(
        row[i],
        col.align === 'right' ? x + col.w - 2 : x + 1,
        y,
        col.align === 'right' ? { align: 'right' } : undefined,
      )
      x += col.w
    })
    doc.setTextColor(0)
    y += LINE_HEIGHT
  }

  // Pagina-nummers
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(140)
    doc.text(`Pagina ${i} van ${pageCount}`, pageWidth - PAGE_MARGIN, pageHeight - 8, { align: 'right' })
    doc.setTextColor(0)
  }

  return doc.output('arraybuffer') as unknown as Uint8Array
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const len = bytes.byteLength
  // In chunks om callstack overflow te voorkomen
  const chunkSize = 0x8000
  for (let i = 0; i < len; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, len))
    binary += String.fromCharCode.apply(null, slice as unknown as number[])
  }
  return btoa(binary)
}

// ---- Mail --------------------------------------------------------------

function buildHtml(txs: Tx[], totalAbs: number, portalUrl: string): string {
  const rows = txs.slice(0, 25).map((t) => {
    const sign = t.amount >= 0 ? '+' : '−'
    const color = t.amount >= 0 ? '#16a34a' : '#dc2626'
    return `
      <tr>
        <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:12px;white-space:nowrap;">${nlDate(t.booked_at)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;color:#1f2937;font-size:12px;">${escapeHtml(t.counterparty_name ?? '—')}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;">${escapeHtml((t.description ?? '').slice(0, 60))}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;color:${color};font-size:12px;font-weight:600;text-align:right;white-space:nowrap;">${sign} € ${nlMoney(Math.abs(Number(t.amount)))}</td>
      </tr>`
  }).join('')

  const more = txs.length > 25
    ? `<p style="color:#9ca3af;font-size:12px;margin:12px 0 0;">…en ${txs.length - 25} meer in de bijgevoegde PDF.</p>`
    : ''

  const word = txs.length === 1 ? 'transactie staat' : 'transacties staan'

  return `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f8f7fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
        <div style="background:linear-gradient(135deg,#9e86ff,#7c3aed);padding:32px;text-align:center;">
          <h1 style="color:white;margin:0;font-size:22px;font-weight:700;">DesignPixels</h1>
          <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:4px 0 0;">Wekelijkse herinnering</p>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#1f2937;margin:0 0 8px;font-size:20px;">Administratie bijwerken</h2>
          <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 20px;">
            Er ${word} <strong>${txs.length} ${txs.length === 1 ? 'banktransactie' : 'banktransacties'}</strong> nog te verwerken
            (totaal <strong>€ ${nlMoney(totalAbs)}</strong>). Tijd om je administratie even bij te werken.
          </p>

          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:#f3f4f6;">
                  <th style="padding:8px 6px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Datum</th>
                  <th style="padding:8px 6px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Tegenpartij</th>
                  <th style="padding:8px 6px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Omschrijving</th>
                  <th style="padding:8px 6px;text-align:right;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Bedrag</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          ${more}

          <div style="text-align:center;margin:24px 0 8px;">
            <a href="${portalUrl}/admin/financien" style="display:inline-block;background:#7c3aed;color:white;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;">
              Open Financiën in het portaal
            </a>
          </div>

          <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:24px 0 0;text-align:center;">
            Bijgevoegd: <strong>onverwerkt-banktransacties.pdf</strong> met het volledige overzicht.
          </p>
        </div>
        <div style="padding:16px 32px;background:#f9fafb;text-align:center;">
          <p style="color:#9ca3af;font-size:11px;margin:0;">
            Deze mail wordt elke vrijdagavond verstuurd zolang er onverwerkte transacties zijn.
          </p>
        </div>
      </div>
    </body></html>
  `
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ---- Entrypoint --------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('EMAILIT_API_KEY')
    if (!apiKey) throw new Error('EMAILIT_API_KEY niet geconfigureerd')

    const from = Deno.env.get('EMAILIT_FROM') || 'DesignPixels <noreply@designpixels.nl>'
    const to = Deno.env.get('ADMIN_EMAIL') || 'koen.kerkvliet@designpixels.nl'
    const portalUrl = Deno.env.get('PORTAL_URL') || 'https://portal.designpixels.nl'

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: rows, error } = await db
      .from('bank_transactions')
      .select('id, booked_at, amount, currency, description, counterparty_name, counterparty_iban')
      .is('invoice_id', null)
      .is('expense_id', null)
      .is('category', null)
      .order('booked_at', { ascending: false })

    if (error) throw new Error(`Kon transacties niet laden: ${error.message}`)
    const txs = (rows as Tx[] | null) ?? []

    if (txs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: false, reason: 'geen onverwerkte transacties' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const totalAbs = txs.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

    const pdfBytes = buildPdf(txs)
    const pdfBase64 = uint8ToBase64(pdfBytes)

    const subject = `Herinnering: ${txs.length} ${txs.length === 1 ? 'transactie' : 'transacties'} nog te verwerken`
    const html = buildHtml(txs, totalAbs, portalUrl)

    const today = new Date().toISOString().slice(0, 10)

    const res = await fetch('https://api.emailit.com/v2/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        attachments: [{
          filename: `onverwerkt-banktransacties-${today}.pdf`,
          content: pdfBase64,
          content_type: 'application/pdf',
        }],
      }),
    })

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`EmailIt ${res.status}: ${txt}`)
    }

    return new Response(
      JSON.stringify({ success: true, sent: true, count: txs.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('weekly-unprocessed-reminder error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
