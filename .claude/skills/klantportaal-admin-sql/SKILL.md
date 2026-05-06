---
name: klantportaal-admin-sql
description: Use this skill whenever the user wants to inspect, create, edit, or split data in this Klantportaal project — including offertes, facturen, aanbetalingsfacturen, restfacturen, producten, formulieren/vragenlijsten en fase-templates (project cards). Triggers on Dutch terms ("offerte", "factuur", "aanbetaling", "restfactuur", "testofferte", "akkoord", "omzetten", "product toevoegen", "prijs aanpassen", "formulier", "vragenlijst", "veld toevoegen", "template", "fase template", "card", "stap toevoegen", "intake/design/development/oplevering/onderhoud") and English equivalents ("quote", "invoice", "deposit invoice", "remainder", "split", "add product", "form", "phase template"). Covers SQL templates against Supabase plus the front-end conventions (Tiptap HTML, jsonb shapes for steps/items/fields/elements). Use even when the user only asks for one step (e.g. "zet deze offerte op akkoord", "voeg dit product toe", "pas vragenlijst aan") — the templates and constants here save a round of schema discovery against the database.
---

# Klantportaal — admin data operations

Run all SQL via `mcp__supabase__execute_sql`. The templates below mirror the production code in `src/pages/admin/` (QuoteBuilder, InvoiceBuilder, Invoices split logic, Templates, Forms, Products) — schemas are stable, but rerun a quick `information_schema.columns` check if a query fails.

## Before you run

- **Verify product/form/template IDs** with `SELECT id, code, ... FROM <table> WHERE ...` — IDs are UUIDs and not stable across environments.
- **Check existing numbers** before inserting offertes/facturen:
  - Test quotes/invoices: `SELECT number FROM <table> WHERE is_test = true ORDER BY created_at DESC` — next free is max(`int after TEST-`) + 1, padded to ≥3 digits (`src/lib/testNumbering.ts`).
  - Remainder invoices: `SELECT number FROM invoices WHERE has_temp_number = true AND number ~ '^TMP-[0-9]+$'` — next is max + 1.
- **Confirm with the user before destructive steps** (deleting test data, status → 'paid', renaming product codes used in past offertes). Edits/inserts on test data normally don't need confirmation.
- **Apostrophes in SQL string literals must be doubled** (`pagina''s`, `thema''s`).

## Key constants

| Item | Value | Source |
|---|---|---|
| Default deposit % | **30** | `DEPOSIT_PERCENTAGE` in `src/pages/admin/Invoices.tsx` |
| Default BTW | **21** | column default |
| Default discount | **0** | column default |
| Default valid_until | quote-date + ~30 days | convention |
| Default due_date | invoice-date + 14 days | convention |
| Test number format | `TEST-NNN` | `src/lib/testNumbering.ts` |
| Temp remainder number | `TMP-N` | Invoices.tsx |
| Phase keys | `'intake' · 'design' · 'development' · 'oplevering' · 'onderhoud'` | exact strings |
| Tiptap HTML tags | `<p>`, `<h2>`, `<h3>`, `<strong>`, `<em>`, `<ul><li><p>…</p></li></ul>`, `<ol>`, `<a>`, `<blockquote>` | StarterKit + Link extension |
| Lucide icons used in cards | `pen-tool`, `message-square`, `clock`, `book-open`, `file-text`, `credit-card`, … | any [lucide](https://lucide.dev) name |

## Canonical test fixtures

Useful when the user just says "een testofferte / testfactuur":

- Project **Testdomein**: `fa3179ae-62a5-4860-9331-7cf60f891682`
- Client **Gus**: `5389ca41-8887-4bfa-b557-bc9a1854e7ef` (`koenkerkvliet+gus@gmail.com`)

Verify with a quick `SELECT` — the user may have cleaned up.

---

# 1 · Quotes & invoices

## Items jsonb schema (quotes.items + invoices.items)

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

## Amount column semantics

- **`quotes.amount`** = subtotal *pre-BTW* (sum of `price × quantity` for all items). No discount, no BTW applied.
- **`invoices.amount`** = total *including BTW* (after discount). Separate `invoices.subtotal` holds the pre-BTW figure.
- Rounding: PostgreSQL `ROUND(numeric, 2)` rounds half away from zero, matching `Math.round` in the JS split code. Splitting yields a 1-cent rounding artifact (e.g. 30%/70% of €2099.35 sums to €2099.36) — expected and matches production.

## 1.1 — Create a (test) quote

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

## 1.2 — Set quote to accepted

```sql
UPDATE quotes
SET status = 'accepted',
    accepted_at = now(),
    accepted_name = '<klantnaam>',
    accepted_remarks = '<optional remarks>'
WHERE id = '<quote_id>'
RETURNING number, status, accepted_at;
```

For declined: `status = 'declined'`, `declined_at = now()`, `declined_reason = '...'`.

## 1.3 — Convert accepted quote to invoice

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

## 1.4 — Split invoice into deposit (30%) + remainder (70%)

The original invoice **becomes** the deposit (keeps its number, items get replaced with one line). A new remainder invoice with a `TMP-N` number is inserted alongside.

### 1.4a — Convert original to deposit

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
  AND NOT is_deposit_invoice AND NOT is_remainder_invoice  -- guard against double-split
RETURNING id, number, subtotal, amount, is_deposit_invoice, deposit_percentage;
```

### 1.4b — Insert remainder with TMP-N

`<remainder_subtotal>` = `original_subtotal - ROUND(original_subtotal * 0.30, 2)`. Compute it before running 1.4a (so you still have the pre-split number) or fetch from a prior `SELECT`.

```sql
INSERT INTO invoices (
  number, project_id, client_id, amount, subtotal,
  status, due_date, invoice_date, is_test,
  client_name, client_email, client_address,
  items, discount_percent, btw_percent, notes,
  is_remainder_invoice, has_temp_number, deposit_percentage, parent_invoice_id
)
SELECT
  'TMP-<N>',                      -- next free TMP-N
  i.project_id, i.client_id,
  ROUND(<remainder_subtotal> * (1 + i.btw_percent/100.0), 2),
  <remainder_subtotal>,
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

---

# 2 · Products

Table `products` (`src/pages/admin/Products.tsx`). Description supports HTML (Tiptap StarterKit).

## Conventions

- `code` — short uppercase + hyphens (`WEB-BRONZE`, `DOM-HOST`, `MAIL-10`). For year-suffixed variants append `-YYYY` (e.g. `WEB-BRONZE-2026`); the user's preference is to keep the old code alongside.
- `quantity_value` / `quantity_unit` — e.g. `1` / `'stuks'`, `12` / `'maanden'`, `1` / `'stuk'`.
- `is_recurring` — `true` for subscription-like items (hosting, mail).
- `description` — HTML, supported tags listed in the constants table. Match the existing pattern: `<p><strong>Pakket</strong></p><ul><li><p>Bullet</p></li></ul>`.

## 2.1 — Add a product

```sql
INSERT INTO products (code, name, description, quantity_value, quantity_unit, price, is_recurring)
VALUES (
  '<CODE>',
  '<Naam>',
  '<p><strong>Pakket</strong></p><ul><li><p>Bullet 1</p></li><li><p>Bullet 2</p></li></ul>',
  1, 'stuks', 0.00, false
)
RETURNING id, code, name, price;
```

## 2.2 — Update price or description

```sql
UPDATE products
SET price = <new_price>
    -- , description = '<new HTML>'
    -- , name = '<new naam>'
WHERE code = '<CODE>'
RETURNING id, code, name, price;
```

## 2.3 — Add a year-suffixed variant alongside an existing product

When a price changes mid-year, prefer **inserting a new variant** rather than overwriting. Past offertes/facturen keep working because line items snapshot the name/description at the time of creation; the FK is `product_id`. Example: `WEB-BRONZE` (€349) stays, `WEB-BRONZE-2026` (€795) added next to it.

---

# 3 · Forms (vragenlijsten)

Table `forms` (`src/pages/admin/Forms.tsx`). Used by client form pages and referenced by phase-template button elements via `formId`.

## `steps` jsonb schema

```
[
  { id, title, fields: [
      { id, type, label, placeholder, required, options? }
  ] }
]
```

## Field types

`heading`, `text`, `textarea`, `email`, `phone`, `select`, `checkbox`, `radio`, `date`, `number`. `heading` is a section divider with no input. `options` (array of `{ id, label }`) only applies to `select` / `radio` / `checkbox`.

## 3.1 — Replace a form's steps

Editing = overwriting `steps` wholesale. Use `gen_random_uuid()::text` for every `id`. Apostrophes in labels/placeholders doubled.

```sql
UPDATE forms
SET steps = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'title', 'Stap 1 — Algemeen',
    'fields', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'type', 'heading',  'label', 'Even kennismaken',  'placeholder', '', 'required', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'type', 'text',     'label', 'Bedrijfsnaam',      'placeholder', '',                    'required', true),
      jsonb_build_object('id', gen_random_uuid()::text, 'type', 'textarea', 'label', 'Wat doe je?',       'placeholder', 'Korte omschrijving', 'required', true),
      jsonb_build_object('id', gen_random_uuid()::text, 'type', 'select',   'label', 'Status',            'placeholder', '',                    'required', false,
        'options', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid()::text, 'label', 'Optie A'),
          jsonb_build_object('id', gen_random_uuid()::text, 'label', 'Optie B')
        )
      )
    )
  )
  -- additional jsonb_build_object(...) for more steps
)
WHERE id = '<form_id>'
RETURNING id, title, jsonb_array_length(steps) AS aantal_stappen;
```

## 3.2 — Verify

```sql
SELECT step->>'title' AS stap, jsonb_array_length(step->'fields') AS velden
FROM forms, jsonb_array_elements(steps) AS step
WHERE id = '<form_id>';
```

## 3.3 — Create a new form

```sql
INSERT INTO forms (title, description, steps)
VALUES ('<Titel>', '<korte beschrijving>', jsonb_build_array(/* ...same shape... */))
RETURNING id, title;
```

---

# 4 · Phase templates (project cards)

Table `phase_templates` (`src/pages/admin/Templates.tsx`). Each row defines the cards/steps shown for one fase. `project_phases.template_id` links a project's instantiated fase to its template.

## Top-level columns

- `phase` — one of the phase keys
- `title`, `description` — admin-facing labels
- `content` — short HTML shown above the steps (Tiptap)
- `steps` — jsonb array of `PhaseStep` (see below)
- `show_file_footer` — append the file-sharing URL footer to the card
- `show_feedback_footer` — append the feedback URL footer

## `steps` jsonb schema

```
[
  { id, title, description, completed: false, faded?: true, elements: [CardElement] }
]
```

`completed: false` is the on-create default (the client's own progress flips it). `faded: true` greys the step out — used for "future fase" hints in the Intake template.

## CardElement schema

```
{ id, type, data: { ... } }
```

| `type` | `data` keys | Notes |
|---|---|---|
| `text` | `content` | Plain text or short HTML |
| `icon` | `name`, `color` | `name` = lucide icon (e.g. `pen-tool`, `message-square`, `clock`, `book-open`, `file-text`, `credit-card`). `color` = `#hex` |
| `dynamic` | `field` | Pulls from `projects` row. Common fields: `start_meeting_at`, `file_sharing_url`, `feedback_url`, `staging_url`, `due_date` |
| `button` | `action`, `label`, `variant`, plus action-specific keys | See actions below |
| `link` | `url`, `label` | External link |

## Button actions

| `action` | Extra keys | Behaviour |
|---|---|---|
| `url` | `url` | External URL |
| `form` | `formId`, `formTitle` | Opens a form (`forms.id` + display title) |
| `quote` | (none) | Most recent quote for the project |
| `assignment` | `url` | Opdrachtbeschrijving (URL points to a doc) |
| `invoice` | (none) | Most recent invoice |
| `contentpage` | `contentPageId` | Opens a content page |
| `styleguide` / `homepage` / `contactpage` | (none) | Design-fase preview links |
| `staging` | (none) | Uses `projects.staging_url` |

`variant`: `'primary'` (filled) or `'outline'` (outlined). Typical pattern per step: one `icon` + one `text` + one `button`.

## 4.1 — Replace a template's steps

```sql
UPDATE phase_templates
SET steps = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'title', 'Vragenlijst',
    'description', 'Vul voorafgaand aan ons kennismakingsgesprek de vragenlijst in.',
    'completed', false,
    'elements', jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'type', 'icon',
        'data', jsonb_build_object('name', 'pen-tool', 'color', '#9e86ff')
      ),
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'type', 'text',
        'data', jsonb_build_object('content', 'Vul de vragenlijst in voorafgaand aan het startgesprek.')
      ),
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'type', 'button',
        'data', jsonb_build_object(
          'action', 'form',
          'formId', '<forms.id>',
          'formTitle', 'Vragenlijst',
          'label', 'Vragenlijst invullen',
          'variant', 'outline',
          'url', ''
        )
      )
    )
  )
  -- more steps; add 'faded', true on the jsonb_build_object for greyed-out future steps
)
WHERE id = '<template_id>'
RETURNING id, phase, title, jsonb_array_length(steps) AS stappen;
```

## 4.2 — Toggle footer flags / update content

```sql
UPDATE phase_templates
SET content = '<p>Korte intro boven de stappen.</p>',
    show_file_footer = true,
    show_feedback_footer = false
WHERE id = '<template_id>';
```

## 4.3 — Verify

```sql
SELECT phase, title,
       jsonb_array_length(steps) AS aantal_steps,
       length(content) AS content_lengte,
       show_file_footer, show_feedback_footer
FROM phase_templates ORDER BY phase;
```

---

# Common follow-ups

- **Mark a deposit invoice as sent**: `UPDATE invoices SET status = 'sent' WHERE id = '<id>'`. Statuses: `draft`, `sent`, `paid`, `overdue`.
- **Cleanup test data**: `DELETE FROM invoices WHERE is_test = true AND number IN (...)`; same for `quotes`. Confirm with the user first — the `is_test` flag is the safety net.
- **Convert TMP-N to a real invoice number**: when the deposit is paid and the user wants the remainder finalized, generate a number via `invoice_settings.invoice_prefix` + year + next number, then `UPDATE invoices SET number='...', has_temp_number=false WHERE id='...'`.
- **List all phase templates**: `SELECT phase, title, jsonb_array_length(steps) FROM phase_templates ORDER BY phase, created_at`.
- **Find which template a project uses for a phase**: `SELECT pp.phase, pp.template_id, pt.title FROM project_phases pp LEFT JOIN phase_templates pt ON pt.id = pp.template_id WHERE pp.project_id = '<id>'`.

# Why this skill exists

These workflows touch multiple tables with subtle conventions: `quotes.amount` vs `invoices.amount` semantics, the deposit-replaces-original pattern with TMP-numbering, the rounding behaviour matching JS `Math.round`, the Tiptap-style HTML in product/content descriptions, and the deeply nested jsonb shapes for form fields and phase-template card elements. Every time we re-derive these from the schema we lose 15+ minutes; this skill collapses that to one read.
