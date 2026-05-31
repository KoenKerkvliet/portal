// Genereert nieuwe facturen op basis van terugkerende sjablonen.
// Aanroepbaar handmatig (POST) of via pg_cron — zie add-recurring-invoice-columns.sql.
//
// Werking:
//  1. Haal alle templates op waar is_recurring = true AND recurrence_next_run_at <= now().
//  2. Per template: insert een nieuwe gewone factuur (kopie van items/notes/btw/etc.)
//     met een vers factuurnummer, status 'sent', recurring_template_id = template.id.
//  3. Update template: zet recurrence_last_run_at op nu en schuif recurrence_next_run_at
//     op met het interval. Als de nieuwe waarde nog steeds in het verleden ligt
//     (bv. een uitgevallen cron), blijven we incrementeren tot in de toekomst.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type RecurrenceInterval = 'daily' | 'weekly' | 'monthly' | 'yearly'

interface InvoiceTemplate {
  id: string
  number: string
  project_id: string
  client_id: string
  amount: number
  subtotal: number
  due_date: string
  invoice_date: string | null
  is_test: boolean
  client_name: string | null
  client_email: string | null
  client_address: string | null
  items: unknown
  discount_percent: number
  btw_percent: number
  notes: string | null
  recurrence_interval: RecurrenceInterval
  recurrence_send_time: string
  recurrence_next_run_at: string
}

interface InvoiceSettingsRow {
  invoice_prefix: string
  year_format: 'YY' | 'YYYY'
  start_number: number
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function diffDays(a: string, b: string): number {
  const ms = new Date(a).getTime() - new Date(b).getTime()
  return Math.round(ms / 86400000)
}

function advance(interval: RecurrenceInterval, from: Date): Date {
  const next = new Date(from)
  if (interval === 'daily') next.setDate(next.getDate() + 1)
  else if (interval === 'weekly') next.setDate(next.getDate() + 7)
  else if (interval === 'monthly') next.setMonth(next.getMonth() + 1)
  else if (interval === 'yearly') next.setFullYear(next.getFullYear() + 1)
  return next
}

function nextRunAfter(interval: RecurrenceInterval, from: Date, now: Date): Date {
  let next = advance(interval, from)
  // Als de cron heeft hapertingen heeft gehad, kunnen we ver achterlopen.
  // Blijf incrementen tot de volgende run in de toekomst ligt.
  while (next <= now) next = advance(interval, next)
  return next
}

function generateInvoiceNumber(
  prefix: string,
  yearFormat: 'YY' | 'YYYY',
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
      if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed
    }
  }
  return `${basePrefix}${maxNum + 1}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const nowIso = new Date().toISOString()
    const { data: templates, error: tplErr } = await db
      .from('invoices')
      .select('*')
      .eq('is_recurring', true)
      .not('recurrence_next_run_at', 'is', null)
      .lte('recurrence_next_run_at', nowIso)

    if (tplErr) throw new Error(`Kon templates niet laden: ${tplErr.message}`)

    const due = (templates || []) as InvoiceTemplate[]
    if (due.length === 0) {
      return new Response(
        JSON.stringify({ success: true, generated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Eén keer settings + bestaande nummers ophalen; we werken de lokale lijst
    // bij voor opeenvolgende inserts in dezelfde run.
    const [settingsRes, numsRes] = await Promise.all([
      db.from('invoice_settings').select('invoice_prefix, year_format, start_number').limit(1).single(),
      db.from('invoices').select('number, is_test, has_temp_number, is_recurring'),
    ])

    if (settingsRes.error || !settingsRes.data) {
      throw new Error('Factuurinstellingen niet gevonden')
    }
    const settings = settingsRes.data as InvoiceSettingsRow
    // Alleen echte facturen tellen mee voor de nummerreeks. Sjablonen (is_recurring),
    // testfacturen en facturen met een tijdelijk nummer vallen er expliciet buiten,
    // zodat een terugkerend sjabloon nooit een reeksnummer opslokt.
    const realNumbers = (numsRes.data || [])
      .filter((r) => !r.is_test && !r.has_temp_number && !r.is_recurring)
      .map((r) => r.number as string)

    const generated: { template_id: string; new_invoice_id: string; number: string }[] = []
    const errors: { template_id: string; error: string }[] = []

    for (const tpl of due) {
      try {
        // Factuurnummer
        let newNumber: string
        if (tpl.is_test) {
          newNumber = `TEST-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`
        } else {
          newNumber = generateInvoiceNumber(settings.invoice_prefix, settings.year_format, settings.start_number, realNumbers)
          realNumbers.push(newNumber)
        }

        // Datums
        const invoiceDate = todayIso()
        const offset = tpl.invoice_date ? diffDays(tpl.due_date, tpl.invoice_date) : 14
        const dueDate = addDaysIso(invoiceDate, offset > 0 ? offset : 14)

        const insertPayload = {
          number: newNumber,
          project_id: tpl.project_id,
          client_id: tpl.client_id,
          amount: tpl.amount,
          subtotal: tpl.subtotal,
          status: 'sent',
          due_date: dueDate,
          invoice_date: invoiceDate,
          is_test: tpl.is_test,
          client_name: tpl.client_name,
          client_email: tpl.client_email,
          client_address: tpl.client_address,
          items: tpl.items,
          discount_percent: tpl.discount_percent,
          btw_percent: tpl.btw_percent,
          notes: tpl.notes,
          recurring_template_id: tpl.id,
          // Expliciet false zodat de gegenereerde factuur niet zelf een sjabloon wordt.
          is_recurring: false,
          recurrence_interval: null,
          recurrence_next_run_at: null,
        }

        const { data: inserted, error: insErr } = await db
          .from('invoices')
          .insert(insertPayload)
          .select('id')
          .single()

        if (insErr || !inserted) throw new Error(insErr?.message || 'insert mislukt')

        const newNext = nextRunAfter(tpl.recurrence_interval, new Date(tpl.recurrence_next_run_at), new Date())
        const { error: updErr } = await db.from('invoices').update({
          recurrence_last_run_at: nowIso,
          recurrence_next_run_at: newNext.toISOString(),
        }).eq('id', tpl.id)

        if (updErr) throw new Error(`update template: ${updErr.message}`)

        generated.push({ template_id: tpl.id, new_invoice_id: inserted.id, number: newNumber })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        errors.push({ template_id: tpl.id, error: message })
      }
    }

    return new Response(
      JSON.stringify({ success: true, generated: generated.length, items: generated, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('process-recurring-invoices error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
