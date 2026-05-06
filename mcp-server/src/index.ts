#!/usr/bin/env node
import 'dotenv/config'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { getSupabase } from './supabase.js'
import {
  calcQuoteTotal,
  generateQuoteNumber,
  normalizeItems,
  plusDaysStr,
  todayStr,
  type QuoteItemInput,
  type YearFormat,
} from './quoteLogic.js'

const server = new McpServer({
  name: 'klantportaal',
  version: '0.1.0',
})

const json = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
})

const err = (msg: string) => ({
  isError: true,
  content: [{ type: 'text' as const, text: msg }],
})

// ============================================================
// READ TOOLS
// ============================================================

server.registerTool(
  'list_clients',
  {
    title: 'Lijst klanten',
    description:
      'Geeft klanten terug uit de Klantportaal-database. Gebruik dit om een client_id te vinden voordat je een offerte maakt.',
    inputSchema: {
      search: z.string().optional().describe('Zoekt in naam, email of bedrijf (case-insensitive).'),
      limit: z.number().int().min(1).max(200).default(50),
    },
  },
  async ({ search, limit }) => {
    const sb = getSupabase()
    let q = sb
      .from('clients')
      .select('id, name, email, company, phone, status, created_at')
      .order('name')
      .limit(limit ?? 50)
    if (search) {
      const s = `%${search}%`
      q = q.or(`name.ilike.${s},email.ilike.${s},company.ilike.${s}`)
    }
    const { data, error } = await q
    if (error) return err(error.message)
    return json(data)
  },
)

server.registerTool(
  'list_projects',
  {
    title: 'Lijst projecten',
    description:
      'Geeft projecten (domeinen) terug, met de gekoppelde klanten en hun notificatie-voorkeuren. De client met notify_quotes=true is de standaard-ontvanger voor offertes.',
    inputSchema: {
      client_id: z.string().uuid().optional(),
      status: z.enum(['active', 'archived']).optional(),
      search: z.string().optional().describe('Zoekt in projectnaam.'),
      limit: z.number().int().min(1).max(200).default(50),
    },
  },
  async ({ client_id, status, search, limit }) => {
    const sb = getSupabase()
    let q = sb
      .from('projects')
      .select(
        'id, name, url, current_phase, status, due_date, created_at, project_clients(client_id, notify_quotes, client:clients(id, name, email, company))',
      )
      .order('name')
      .limit(limit ?? 50)
    if (status) q = q.eq('status', status)
    if (search) q = q.ilike('name', `%${search}%`)
    const { data, error } = await q
    if (error) return err(error.message)
    let rows = data ?? []
    if (client_id) {
      rows = rows.filter((p: any) =>
        (p.project_clients ?? []).some((pc: any) => pc.client_id === client_id),
      )
    }
    return json(rows)
  },
)

server.registerTool(
  'list_products',
  {
    title: 'Lijst producten/diensten',
    description:
      'Geeft producten/diensten terug die als regel op een offerte gezet kunnen worden. Gebruik product_id in create_quote om automatisch naam/prijs/eenheid te vullen.',
    inputSchema: {
      search: z.string().optional().describe('Zoekt in naam of code.'),
      limit: z.number().int().min(1).max(200).default(100),
    },
  },
  async ({ search, limit }) => {
    const sb = getSupabase()
    let q = sb
      .from('products')
      .select('id, code, name, description, quantity_value, quantity_unit, price, is_recurring')
      .order('name')
      .limit(limit ?? 100)
    if (search) {
      const s = `%${search}%`
      q = q.or(`name.ilike.${s},code.ilike.${s}`)
    }
    const { data, error } = await q
    if (error) return err(error.message)
    return json(data)
  },
)

server.registerTool(
  'list_quotes',
  {
    title: 'Lijst offertes',
    description:
      'Geeft offertes terug (zonder regels, voor compactheid). Gebruik get_quote om de volledige inhoud van één offerte op te halen.',
    inputSchema: {
      project_id: z.string().uuid().optional(),
      client_id: z.string().uuid().optional(),
      status: z.enum(['draft', 'sent', 'accepted', 'declined']).optional(),
      include_test: z.boolean().default(false).describe('Test-offertes meenemen.'),
      limit: z.number().int().min(1).max(200).default(50),
    },
  },
  async ({ project_id, client_id, status, include_test, limit }) => {
    const sb = getSupabase()
    let q = sb
      .from('quotes')
      .select(
        'id, number, status, amount, valid_until, is_test, project_id, client_id, created_at, accepted_at, declined_at',
      )
      .order('created_at', { ascending: false })
      .limit(limit ?? 50)
    if (project_id) q = q.eq('project_id', project_id)
    if (client_id) q = q.eq('client_id', client_id)
    if (status) q = q.eq('status', status)
    if (!include_test) q = q.eq('is_test', false)
    const { data, error } = await q
    if (error) return err(error.message)
    return json(data)
  },
)

server.registerTool(
  'get_quote',
  {
    title: 'Haal offerte op',
    description: 'Volledige offerte inclusief regels, kortingen, BTW en (indien geaccepteerd) ondertekening.',
    inputSchema: { id: z.string().uuid() },
  },
  async ({ id }) => {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('quotes')
      .select('*, project:projects(id, name), client:clients(id, name, email, company)')
      .eq('id', id)
      .single()
    if (error) return err(error.message)
    return json(data)
  },
)

server.registerTool(
  'get_quote_settings',
  {
    title: 'Haal offerte-instellingen op',
    description:
      'Prefix, jaar-formaat en startnummer voor offertes, plus KOR-status uit invoice_settings (KOR=true betekent dat BTW altijd 0 moet zijn).',
    inputSchema: {},
  },
  async () => {
    const sb = getSupabase()
    const [qs, isr] = await Promise.all([
      sb.from('quote_settings').select('quote_prefix, year_format, start_number').limit(1).single(),
      sb.from('invoice_settings').select('kor_enabled, company_name').limit(1).single(),
    ])
    if (qs.error) return err(qs.error.message)
    return json({
      quote_prefix: qs.data?.quote_prefix,
      year_format: qs.data?.year_format,
      start_number: qs.data?.start_number,
      kor_enabled: isr.data?.kor_enabled ?? false,
      company_name: isr.data?.company_name ?? null,
    })
  },
)

// ============================================================
// WRITE TOOLS
// ============================================================

const itemInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('product'),
    product_id: z.string().uuid().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    quantity: z.number().min(0).optional(),
    unit: z.string().optional(),
    price: z.number().min(0).optional(),
    is_recurring: z.boolean().optional(),
  }),
  z.object({ type: z.literal('title'), title: z.string() }),
  z.object({ type: z.literal('divider') }),
])

server.registerTool(
  'create_quote',
  {
    title: 'Maak concept-offerte',
    description:
      'Maakt een nieuwe offerte aan met status="draft". Nummer en totaalbedrag worden automatisch berekend. Verzenden naar de klant doe je daarna in de admin-UI.',
    inputSchema: {
      project_id: z.string().uuid(),
      client_id: z
        .string()
        .uuid()
        .optional()
        .describe('Optioneel; als leeg wordt de project_clients-rij met notify_quotes=true gebruikt.'),
      valid_until: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe('YYYY-MM-DD. Standaard: vandaag + 14 dagen.'),
      discount_percent: z.number().min(0).max(100).default(0),
      btw_percent: z.number().min(0).max(100).default(21).describe('Wordt naar 0 gezet als KOR aanstaat.'),
      notes: z.string().default(''),
      is_test: z.boolean().default(false),
      items: z.array(itemInputSchema).min(1),
    },
  },
  async ({ project_id, client_id, valid_until, discount_percent, btw_percent, notes, is_test, items }) => {
    const sb = getSupabase()

    // 1. Project + klanten
    const { data: project, error: pErr } = await sb
      .from('projects')
      .select('id, name, project_clients(client_id, notify_quotes)')
      .eq('id', project_id)
      .single()
    if (pErr || !project) return err(`Project niet gevonden: ${pErr?.message ?? project_id}`)

    let resolvedClientId = client_id
    if (!resolvedClientId) {
      const pcs = (project as any).project_clients ?? []
      const preferred = pcs.find((pc: any) => pc.notify_quotes) ?? pcs[0]
      if (!preferred) return err('Project heeft geen gekoppelde klant; geef expliciet client_id mee.')
      resolvedClientId = preferred.client_id
    }

    // 2. Settings (prefix, KOR)
    const [qs, isr, existing] = await Promise.all([
      sb.from('quote_settings').select('quote_prefix, year_format, start_number').limit(1).single(),
      sb.from('invoice_settings').select('kor_enabled').limit(1).single(),
      sb.from('quotes').select('number'),
    ])
    if (qs.error || !qs.data) return err(`quote_settings ontbreekt: ${qs.error?.message ?? 'geen rij'}`)

    const number = generateQuoteNumber(
      qs.data.quote_prefix,
      qs.data.year_format as YearFormat,
      qs.data.start_number,
      (existing.data ?? []).map((q: any) => q.number),
    )

    // 3. Items normaliseren (haal product-info op voor regels die alleen product_id geven)
    const productIds = items
      .filter((i) => i.type === 'product' && i.product_id)
      .map((i) => (i as any).product_id as string)
    const productLookup = new Map<string, any>()
    if (productIds.length > 0) {
      const { data: prods, error: prErr } = await sb
        .from('products')
        .select('id, name, description, quantity_value, quantity_unit, price, is_recurring')
        .in('id', productIds)
      if (prErr) return err(prErr.message)
      for (const p of prods ?? []) productLookup.set(p.id, p)
    }

    let normalized
    try {
      normalized = normalizeItems(items as QuoteItemInput[], productLookup)
    } catch (e) {
      return err((e as Error).message)
    }

    // 4. KOR dwingt BTW=0
    const effectiveBtw = isr.data?.kor_enabled ? 0 : btw_percent
    const totals = calcQuoteTotal(normalized, discount_percent, effectiveBtw)

    // 5. Insert
    const payload = {
      number,
      project_id,
      client_id: resolvedClientId,
      amount: Math.round(totals.total * 100) / 100,
      status: 'draft' as const,
      valid_until: valid_until ?? plusDaysStr(14),
      is_test,
      items: normalized,
      discount_percent,
      btw_percent: effectiveBtw,
      notes,
      created_at: new Date(todayStr()).toISOString(),
    }
    const { data: created, error: insErr } = await sb.from('quotes').insert(payload).select('*').single()
    if (insErr) return err(insErr.message)
    return json({
      id: created.id,
      number: created.number,
      status: created.status,
      project_id: created.project_id,
      client_id: created.client_id,
      valid_until: created.valid_until,
      totals,
      kor_applied: !!isr.data?.kor_enabled,
    })
  },
)

server.registerTool(
  'update_quote',
  {
    title: 'Werk concept-offerte bij',
    description:
      'Werkt een offerte bij. Alleen toegestaan zolang status="draft" — verstuurde of geaccepteerde offertes mogen niet meer aangepast worden.',
    inputSchema: {
      id: z.string().uuid(),
      valid_until: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      discount_percent: z.number().min(0).max(100).optional(),
      btw_percent: z.number().min(0).max(100).optional(),
      notes: z.string().optional(),
      items: z.array(itemInputSchema).optional(),
    },
  },
  async ({ id, valid_until, discount_percent, btw_percent, notes, items }) => {
    const sb = getSupabase()
    const { data: existing, error: getErr } = await sb
      .from('quotes')
      .select('*')
      .eq('id', id)
      .single()
    if (getErr || !existing) return err(`Offerte niet gevonden: ${getErr?.message ?? id}`)
    if (existing.status !== 'draft') {
      return err(`Alleen concepten kunnen aangepast worden (status nu: ${existing.status}).`)
    }

    let normalized = existing.items
    if (items) {
      const productIds = items
        .filter((i) => i.type === 'product' && i.product_id)
        .map((i) => (i as any).product_id as string)
      const productLookup = new Map<string, any>()
      if (productIds.length > 0) {
        const { data: prods } = await sb
          .from('products')
          .select('id, name, description, quantity_value, quantity_unit, price, is_recurring')
          .in('id', productIds)
        for (const p of prods ?? []) productLookup.set(p.id, p)
      }
      try {
        normalized = normalizeItems(items as QuoteItemInput[], productLookup)
      } catch (e) {
        return err((e as Error).message)
      }
    }

    // KOR check
    const { data: isr } = await sb.from('invoice_settings').select('kor_enabled').limit(1).single()
    const newDiscount = discount_percent ?? existing.discount_percent
    const requestedBtw = btw_percent ?? existing.btw_percent
    const effectiveBtw = isr?.kor_enabled ? 0 : requestedBtw
    const totals = calcQuoteTotal(normalized, newDiscount, effectiveBtw)

    const patch: Record<string, unknown> = {
      amount: Math.round(totals.total * 100) / 100,
      discount_percent: newDiscount,
      btw_percent: effectiveBtw,
      items: normalized,
    }
    if (valid_until !== undefined) patch.valid_until = valid_until
    if (notes !== undefined) patch.notes = notes

    const { data: updated, error: upErr } = await sb
      .from('quotes')
      .update(patch)
      .eq('id', id)
      .select('id, number, status, amount, valid_until, discount_percent, btw_percent')
      .single()
    if (upErr) return err(upErr.message)
    return json({ ...updated, totals, kor_applied: !!isr?.kor_enabled })
  },
)

// ============================================================
// BOOTSTRAP
// ============================================================

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stderr is veilig voor logs (stdout is gereserveerd voor MCP-protocol)
  console.error('[klantportaal-mcp] verbonden via stdio')
}

main().catch((e) => {
  console.error('[klantportaal-mcp] fatal:', e)
  process.exit(1)
})
