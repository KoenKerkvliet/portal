# Klantportaal MCP-server

MCP-server (stdio) waarmee een AI-assistent toegang krijgt tot de Klantportaal-database
om klanten/projecten/producten te lezen en concept-offertes op te stellen.

De server gebruikt de Supabase **service-role key** en omzeilt daarmee RLS — draai 'm
alleen lokaal en geef de key niet door aan derden.

## Tools

### Klanten / projecten / producten
| Tool | Doel |
| --- | --- |
| `list_clients` | Klanten zoeken op naam/email/bedrijf |
| `list_projects` | Projecten met gekoppelde klanten + notificatie-flags |
| `list_products` | Producten/diensten zoeken |

### Offertes
| Tool | Doel |
| --- | --- |
| `list_quotes` | Bestaande offertes filteren (zonder regels) |
| `get_quote` | Volledige offerte (incl. regels en ondertekening) |
| `get_quote_settings` | Prefix, jaar-formaat, startnummer + KOR-status |
| `create_quote` | Concept-offerte aanmaken (status `draft`, nummer + totaal automatisch) |
| `update_quote` | Concept-offerte bijwerken (alleen status `draft`) |

### Formulieren
| Tool | Doel |
| --- | --- |
| `list_forms` | Alle formulieren (samenvatting) |
| `get_form` | Volledige formulier-JSON (gebruik dit vóór `update_form`) |
| `create_form` | Nieuw formulier |
| `update_form` | Formulier bijwerken — `steps` wordt volledig vervangen, bestaande veld-id's worden behouden als je ze meestuurt |
| `duplicate_form` | Kopie maken (nieuwe id's voor stappen/velden) |

### Fase-templates
| Tool | Doel |
| --- | --- |
| `list_templates` | Alle templates (filter optioneel op fase) |
| `get_template` | Volledige template-JSON met stappen en card-elementen |
| `create_template` | Nieuw template |
| `update_template` | Template bijwerken — `steps` wordt volledig vervangen |
| `duplicate_template` | Kopie maken (nieuwe id's voor stappen/elementen) |

Het versturen van een offerte naar de klant gebeurt **niet** via de MCP-server —
dat blijft een handmatige actie in de admin-UI om een ongelukkige automatische verzending te voorkomen.
Verwijderen van formulieren of templates ook niet — die houdt de UI met z'n bevestigingsdialog.

## Setup

```bash
cd mcp-server
npm install
cp .env.example .env
# vul SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY in
npm run build
```

De server wordt automatisch geregistreerd via het `.mcp.json`-bestand in de project-root,
zodat Claude Code 'm bij het opstarten oppakt.

## Lokaal draaien (sanity-check)

```bash
npm run dev
```

Dit start de server op stdio — hij verwacht MCP-berichten op stdin. Om uit te testen
of imports/credentials werken: laat 'm even draaien en kijk of de stderr-regel
`[klantportaal-mcp] verbonden via stdio` verschijnt zonder errors.

## Schrijfveiligheid

- `create_quote` zet status altijd op `draft`
- `update_quote` weigert offertes met status ≠ `draft`
- Verzenden / accepteren / declinen wordt bewust niet aangeboden
- Geen `delete_*`-tools — verwijderen blijft in de UI met confirm-dialog
- Bij `update_form` / `update_template` blijven veld- en stap-id's behouden als je ze meegeeft;
  ontbrekende id's worden aangevuld zodat eerdere submissions niet wegvallen
