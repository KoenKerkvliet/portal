---
name: klantportaal-offertes
description: Use this skill whenever the user wants to create, accept, convert, or split offertes/facturen in this Klantportaal project — including testofferten, omzetten naar factuur, aanbetalingsfactuur (deposit invoice) en restfactuur. Triggers on Dutch terms ("offerte", "factuur", "aanbetaling", "restfactuur", "testofferte", "akkoord", "omzetten") and English equivalents ("quote", "invoice", "deposit invoice", "remainder", "split"). Use it even when the user only asks for one step (e.g. "zet deze offerte op akkoord") — the SQL templates and constants here save a round of schema discovery against Supabase.
---

# Klantportaal — Offerte- & factuurworkflow

The SQL templates below mirror the production code in `src/pages/admin/QuoteBuilder.tsx`, `InvoiceBuilder.tsx`, and `Invoices.tsx` (split logic). Run them via `mcp__supabase__execute_sql`. Schemas are stable; rerun a quick `SELECT column_name FROM information_schema.columns ...` only if a query fails.

## Before you run

- **Verify product IDs** via `SELECT id, code, name, price, quantity_value, quantity_unit, is_recurring FROM products WHERE code IN (...)` — IDs are UUIDs and not stable across environments.
- **Check existing numbers** before inserting:
  - Test quotes/invoices: `SELECT number FROM quotes/invoices WHERE is_test = true ORDER BY created_at DESC` to find the next free `TEST-NNN`. The generator (src/lib/testNumbering.ts) takes max(int after `TEST-`) + 1, padded to 3 digits.
  - Remainder invoices: `SELECT number FROM invoices WHERE has_temp_number = true AND number ~ '^TMP-[0-9]+$'` — next free is max + 1.
- **Confirm with the user** before destructive steps (deleting test data, switching status to 'paid', etc.). Inserts/updates on test data are normally fine without asking.

## Key constants

| Item | Value | Source |
|---|---|---|
| Default deposit % | **30** | `DEPOSIT_PERCENTAGE` in `src/pages/admin/Invoices.tsx` |
| Default BTW | **21** | column default on `quotes.btw_percent` / `invoices.btw_percent` |
| Default discount | **0** | column default |
| Default valid_until offset | quote-date + ~30 days | convention; user often shortens to +14 |
| Default due_date offset | invoice-date + 14 days | convention |
| Test number format | `TEST-NNN` (3-digit pad min) | `src/lib/testNumbering.ts` |
| Temp remainder number | `TMP-N` | `nextTempNumber` in Invoices.tsx |

## Items jsonb schema

Both `quotes.items` and `invoices.items` use the same shape:

```json
{
  "id": "<uuid>",
  "name": "<product name>",
  "type": "product",
  "unit": "stuks|maanden|stuk",
  "price": 1495,
  "quantity": 1,
  "product_id": "<uuid>",
  "description": "<HTML or plain text>",
  "is_recurring": false
}
```

Build with `jsonb_build_array(jsonb_build_object(...))` and use `gen_random_uuid()::text` for `id`.

## Amount column semantics (important — quotes vs invoices differ)

- **`quotes.amount`** = subtotal *pre-BTW* (sum of `price × quantity` for all items). No discount, no BTW applied.
- **`invoices.amount`** = total *including BTW* (after discount). Separate `invoices.subtotal` column holds the pre-BTW figure.
- Rounding: PostgreSQL `ROUND(numeric, 2)` rounds half away from zero on `numeric` type, matching `Math.round` in the JS split code. Splitting yields a 1-cent rounding artifact (e.g. 30%/70% of €2099.35 sums to €2099.36) — this is expected and matches the production code.

## Canonical test fixtures (Klantportaal-specific)

Useful when the user just says "een testofferte":

- Project **Testdomein**: `fa3179ae-62a5-4860-9331-7cf60f891682`
- Client **Gus**: `5389ca41-8887-4bfa-b557-bc9a1854e7ef` (`koenkerkvliet+gus@gmail.com`)

Verify these still exist with a quick `SELECT` — the user may have cleaned them up.

---

## Step 1 — Create a (test) quote

```sql
INSERT INTO quotes (
  project_id, client_id, number, amount, status, valid_until,
  is_test, items, discount_percent, btw_percent, notes
) VALUES (
  '<project_id>',
  '<client_id>',
  'TEST-NNN',                        -- or generated regular number
  <subtotal_pre_btw>,                -- sum of price*quantity
  'draft',
  CURRENT_DATE + INTERVAL '30 days',
  true,                              -- is_test
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'name', '<product name>',
      'type', 'product',
      'unit', '<unit>',
      'price', <price>,
      'quantity', <qty>,
      'product_id', '<product_uuid>',
      'description', '<desc>',
      'is_recurring', <bool>
    )
    -- additional jsonb_build_object(...) items as needed
  ),
  0, 21,
  '<notes>'
)
RETURNING id, number, amount, status;
```

## Step 2 — Set quote to accepted

```sql
UPDATE quotes
SET status = 'accepted',
    accepted_at = now(),
    accepted_name = '<klantnaam>',
    accepted_remarks = '<optional remarks>'
WHERE id = '<quote_id>'
RETURNING number, status, accepted_at;
```

For a declined flow: `status = 'declined'`, `declined_at = now()`, `declined_reason = '...'`.

## Step 3 — Convert accepted quote to invoice

Computes total = subtotal × (1 - discount/100) × (1 + btw/100). Uses `INSERT ... SELECT` so all metadata is copied in one shot.

```sql
INSERT INTO invoices (
  number, project_id, client_id, amount, subtotal,
  status, due_date, invoice_date, is_test,
  client_name, client_email, client_address,
  items, discount_percent, btw_percent, notes
)
SELECT
  '<new_invoice_number>',         -- TEST-NNN for test, or generated via invoice_settings prefix
  q.project_id,
  q.client_id,
  ROUND(q.amount * (1 - q.discount_percent/100.0) * (1 + q.btw_percent/100.0), 2) AS amount,
  ROUND(q.amount * (1 - q.discount_percent/100.0), 2) AS subtotal,
  'draft',
  (CURRENT_DATE + INTERVAL '14 days')::date,
  CURRENT_DATE,
  q.is_test,
  c.name,
  c.email,
  COALESCE(c.company, ''),
  q.items,
  q.discount_percent,
  q.btw_percent,
  'Omgezet vanuit offerte ' || q.number
FROM quotes q
JOIN clients c ON c.id = q.client_id
WHERE q.id = '<quote_id>'
RETURNING id, number, amount, subtotal, is_test;
```

## Step 4 — Split invoice into deposit (30%) + remainder (70%)

The original invoice **becomes** the deposit (keeps its number, items get replaced by a single line). A new remainder invoice with a `TMP-N` number is inserted alongside.

### 4a. Convert original to deposit

```sql
UPDATE invoices
SET items = jsonb_build_array(
              jsonb_build_object(
                'id', gen_random_uuid()::text,
                'type', 'product',
                'name', 'Aanbetaling 30%',
                'description', 'Aanbetaling van 30% op opdracht (factuur ' || number || ').',
                'quantity', 1,
                'unit', 'stuk',
                'price', ROUND(subtotal * 0.30, 2)
              )
            ),
    subtotal = ROUND(subtotal * 0.30, 2),
    amount   = ROUND(ROUND(subtotal * 0.30, 2) * (1 + btw_percent/100.0), 2),
    discount_percent = 0,
    is_deposit_invoice = true,
    deposit_percentage = 30
WHERE id = '<invoice_id>'
RETURNING id, number, subtotal, amount, is_deposit_invoice, deposit_percentage;
```

> ⚠️ The `subtotal = ROUND(subtotal * 0.30, 2)` line uses the **original** subtotal because the SET clauses see the row's old values, but be aware: if you re-run on an already-split invoice, you'd be splitting a split. Guard with `WHERE NOT is_deposit_invoice AND NOT is_remainder_invoice`.

### 4b. Insert remainder with TMP-N number

```sql
INSERT INTO invoices (
  number, project_id, client_id, amount, subtotal,
  status, due_date, invoice_date, is_test,
  client_name, client_email, client_address,
  items, discount_percent, btw_percent, notes,
  is_remainder_invoice, has_temp_number, deposit_percentage, parent_invoice_id
)
SELECT
  'TMP-<N>',                      -- next free TMP-N (see "Before you run")
  i.project_id, i.client_id,
  ROUND(<remainder_subtotal> * (1 + i.btw_percent/100.0), 2),
  <remainder_subtotal>,           -- = original_subtotal_pre_split - deposit_subtotal
  'draft',
  i.due_date, i.invoice_date, i.is_test,
  i.client_name, i.client_email, i.client_address,
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'product',
      'name', 'Restant 70%',
      'description', 'Restant van 70% na aanbetaling op opdracht (origineel: ' || i.number || ').',
      'quantity', 1,
      'unit', 'stuk',
      'price', <remainder_subtotal>
    )
  ),
  0, i.btw_percent, i.notes,
  true, true, 30, i.id
FROM invoices i
WHERE i.id = '<deposit_invoice_id>'
RETURNING id, number, amount, subtotal, parent_invoice_id;
```

`<remainder_subtotal>` = `original_subtotal - ROUND(original_subtotal * 0.30, 2)`. Compute it before the UPDATE in 4a (so you still have the pre-split number), or fetch it from the user / a prior `SELECT`.

## Tip — combine 4a + 4b in one transaction

If running both as one SQL call, capture the pre-split subtotal in a CTE so step 4a doesn't lose it:

```sql
WITH original AS (
  SELECT id, subtotal AS orig_subtotal, btw_percent, project_id, client_id,
         due_date, invoice_date, is_test, client_name, client_email, client_address,
         number AS orig_number, notes
  FROM invoices WHERE id = '<invoice_id>'
),
deposit_update AS (
  UPDATE invoices SET ... -- as in 4a, using o.orig_subtotal
  FROM original o WHERE invoices.id = o.id
  RETURNING ...
)
INSERT INTO invoices (...) SELECT ... FROM original o, deposit_update d ...
```

For most calls the two-statement version is clearer and safer — only collapse it when the user wants atomicity.

## Common follow-ups

- **Set deposit invoice to "verzonden"**: `UPDATE invoices SET status = 'sent' WHERE id = '<id>'`. Statuses seen: `draft`, `sent`, `paid`, `overdue`.
- **Cleanup test data**: `DELETE FROM invoices WHERE is_test = true AND number IN (...)`; `DELETE FROM quotes WHERE is_test = true AND number IN (...)`. Confirm with the user first — the `is_test` flag is the safety net.
- **Convert TMP-N to a real invoice number**: when the deposit is paid and the user wants the remainder finalized, generate a number via `invoice_settings.invoice_prefix` + year + next number, then `UPDATE invoices SET number='...', has_temp_number=false WHERE id='...'`.

## Why this skill exists

The quote→invoice→split workflow involves three tables (`quotes`, `invoices`, `clients`) plus subtle conventions: which `amount` column means subtotal vs total, the deposit-replaces-original pattern, the TMP-numbering, and the rounding behaviour that has to match the JS code. Every time we re-derive these from the schema we lose ~15 minutes; this skill collapses that to one read.
