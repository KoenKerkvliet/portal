// De tools van de klantportaal-connector. Elke tool doet wat de admin-UI ook
// doet, met dezelfde regels - zie de opmerkingen per tool voor waar dat
// vandaan komt. Wat de UI via een mail naar de klant laat lopen (een fase
// wijzigen, een factuur versturen, strippen afboeken met de timer) doet deze
// connector stil of niet: klanten mailen blijft een handeling in de UI.
//
// Elke wijziging komt in mcp_audit_log met actor 'claude-connector', zodat je
// kunt nalezen wat er is veranderd.

// deno-lint-ignore-file no-explicit-any
type DB = any
type Invoer = Record<string, unknown>

interface Gereedschap {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const ACTOR = 'claude-connector'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
const DATUM = 'Datum als JJJJ-MM-DD.'
const WERK_CATEGORIEEN = [
  'onderhoud', 'update', 'bugfix', 'content', 'design',
  'development', 'seo', 'beveiliging', 'overleg', 'overig',
]
const TX_CATEGORIEEN = ['private_deposit', 'private_withdrawal', 'private_purchase', 'interest']
const FASEN = ['intake', 'design', 'development', 'oplevering', 'onderhoud']

// ------------------------------------------------------------ schema's --

const s = {
  tekst: (description: string) => ({ type: 'string', description }),
  getal: (description: string) => ({ type: 'number', description }),
  bool: (description: string) => ({ type: 'boolean', description }),
  keuze: (opties: string[], description: string) => ({ type: 'string', enum: opties, description }),
  limiet: { type: 'number', description: 'Maximaal aantal resultaten (standaard 50, max 200).' },
}
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
})

const DOMEIN = s.tekst('Domein (project): id, naam of url, bijv. "designpixels.nl".')
const KLANT = s.tekst('Klant: id, naam, bedrijfsnaam of e-mailadres.')
const FACTUUR = s.tekst('Factuur: id of factuurnummer.')
const OFFERTE = s.tekst('Offerte: id of offertenummer.')

export const GEREEDSCHAPPEN: Gereedschap[] = [
  // ------------------------------------------------------------ inzien --
  {
    name: 'overzicht',
    description:
      'Stand van zaken in één keer: openstaande en te late facturen, concepten, onverwerkte ' +
      'banktransacties, ongelezen meldingen, open tickets, onopgeloste chats en actieve domeinen per fase. ' +
      'Goed startpunt voor "hoe staat het ervoor?".',
    inputSchema: obj({}),
  },
  {
    name: 'klanten_zoeken',
    description: 'Zoekt klanten, met hun domeinen.',
    inputSchema: obj({
      zoekterm: s.tekst('Deel van naam, bedrijf of e-mail. Leeg = alle.'),
      status: s.keuze(['active', 'archived', 'alle'], 'Standaard active.'),
      limiet: s.limiet,
    }),
  },
  {
    name: 'domeinen_zoeken',
    description: 'Zoekt domeinen (projecten) met hun klanten, fase en status.',
    inputSchema: obj({
      zoekterm: s.tekst('Deel van naam, url of omschrijving. Leeg = alle.'),
      fase: s.keuze(FASEN, 'Alleen domeinen in deze fase.'),
      status: s.keuze(['active', 'archived', 'alle'], 'Standaard active.'),
      limiet: s.limiet,
    }),
  },
  {
    name: 'domein_details',
    description:
      'Alles over één domein: gegevens, klanten, fases, facturen, offertes, opdrachten, ' +
      'strippenkaart-saldo, recente werkzaamheden en open tickets.',
    inputSchema: obj({ domein: DOMEIN }, ['domein']),
  },
  {
    name: 'facturen_zoeken',
    description:
      'Zoekt facturen. Testfacturen blijven weg tenzij gevraagd. Status: draft = concept, ' +
      'sent = verzonden (openstaand), paid = betaald.',
    inputSchema: obj({
      status: s.keuze(['draft', 'sent', 'paid'], 'Alleen deze status.'),
      alleen_te_laat: s.bool('Alleen verzonden facturen waarvan de vervaldatum voorbij is.'),
      domein: DOMEIN,
      klant: KLANT,
      vanaf: s.tekst(`Factuurdatum vanaf. ${DATUM}`),
      tot: s.tekst(`Factuurdatum tot en met. ${DATUM}`),
      zoekterm: s.tekst('Deel van het factuurnummer of de klantnaam op de factuur.'),
      inclusief_test: s.bool('Ook testfacturen tonen.'),
      limiet: s.limiet,
    }),
  },
  {
    name: 'factuur_details',
    description: 'Eén factuur volledig, met regels en de banktransacties die eraan gekoppeld zijn.',
    inputSchema: obj({ factuur: FACTUUR }, ['factuur']),
  },
  {
    name: 'offertes_zoeken',
    description: 'Zoekt offertes. Status: draft, sent, accepted, declined.',
    inputSchema: obj({
      status: s.keuze(['draft', 'sent', 'accepted', 'declined'], 'Alleen deze status.'),
      domein: DOMEIN,
      zoekterm: s.tekst('Deel van het offertenummer.'),
      inclusief_test: s.bool('Ook testoffertes tonen.'),
      limiet: s.limiet,
    }),
  },
  {
    name: 'offerte_details',
    description: 'Eén offerte volledig, met regels en het akkoord of de afwijzing.',
    inputSchema: obj({ offerte: OFFERTE }, ['offerte']),
  },
  {
    name: 'werkzaamheden_zoeken',
    description: 'Zoekt de werklog (werkzaamheden per domein), met het totaal aantal minuten.',
    inputSchema: obj({
      domein: DOMEIN,
      vanaf: s.tekst(`Vanaf. ${DATUM}`),
      tot: s.tekst(`Tot en met. ${DATUM}`),
      categorie: s.keuze(WERK_CATEGORIEEN, 'Alleen deze categorie.'),
      limiet: s.limiet,
    }),
  },
  {
    name: 'strippenkaarten',
    description:
      'Strippenkaarten en saldo. Eén strip is 5 minuten. Met een domein: kaarten en de laatste ' +
      'afboekingen van dat domein. Zonder: alle actieve kaarten met hun saldo.',
    inputSchema: obj({ domein: DOMEIN }),
  },
  {
    name: 'meldingen',
    description: 'Admin-meldingen (offerte geaccepteerd, nieuw ticket, akkoord op een ontwerp, …).',
    inputSchema: obj({
      alleen_ongelezen: s.bool('Standaard true.'),
      limiet: s.limiet,
    }),
  },
  {
    name: 'chats_zoeken',
    description: 'Gesprekken van klanten met de portaal-assistent, nieuwste eerst.',
    inputSchema: obj({
      alleen_onopgelost: s.bool('Alleen gesprekken met een vraag die de assistent niet kon beantwoorden.'),
      limiet: s.limiet,
    }),
  },
  {
    name: 'chat_lezen',
    description: 'Alle berichten van één chatgesprek.',
    inputSchema: obj({ gesprek_id: s.tekst('Id van het gesprek (uit chats_zoeken).') }, ['gesprek_id']),
  },
  {
    name: 'tickets_zoeken',
    description: 'Supporttickets van klanten. Status: open, in_progress, resolved, closed.',
    inputSchema: obj({
      status: s.keuze(['open', 'in_progress', 'resolved', 'closed', 'openstaand'], 'openstaand = open of in_progress.'),
      domein: DOMEIN,
      limiet: s.limiet,
    }),
  },
  {
    name: 'ticket_lezen',
    description: 'Eén ticket met alle reacties.',
    inputSchema: obj({ ticket: s.tekst('Id of ticketnummer.') }, ['ticket']),
  },

  // -------------------------------------------------------- financiën --
  {
    name: 'banktransacties_zoeken',
    description:
      'Zoekt bunq-transacties. Bedrag is positief voor binnenkomend, negatief voor uitgaand. ' +
      'Een transactie is verwerkt als hij aan precies één ding hangt: een factuur, een kostenpost ' +
      'of een categorie (private_deposit, private_withdrawal, private_purchase, interest).',
    inputSchema: obj({
      alleen_onverwerkt: s.bool('Alleen transacties die nog nergens aan gekoppeld zijn.'),
      richting: s.keuze(['in', 'uit'], 'Alleen binnenkomend of alleen uitgaand.'),
      vanaf: s.tekst(`Boekdatum vanaf. ${DATUM}`),
      tot: s.tekst(`Boekdatum tot en met. ${DATUM}`),
      zoekterm: s.tekst('Deel van de omschrijving of de naam van de tegenpartij.'),
      bedrag: s.getal('Precies dit bedrag (in of uit), bijv. 121.00.'),
      limiet: s.limiet,
    }),
  },
  {
    name: 'kosten_zoeken',
    description: 'Zoekt kostenposten (uitgaven), met totalen excl. en incl. btw.',
    inputSchema: obj({
      vanaf: s.tekst(`Datum vanaf. ${DATUM}`),
      tot: s.tekst(`Datum tot en met. ${DATUM}`),
      categorie: s.tekst('Alleen deze categorie (zie kostencategorieen).'),
      zoekterm: s.tekst('Deel van leverancier, omschrijving of factuurnummer.'),
      limiet: s.limiet,
    }),
  },
  {
    name: 'kostencategorieen',
    description:
      'De categorieën die al voor kostenposten gebruikt zijn, met aantal. Gebruik deze namen bij ' +
      'kostenpost_maken, zodat de indeling consistent blijft.',
    inputSchema: obj({}),
  },
  {
    name: 'financieel_overzicht',
    description:
      'Cijfers over een periode: omzet (verzonden en betaalde facturen op factuurdatum, zoals de ' +
      'financiënpagina), ontvangen betalingen, kosten per categorie, refunds, rente, privé-boekingen ' +
      'en onverwerkte transacties.',
    inputSchema: obj({
      vanaf: s.tekst(`${DATUM} Standaard 1 januari van dit jaar.`),
      tot: s.tekst(`${DATUM} Standaard vandaag.`),
    }),
  },

  // ------------------------------------------------------- wijzigen: geld --
  {
    name: 'banktransactie_labelen',
    description:
      'Koppelt een banktransactie aan een factuur, een kostenpost of een categorie, of haalt de ' +
      'koppeling weg. Een transactie hangt aan precies één ding; een bestaande koppeling wordt ' +
      'vervangen. Koppelen aan een factuur zet die factuur niet vanzelf op betaald - geef daarvoor ' +
      'factuur_op_betaald mee.',
    inputSchema: obj(
      {
        transactie_id: s.tekst('Id van de banktransactie.'),
        koppel_aan: s.keuze(['factuur', 'kostenpost', 'categorie', 'niets'], 'Waaraan.'),
        factuur: FACTUUR,
        kostenpost_id: s.tekst('Id van de kostenpost.'),
        categorie: s.keuze(TX_CATEGORIEEN, 'Privé storting/opname/aankoop, of rente.'),
        factuur_op_betaald: s.bool(
          'Zet de factuur op betaald met de boekdatum als betaaldatum (zoals de automatische bunq-koppeling).',
        ),
      },
      ['transactie_id', 'koppel_aan'],
    ),
  },
  {
    name: 'kostenpost_maken',
    description:
      'Maakt een kostenpost. Met een banktransactie_id worden datum, leverancier en bedrag daaruit ' +
      'overgenomen (tenzij meegegeven) en wordt de transactie meteen aan de kostenpost gekoppeld. ' +
      'Excl. btw en het btw-bedrag worden uit het bedrag incl. btw berekend.',
    inputSchema: obj(
      {
        omschrijving: s.tekst('Waarvoor.'),
        banktransactie_id: s.tekst('Transactie om uit over te nemen en te koppelen.'),
        datum: s.tekst(DATUM),
        leverancier: s.tekst('Leverancier.'),
        categorie: s.tekst('Categorie; gebruik bij voorkeur een bestaande (kostencategorieen).'),
        bedrag_incl_btw: s.getal('Bedrag incl. btw, positief.'),
        btw_percent: s.getal('Btw-percentage: 21, 9 of 0. Standaard 21, of 0 bij een banktransactie (zoals de UI).'),
        factuurnummer: s.tekst('Factuurnummer van de leverancier.'),
        notities: s.tekst('Notities.'),
      },
      ['omschrijving'],
    ),
  },
  {
    name: 'kostenpost_bijwerken',
    description: 'Past een kostenpost aan. Verandert het bedrag of de btw, dan rekent hij de rest opnieuw uit.',
    inputSchema: obj(
      {
        id: s.tekst('Id van de kostenpost.'),
        omschrijving: s.tekst('Waarvoor.'),
        datum: s.tekst(DATUM),
        leverancier: s.tekst('Leverancier.'),
        categorie: s.tekst('Categorie.'),
        bedrag_incl_btw: s.getal('Bedrag incl. btw.'),
        btw_percent: s.getal('Btw-percentage.'),
        factuurnummer: s.tekst('Factuurnummer van de leverancier.'),
        notities: s.tekst('Notities.'),
      },
      ['id'],
    ),
  },
  {
    name: 'factuur_status_zetten',
    description:
      'Zet de status van een factuur: draft, sent of paid. Net als het keuzemenu in de admin: ' +
      'er gaat geen mail naar de klant, ook niet bij sent.',
    inputSchema: obj(
      {
        factuur: FACTUUR,
        status: s.keuze(['draft', 'sent', 'paid'], 'Nieuwe status.'),
        betaald_op: s.tekst(`Betaaldatum bij paid. ${DATUM} Standaard vandaag.`),
      },
      ['factuur', 'status'],
    ),
  },
  {
    name: 'offerte_status_zetten',
    description: 'Zet de status van een offerte, net als het keuzemenu in de admin. Er gaat geen mail uit.',
    inputSchema: obj(
      {
        offerte: OFFERTE,
        status: s.keuze(['draft', 'sent', 'accepted', 'declined'], 'Nieuwe status.'),
      },
      ['offerte', 'status'],
    ),
  },

  // ------------------------------------------------------ wijzigen: werk --
  {
    name: 'werkzaamheid_toevoegen',
    description: 'Voegt een regel toe aan de werklog van een domein. Klanten krijgen hier niets van te zien of te horen.',
    inputSchema: obj(
      {
        domein: DOMEIN,
        titel: s.tekst('Korte titel.'),
        omschrijving: s.tekst('Wat er gedaan is. Gewone tekst; regels blijven regels.'),
        datum: s.tekst(`${DATUM} Standaard vandaag.`),
        duur_minuten: s.getal('Duur in minuten.'),
        categorie: s.keuze(WERK_CATEGORIEEN, 'Standaard onderhoud.'),
        factureerbaar: s.bool('Standaard false.'),
      },
      ['domein', 'titel'],
    ),
  },
  {
    name: 'werkzaamheid_bijwerken',
    description: 'Past een regel in de werklog aan.',
    inputSchema: obj(
      {
        id: s.tekst('Id van de werkzaamheid.'),
        titel: s.tekst('Titel.'),
        omschrijving: s.tekst('Omschrijving (gewone tekst).'),
        datum: s.tekst(DATUM),
        duur_minuten: s.getal('Duur in minuten; 0 haalt hem weg.'),
        categorie: s.keuze(WERK_CATEGORIEEN, 'Categorie.'),
        factureerbaar: s.bool('Factureerbaar.'),
      },
      ['id'],
    ),
  },
  {
    name: 'strippen_afschrijven',
    description:
      'Boekt tijd af van de strippenkaart(en) van een domein, oudste kaart eerst. Eén strip is 5 ' +
      'minuten; minuten worden naar boven afgerond op hele strippen. Anders dan de timer in de UI ' +
      'gaat er geen mail naar de klant.',
    inputSchema: obj(
      {
        domein: DOMEIN,
        omschrijving: s.tekst('Wat er gedaan is.'),
        strippen: s.getal('Aantal strippen.'),
        minuten: s.getal('Of: aantal minuten.'),
        moment: s.tekst('Wanneer, als JJJJ-MM-DD of volledige tijd. Standaard nu.'),
      },
      ['domein', 'omschrijving'],
    ),
  },
  {
    name: 'domein_bijwerken',
    description:
      'Past gegevens van een domein aan. Een andere fase wordt stil gezet: de UI mailt de klant ' +
      'dan, deze tool niet.',
    inputSchema: obj(
      {
        domein: DOMEIN,
        naam: s.tekst('Naam.'),
        omschrijving: s.tekst('Omschrijving.'),
        url: s.tekst('Live url.'),
        staging_url: s.tekst('Staging-url.'),
        file_sharing_url: s.tekst('Link naar gedeelde bestanden.'),
        feedback_title: s.tekst('Titel van de feedbacklink.'),
        feedback_url: s.tekst('Feedbacklink.'),
        deadline: s.tekst(`${DATUM} Geef "geen" om hem weg te halen.`),
        fase: s.keuze(FASEN, 'Huidige fase (stil, zonder mail).'),
        status: s.keuze(['active', 'archived'], 'Actief of gearchiveerd.'),
        factuur_naam: s.tekst('Naam voor op facturen van dit domein.'),
        factuur_email: s.tekst('E-mailadres voor facturen van dit domein.'),
      },
      ['domein'],
    ),
  },
  {
    name: 'klant_bijwerken',
    description: 'Past gegevens van een klant aan, of archiveert hem.',
    inputSchema: obj(
      {
        klant: KLANT,
        naam: s.tekst('Naam.'),
        email: s.tekst('E-mailadres.'),
        telefoon: s.tekst('Telefoonnummer.'),
        bedrijf: s.tekst('Bedrijfsnaam.'),
        status: s.keuze(['active', 'archived'], 'Actief of gearchiveerd.'),
      },
      ['klant'],
    ),
  },
  {
    name: 'meldingen_gelezen',
    description: 'Markeert admin-meldingen als gelezen.',
    inputSchema: obj({
      ids: { type: 'array', items: { type: 'string' }, description: 'Ids van de meldingen.' },
      alle: s.bool('Alle ongelezen meldingen.'),
    }),
  },
  {
    name: 'ticket_status_zetten',
    description: 'Zet de status van een ticket. Er gaat geen mail naar de klant.',
    inputSchema: obj(
      {
        ticket: s.tekst('Id of ticketnummer.'),
        status: s.keuze(['open', 'in_progress', 'resolved', 'closed'], 'Nieuwe status.'),
      },
      ['ticket', 'status'],
    ),
  },
]

// ------------------------------------------------------------ uitvoeren --

type Uitvoerder = (db: DB, invoer: Invoer) => Promise<unknown>

const UITVOERDERS: Record<string, Uitvoerder> = {
  overzicht,
  klanten_zoeken: klantenZoeken,
  domeinen_zoeken: domeinenZoeken,
  domein_details: domeinDetails,
  facturen_zoeken: facturenZoeken,
  factuur_details: factuurDetails,
  offertes_zoeken: offertesZoeken,
  offerte_details: offerteDetails,
  werkzaamheden_zoeken: werkzaamhedenZoeken,
  strippenkaarten,
  meldingen,
  chats_zoeken: chatsZoeken,
  chat_lezen: chatLezen,
  tickets_zoeken: ticketsZoeken,
  ticket_lezen: ticketLezen,
  banktransacties_zoeken: banktransactiesZoeken,
  kosten_zoeken: kostenZoeken,
  kostencategorieen,
  financieel_overzicht: financieelOverzicht,
  banktransactie_labelen: banktransactieLabelen,
  kostenpost_maken: kostenpostMaken,
  kostenpost_bijwerken: kostenpostBijwerken,
  factuur_status_zetten: factuurStatusZetten,
  offerte_status_zetten: offerteStatusZetten,
  werkzaamheid_toevoegen: werkzaamheidToevoegen,
  werkzaamheid_bijwerken: werkzaamheidBijwerken,
  strippen_afschrijven: strippenAfschrijven,
  domein_bijwerken: domeinBijwerken,
  klant_bijwerken: klantBijwerken,
  meldingen_gelezen: meldingenGelezen,
  ticket_status_zetten: ticketStatusZetten,
}

export async function voerUit(db: DB, naam: string, invoer: Invoer): Promise<unknown> {
  const uitvoerder = UITVOERDERS[naam]
  if (!uitvoerder) throw new Error(`Onbekende tool: ${naam}`)
  return await uitvoerder(db, invoer)
}

// ---------------------------------------------------------------- inzien --

async function overzicht(db: DB) {
  const vandaag = vandaagNL()
  const [facturen, onverwerkt, meldingenOngelezen, tickets, chats, domeinen] = await Promise.all([
    rijen(
      db.from('invoices')
        .select('number, status, amount, due_date, client_name, is_recurring, has_temp_number')
        .eq('is_test', false)
        .in('status', ['draft', 'sent']),
    ),
    rijen(
      db.from('bank_transactions')
        .select('amount')
        .is('invoice_id', null)
        .is('expense_id', null)
        .is('category', null),
    ),
    telling(db.from('admin_notifications').select('id', { count: 'exact', head: true }).eq('read', false)),
    telling(db.from('tickets').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress'])),
    telling(db.from('chat_conversations').select('id', { count: 'exact', head: true }).eq('has_unresolved', true)),
    rijen(db.from('projects').select('current_phase').eq('status', 'active')),
  ])

  const echt = facturen.filter((f: any) => !f.is_recurring)
  const verzonden = echt.filter((f: any) => f.status === 'sent')
  const teLaat = verzonden.filter((f: any) => f.due_date && f.due_date < vandaag)
  const concepten = echt.filter((f: any) => f.status === 'draft')

  const perFase: Record<string, number> = {}
  for (const d of domeinen) perFase[d.current_phase ?? 'onbekend'] = (perFase[d.current_phase ?? 'onbekend'] ?? 0) + 1

  return {
    vandaag,
    facturen: {
      openstaand: { aantal: verzonden.length, totaal: som(verzonden, 'amount') },
      te_laat: teLaat.map((f: any) => ({
        nummer: f.number,
        klant: f.client_name,
        bedrag: f.amount,
        vervaldatum: f.due_date,
      })),
      concepten: { aantal: concepten.length, totaal: som(concepten, 'amount') },
      terugkerende_sjablonen: facturen.filter((f: any) => f.is_recurring).length,
    },
    banktransacties_onverwerkt: {
      aantal: onverwerkt.length,
      binnenkomend: rond(onverwerkt.filter((t: any) => t.amount > 0).reduce((a: number, t: any) => a + Number(t.amount), 0)),
      uitgaand: rond(onverwerkt.filter((t: any) => t.amount < 0).reduce((a: number, t: any) => a + Number(t.amount), 0)),
    },
    meldingen_ongelezen: meldingenOngelezen,
    tickets_openstaand: tickets,
    chats_onopgelost: chats,
    actieve_domeinen_per_fase: perFase,
  }
}

async function klantenZoeken(db: DB, inv: Invoer) {
  let vraag = db
    .from('clients')
    .select('id, name, company, email, email_extra, phone, status, created_at, project_clients(projects(id, name, url, status, current_phase))')
  const status = tekst(inv.status) ?? 'active'
  if (status !== 'alle') vraag = vraag.eq('status', status)
  const term = zoekterm(inv.zoekterm)
  if (term) vraag = vraag.or(`name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%`)
  const data = await rijen(vraag.order('name').limit(limiet(inv)))
  return data.map((k: any) => ({
    ...k,
    project_clients: undefined,
    domeinen: (k.project_clients ?? []).map((pc: any) => pc.projects).filter(Boolean),
  }))
}

async function domeinenZoeken(db: DB, inv: Invoer) {
  let vraag = db
    .from('projects')
    .select('id, name, url, status, current_phase, due_date, created_at, project_clients(clients(id, name, company, email))')
  const status = tekst(inv.status) ?? 'active'
  if (status !== 'alle') vraag = vraag.eq('status', status)
  const fase = tekst(inv.fase)
  if (fase) vraag = vraag.eq('current_phase', fase)
  const term = zoekterm(inv.zoekterm)
  if (term) vraag = vraag.or(`name.ilike.%${term}%,url.ilike.%${term}%,description.ilike.%${term}%`)
  const data = await rijen(vraag.order('name').limit(limiet(inv)))
  return data.map((d: any) => ({
    ...d,
    project_clients: undefined,
    klanten: (d.project_clients ?? []).map((pc: any) => pc.clients).filter(Boolean),
  }))
}

async function domeinDetails(db: DB, inv: Invoer) {
  const domein = await zoekDomein(db, inv.domein)
  const id = domein.id
  const [gegevens, klanten, fases, facturen, offertes, opdrachten, kaarten, werk, tickets] = await Promise.all([
    // api_key blijft bewust weg: dat is de sleutel van de website zelf.
    enkele(
      db.from('projects')
        .select('id, name, description, url, staging_url, file_sharing_url, feedback_title, feedback_url, status, current_phase, due_date, start_meeting_at, invoice_name, invoice_email, created_at')
        .eq('id', id),
    ),
    rijen(
      db.from('project_clients')
        .select('notify_invoices, notify_quotes, notify_portal, notify_tickets, notify_punch_cards, clients(id, name, company, email, phone, status)')
        .eq('project_id', id),
    ),
    rijen(db.from('project_phases').select('phase, status, created_at').eq('project_id', id).order('created_at')),
    rijen(
      db.from('invoices')
        .select('id, number, status, amount, invoice_date, due_date, paid_at, is_test, is_recurring, recurrence_interval, recurrence_next_run_at')
        .eq('project_id', id)
        .order('invoice_date', { ascending: false, nullsFirst: false })
        .limit(25),
    ),
    rijen(db.from('quotes').select('id, number, status, amount, valid_until, is_test, created_at').eq('project_id', id).order('created_at', { ascending: false })),
    rijen(db.from('assignments').select('id, title, status, created_at').eq('project_id', id).order('created_at', { ascending: false })),
    rijen(db.from('punch_cards').select('number, total_punches, used_punches, status, is_gift, price, purchased_at, expires_at').eq('project_id', id).order('number')),
    rijen(
      db.from('work_logs')
        .select('id, performed_at, title, duration_minutes, category, billable')
        .eq('project_id', id)
        .order('performed_at', { ascending: false })
        .limit(10),
    ),
    rijen(db.from('tickets').select('id, number, title, status, created_at').eq('project_id', id).in('status', ['open', 'in_progress'])),
  ])

  const actief = kaarten.filter((k: any) => k.status === 'active')
  const over = actief.reduce((a: number, k: any) => a + (k.total_punches - k.used_punches), 0)

  return {
    ...gegevens,
    klanten: klanten.map((pc: any) => ({ ...pc.clients, meldingen: { ...pc, clients: undefined } })),
    fases,
    facturen,
    offertes,
    opdrachten,
    strippenkaarten: { saldo_strippen: over, saldo_minuten: over * 5, kaarten },
    recente_werkzaamheden: werk,
    open_tickets: tickets,
  }
}

async function facturenZoeken(db: DB, inv: Invoer) {
  const vandaag = vandaagNL()
  let vraag = db
    .from('invoices')
    .select('id, number, status, amount, subtotal, btw_percent, discount_percent, invoice_date, due_date, paid_at, client_name, client_email, is_test, is_recurring, recurrence_interval, is_deposit_invoice, is_remainder_invoice, has_temp_number, projects(name, url)')
  if (!bool(inv.inclusief_test)) vraag = vraag.eq('is_test', false)
  const status = tekst(inv.status)
  if (status) vraag = vraag.eq('status', status)
  if (bool(inv.alleen_te_laat)) vraag = vraag.eq('status', 'sent').lt('due_date', vandaag)
  if (inv.domein) vraag = vraag.eq('project_id', (await zoekDomein(db, inv.domein)).id)
  if (inv.klant) vraag = vraag.eq('client_id', (await zoekKlant(db, inv.klant)).id)
  const vanaf = datum(inv.vanaf, 'vanaf')
  const tot = datum(inv.tot, 'tot')
  if (vanaf) vraag = vraag.gte('invoice_date', vanaf)
  if (tot) vraag = vraag.lte('invoice_date', tot)
  const term = zoekterm(inv.zoekterm)
  if (term) vraag = vraag.or(`number.ilike.%${term}%,client_name.ilike.%${term}%`)

  const data = await rijen(vraag.order('invoice_date', { ascending: false, nullsFirst: false }).limit(limiet(inv)))
  return {
    aantal: data.length,
    totaal: som(data, 'amount'),
    facturen: data.map((f: any) => ({
      ...f,
      te_laat: f.status === 'sent' && Boolean(f.due_date) && f.due_date < vandaag,
    })),
  }
}

async function factuurDetails(db: DB, inv: Invoer) {
  const f = await zoekFactuur(db, inv.factuur)
  const [volledig, betalingen] = await Promise.all([
    enkele(db.from('invoices').select('*, projects(name, url)').eq('id', f.id)),
    rijen(db.from('bank_transactions').select('id, booked_at, amount, counterparty_name, description').eq('invoice_id', f.id)),
  ])
  return { ...volledig, banktransacties: betalingen }
}

async function offertesZoeken(db: DB, inv: Invoer) {
  let vraag = db
    .from('quotes')
    .select('id, number, status, amount, btw_percent, discount_percent, valid_until, created_at, accepted_at, declined_at, is_test, projects(name, url), clients(name, company)')
  if (!bool(inv.inclusief_test)) vraag = vraag.eq('is_test', false)
  const status = tekst(inv.status)
  if (status) vraag = vraag.eq('status', status)
  if (inv.domein) vraag = vraag.eq('project_id', (await zoekDomein(db, inv.domein)).id)
  const term = zoekterm(inv.zoekterm)
  if (term) vraag = vraag.ilike('number', `%${term}%`)
  return await rijen(vraag.order('created_at', { ascending: false }).limit(limiet(inv)))
}

async function offerteDetails(db: DB, inv: Invoer) {
  const o = await zoekOfferte(db, inv.offerte)
  // Zonder de handtekening: dat is een afbeelding als tekst, groot en nutteloos voor Claude.
  return await enkele(
    db.from('quotes')
      .select('id, number, status, amount, items, discount_percent, btw_percent, notes, valid_until, created_at, is_test, accepted_at, accepted_name, accepted_remarks, declined_at, declined_reason, attachment_ids, projects(name, url), clients(name, company, email)')
      .eq('id', o.id),
  )
}

async function werkzaamhedenZoeken(db: DB, inv: Invoer) {
  let vraag = db
    .from('work_logs')
    .select('id, performed_at, title, description, duration_minutes, category, billable, visible_to_client, projects(name)')
  if (inv.domein) vraag = vraag.eq('project_id', (await zoekDomein(db, inv.domein)).id)
  const vanaf = datum(inv.vanaf, 'vanaf')
  const tot = datum(inv.tot, 'tot')
  if (vanaf) vraag = vraag.gte('performed_at', vanaf)
  if (tot) vraag = vraag.lte('performed_at', tot)
  const categorie = tekst(inv.categorie)
  if (categorie) vraag = vraag.eq('category', categorie)
  const data = await rijen(vraag.order('performed_at', { ascending: false }).limit(limiet(inv)))
  return {
    aantal: data.length,
    totaal_minuten: data.reduce((a: number, w: any) => a + (w.duration_minutes ?? 0), 0),
    werkzaamheden: data.map((w: any) => ({ ...w, description: zonderHtml(w.description) })),
  }
}

async function strippenkaarten(db: DB, inv: Invoer) {
  if (inv.domein) {
    const domein = await zoekDomein(db, inv.domein)
    const kaarten = await rijen(
      db.from('punch_cards')
        .select('id, number, total_punches, used_punches, status, is_gift, price, purchased_at, expires_at')
        .eq('project_id', domein.id)
        .order('number'),
    )
    const ids = kaarten.map((k: any) => k.id)
    const afboekingen = ids.length
      ? await rijen(
          db.from('punch_card_uses')
            .select('punch_card_id, description, duration_minutes, used_at')
            .in('punch_card_id', ids)
            .order('used_at', { ascending: false })
            .limit(25),
        )
      : []
    const over = kaarten
      .filter((k: any) => k.status === 'active')
      .reduce((a: number, k: any) => a + (k.total_punches - k.used_punches), 0)
    return { domein: domein.name, saldo_strippen: over, saldo_minuten: over * 5, kaarten, laatste_afboekingen: afboekingen }
  }

  const kaarten = await rijen(
    db.from('punch_cards')
      .select('number, total_punches, used_punches, expires_at, projects(id, name, url)')
      .eq('status', 'active')
      .order('expires_at'),
  )
  const perDomein = new Map<string, any>()
  for (const k of kaarten) {
    const naam = k.projects?.name ?? 'onbekend'
    const rij = perDomein.get(naam) ?? { domein: naam, url: k.projects?.url, saldo_strippen: 0, kaarten: 0 }
    rij.saldo_strippen += k.total_punches - k.used_punches
    rij.kaarten += 1
    perDomein.set(naam, rij)
  }
  return [...perDomein.values()].map((r) => ({ ...r, saldo_minuten: r.saldo_strippen * 5 }))
}

async function meldingen(db: DB, inv: Invoer) {
  let vraag = db
    .from('admin_notifications')
    .select('id, type, title, message, read, created_at, projects(name), clients(name)')
  if (inv.alleen_ongelezen !== false) vraag = vraag.eq('read', false)
  return await rijen(vraag.order('created_at', { ascending: false }).limit(limiet(inv)))
}

async function chatsZoeken(db: DB, inv: Invoer) {
  let vraag = db
    .from('chat_conversations')
    .select('id, client_name, project_name, message_count, has_unresolved, created_at, last_message_at')
  if (bool(inv.alleen_onopgelost)) vraag = vraag.eq('has_unresolved', true)
  return await rijen(vraag.order('last_message_at', { ascending: false }).limit(limiet(inv)))
}

async function chatLezen(db: DB, inv: Invoer) {
  const id = verplicht(tekst(inv.gesprek_id), 'gesprek_id')
  const [gesprek, berichten] = await Promise.all([
    enkele(db.from('chat_conversations').select('id, client_name, project_name, has_unresolved, created_at').eq('id', id)),
    rijen(db.from('chat_messages').select('role, content, is_unresolved, created_at').eq('conversation_id', id).order('created_at')),
  ])
  return { ...gesprek, berichten }
}

async function ticketsZoeken(db: DB, inv: Invoer) {
  let vraag = db
    .from('tickets')
    .select('id, number, title, description, status, created_by_name, created_at, updated_at, resolved_at, projects(name)')
  const status = tekst(inv.status)
  if (status === 'openstaand') vraag = vraag.in('status', ['open', 'in_progress'])
  else if (status) vraag = vraag.eq('status', status)
  if (inv.domein) vraag = vraag.eq('project_id', (await zoekDomein(db, inv.domein)).id)
  return await rijen(vraag.order('created_at', { ascending: false }).limit(limiet(inv)))
}

async function ticketLezen(db: DB, inv: Invoer) {
  const t = await zoekTicket(db, inv.ticket)
  const [ticket, reacties] = await Promise.all([
    enkele(db.from('tickets').select('*, projects(name)').eq('id', t.id)),
    rijen(db.from('ticket_replies').select('author_name, author_role, content, attachment_url, created_at').eq('ticket_id', t.id).order('created_at')),
  ])
  return { ...ticket, reacties }
}

// -------------------------------------------------------------- financiën --

async function banktransactiesZoeken(db: DB, inv: Invoer) {
  let vraag = db
    .from('bank_transactions')
    .select('id, booked_at, amount, currency, description, counterparty_name, counterparty_iban, payment_type, invoice_id, expense_id, category, invoices(number, client_name, amount, status), expenses(description, vendor, category, amount_incl_btw)')
  if (bool(inv.alleen_onverwerkt)) vraag = vraag.is('invoice_id', null).is('expense_id', null).is('category', null)
  const richting = tekst(inv.richting)
  if (richting === 'in') vraag = vraag.gt('amount', 0)
  if (richting === 'uit') vraag = vraag.lt('amount', 0)
  const vanaf = datum(inv.vanaf, 'vanaf')
  const tot = datum(inv.tot, 'tot')
  if (vanaf) vraag = vraag.gte('booked_at', `${vanaf}T00:00:00`)
  if (tot) vraag = vraag.lte('booked_at', `${tot}T23:59:59.999`)
  const term = zoekterm(inv.zoekterm)
  if (term) vraag = vraag.or(`description.ilike.%${term}%,counterparty_name.ilike.%${term}%`)
  if (inv.bedrag !== undefined && inv.bedrag !== null && inv.bedrag !== '') {
    const b = Math.abs(getal(inv.bedrag, 'bedrag'))
    vraag = vraag.or(`amount.eq.${b},amount.eq.${-b}`)
  }
  const data = await rijen(vraag.order('booked_at', { ascending: false }).limit(limiet(inv)))
  return data.map((t: any) => ({ ...t, verwerkt_als: verwerktAls(t) }))
}

async function kostenZoeken(db: DB, inv: Invoer) {
  let vraag = db
    .from('expenses')
    .select('id, expense_date, vendor, description, category, amount_excl_btw, btw_percent, btw_amount, amount_incl_btw, invoice_number, notes, expense_attachments(filename)')
  const vanaf = datum(inv.vanaf, 'vanaf')
  const tot = datum(inv.tot, 'tot')
  if (vanaf) vraag = vraag.gte('expense_date', vanaf)
  if (tot) vraag = vraag.lte('expense_date', tot)
  const categorie = tekst(inv.categorie)
  if (categorie) vraag = vraag.eq('category', categorie)
  const term = zoekterm(inv.zoekterm)
  if (term) vraag = vraag.or(`vendor.ilike.%${term}%,description.ilike.%${term}%,invoice_number.ilike.%${term}%`)
  const data = await rijen(vraag.order('expense_date', { ascending: false }).limit(limiet(inv)))
  return {
    aantal: data.length,
    totaal_excl_btw: som(data, 'amount_excl_btw'),
    totaal_btw: som(data, 'btw_amount'),
    totaal_incl_btw: som(data, 'amount_incl_btw'),
    kosten: data.map((k: any) => ({
      ...k,
      expense_attachments: undefined,
      bijlagen: (k.expense_attachments ?? []).map((b: any) => b.filename),
    })),
  }
}

async function kostencategorieen(db: DB) {
  const data = await rijen(db.from('expenses').select('category'))
  const tel = new Map<string, number>()
  for (const k of data) if (k.category) tel.set(k.category, (tel.get(k.category) ?? 0) + 1)
  return [...tel.entries()].sort((a, b) => b[1] - a[1]).map(([categorie, aantal]) => ({ categorie, aantal }))
}

async function financieelOverzicht(db: DB, inv: Invoer) {
  const vandaag = vandaagNL()
  const vanaf = datum(inv.vanaf, 'vanaf') ?? `${vandaag.slice(0, 4)}-01-01`
  const tot = datum(inv.tot, 'tot') ?? vandaag
  const begin = `${vanaf}T00:00:00`
  const einde = `${tot}T23:59:59.999`

  const [omzetFacturen, betaald, openstaand, kosten, transacties] = await Promise.all([
    // Zoals de financiënpagina: verzonden en betaalde facturen op factuurdatum,
    // zonder test- en terugkerende sjablonen.
    rijen(
      db.from('invoices')
        .select('amount, btw_percent')
        .in('status', ['sent', 'paid'])
        .eq('is_test', false)
        .eq('is_recurring', false)
        .gte('invoice_date', vanaf)
        .lte('invoice_date', tot),
    ),
    rijen(db.from('invoices').select('amount').eq('status', 'paid').eq('is_test', false).gte('paid_at', begin).lte('paid_at', einde)),
    rijen(db.from('invoices').select('amount').eq('status', 'sent').eq('is_test', false).eq('is_recurring', false)),
    rijen(db.from('expenses').select('category, amount_excl_btw, btw_amount, amount_incl_btw').gte('expense_date', vanaf).lte('expense_date', tot)),
    rijen(db.from('bank_transactions').select('amount, invoice_id, expense_id, category').gte('booked_at', begin).lte('booked_at', einde)),
  ])

  const omzetIncl = som(omzetFacturen, 'amount')
  const omzetExcl = rond(
    omzetFacturen.reduce((a: number, f: any) => a + Number(f.amount) / (1 + Number(f.btw_percent ?? 0) / 100), 0),
  )

  const perCategorie: Record<string, number> = {}
  for (const k of kosten) {
    const naam = k.category || 'zonder categorie'
    perCategorie[naam] = rond((perCategorie[naam] ?? 0) + Number(k.amount_excl_btw ?? 0))
  }

  const somTx = (filter: (t: any) => boolean) =>
    rond(transacties.filter(filter).reduce((a: number, t: any) => a + Number(t.amount), 0))
  const refunds = somTx((t) => t.amount > 0 && t.expense_id)
  const rente = somTx((t) => t.category === 'interest')
  const kostenExcl = som(kosten, 'amount_excl_btw')

  return {
    periode: { vanaf, tot },
    omzet: { incl_btw: omzetIncl, excl_btw: omzetExcl, facturen: omzetFacturen.length },
    ontvangen_betalingen_op_facturen: som(betaald, 'amount'),
    nu_openstaand: som(openstaand, 'amount'),
    kosten: {
      excl_btw: kostenExcl,
      btw: som(kosten, 'btw_amount'),
      incl_btw: som(kosten, 'amount_incl_btw'),
      per_categorie_excl_btw: perCategorie,
      refunds_ontvangen: refunds,
    },
    rente,
    prive: {
      stortingen: somTx((t) => t.category === 'private_deposit'),
      opnames: somTx((t) => t.category === 'private_withdrawal'),
      aankopen: somTx((t) => t.category === 'private_purchase'),
    },
    onverwerkte_transacties: {
      aantal: transacties.filter((t: any) => !t.invoice_id && !t.expense_id && !t.category).length,
      binnenkomend: somTx((t) => t.amount > 0 && !t.invoice_id && !t.expense_id && !t.category),
      uitgaand: somTx((t) => t.amount < 0 && !t.invoice_id && !t.expense_id && !t.category),
    },
    resultaat_indicatie_excl_btw: rond(omzetExcl + rente - kostenExcl + refunds),
    let_op:
      'Indicatie, geen boekhouding: omzet op factuurdatum (niet op betaling), refunds bruto ' +
      'teruggeteld, privé-boekingen tellen niet mee.',
  }
}

// ------------------------------------------------------- wijzigen: geld --

async function banktransactieLabelen(db: DB, inv: Invoer) {
  const id = uuid(inv.transactie_id, 'transactie_id')
  const tx = await enkele(
    db.from('bank_transactions').select('id, booked_at, amount, counterparty_name, description, invoice_id, expense_id, category').eq('id', id),
  )
  const vorige = verwerktAls(tx)
  const koppel = tekst(inv.koppel_aan)
  const waarschuwingen: string[] = []

  // Zoals Financien.tsx: een transactie hangt aan precies één ding (en de
  // database dwingt dat ook af), dus de andere twee gaan altijd op null.
  let wijziging: Record<string, unknown>
  let factuur: any = null
  if (koppel === 'factuur') {
    factuur = await zoekFactuur(db, inv.factuur)
    wijziging = { invoice_id: factuur.id, expense_id: null, category: null }
    if (Math.abs(Math.abs(Number(tx.amount)) - Number(factuur.amount)) > 0.005) {
      waarschuwingen.push(`Bedrag wijkt af: transactie ${tx.amount}, factuur ${factuur.amount}.`)
    }
    if (Number(tx.amount) < 0) waarschuwingen.push('Dit is een uitgaande transactie.')
  } else if (koppel === 'kostenpost') {
    const kostenpost = uuid(inv.kostenpost_id, 'kostenpost_id')
    await enkele(db.from('expenses').select('id').eq('id', kostenpost))
    wijziging = { invoice_id: null, expense_id: kostenpost, category: null }
  } else if (koppel === 'categorie') {
    const categorie = tekst(inv.categorie)
    if (!categorie || !TX_CATEGORIEEN.includes(categorie)) {
      throw new Error(`categorie moet een van deze zijn: ${TX_CATEGORIEEN.join(', ')}.`)
    }
    wijziging = { invoice_id: null, expense_id: null, category: categorie }
  } else if (koppel === 'niets') {
    wijziging = { invoice_id: null, expense_id: null, category: null }
  } else {
    throw new Error('koppel_aan moet factuur, kostenpost, categorie of niets zijn.')
  }

  await uitvoeren(db.from('bank_transactions').update(wijziging).eq('id', id))

  // Alleen op verzoek, en dan precies zoals bunq-sync: van sent of draft naar
  // paid, met de boekdatum als betaaldatum. Een al betaalde factuur blijft staan.
  let factuurBetaald = false
  if (factuur && bool(inv.factuur_op_betaald)) {
    if (factuur.status === 'paid') {
      waarschuwingen.push(`Factuur ${factuur.number} stond al op betaald.`)
    } else {
      await uitvoeren(
        db.from('invoices').update({ status: 'paid', paid_at: tx.booked_at }).eq('id', factuur.id).in('status', ['sent', 'draft']),
      )
      factuurBetaald = true
    }
  }

  const uitkomst = {
    transactie: { id, datum: tx.booked_at, bedrag: tx.amount, tegenpartij: tx.counterparty_name },
    was: vorige,
    is_nu: koppel === 'factuur' ? `factuur ${factuur.number}` : verwerktAls({ ...tx, ...wijziging }),
    factuur_op_betaald_gezet: factuurBetaald,
    waarschuwingen,
  }
  await logboek(db, 'banktransactie_labelen', inv, uitkomst)
  return uitkomst
}

async function kostenpostMaken(db: DB, inv: Invoer) {
  const omschrijving = verplicht(tekst(inv.omschrijving), 'omschrijving')
  let tx: any = null
  if (inv.banktransactie_id) {
    tx = await enkele(
      db.from('bank_transactions').select('id, booked_at, amount, counterparty_name, invoice_id, expense_id, category').eq('id', uuid(inv.banktransactie_id, 'banktransactie_id')),
    )
  }

  // Vanuit een transactie vult de UI 0% btw in (bedrag excl = incl); los is
  // de standaard 21%. Zo ook hier, tenzij anders opgegeven.
  const incl = inv.bedrag_incl_btw !== undefined ? getal(inv.bedrag_incl_btw, 'bedrag_incl_btw') : tx ? Math.abs(Number(tx.amount)) : null
  if (incl === null) throw new Error('bedrag_incl_btw is nodig (of een banktransactie_id).')
  const btw = inv.btw_percent !== undefined ? getal(inv.btw_percent, 'btw_percent') : tx ? 0 : 21
  const bedragen = btwBedragen(Math.abs(incl), btw)

  const rij = {
    expense_date: datum(inv.datum, 'datum') ?? (tx ? datumNL(tx.booked_at) : vandaagNL()),
    vendor: tekst(inv.leverancier) ?? tx?.counterparty_name ?? null,
    description: omschrijving,
    category: tekst(inv.categorie) ?? null,
    ...bedragen,
    invoice_number: tekst(inv.factuurnummer) ?? null,
    notes: tekst(inv.notities) ?? null,
    source_booked_at: tx?.booked_at ?? null,
  }
  const kostenpost = await enkele(db.from('expenses').insert(rij).select('*'))

  let was: string | null = null
  if (tx) {
    was = verwerktAls(tx)
    await uitvoeren(db.from('bank_transactions').update({ expense_id: kostenpost.id, invoice_id: null, category: null }).eq('id', tx.id))
  }

  const uitkomst = { kostenpost, gekoppeld_aan_transactie: tx?.id ?? null, transactie_was: was }
  await logboek(db, 'kostenpost_maken', inv, uitkomst)
  return uitkomst
}

async function kostenpostBijwerken(db: DB, inv: Invoer) {
  const id = uuid(inv.id, 'id')
  const huidig = await enkele(db.from('expenses').select('*').eq('id', id))
  const wijziging: Record<string, unknown> = {}
  if (inv.omschrijving !== undefined) wijziging.description = verplicht(tekst(inv.omschrijving), 'omschrijving')
  if (inv.datum !== undefined) wijziging.expense_date = datum(inv.datum, 'datum')
  if (inv.leverancier !== undefined) wijziging.vendor = tekst(inv.leverancier) ?? null
  if (inv.categorie !== undefined) wijziging.category = tekst(inv.categorie) ?? null
  if (inv.factuurnummer !== undefined) wijziging.invoice_number = tekst(inv.factuurnummer) ?? null
  if (inv.notities !== undefined) wijziging.notes = tekst(inv.notities) ?? null
  if (inv.bedrag_incl_btw !== undefined || inv.btw_percent !== undefined) {
    const incl = inv.bedrag_incl_btw !== undefined ? getal(inv.bedrag_incl_btw, 'bedrag_incl_btw') : Number(huidig.amount_incl_btw)
    const btw = inv.btw_percent !== undefined ? getal(inv.btw_percent, 'btw_percent') : Number(huidig.btw_percent)
    Object.assign(wijziging, btwBedragen(Math.abs(incl), btw))
  }
  if (Object.keys(wijziging).length === 0) throw new Error('Er viel niets te wijzigen.')

  const nieuw = await enkele(db.from('expenses').update(wijziging).eq('id', id).select('*'))
  await logboek(db, 'kostenpost_bijwerken', inv, { was: huidig, is_nu: nieuw })
  return nieuw
}

async function factuurStatusZetten(db: DB, inv: Invoer) {
  const f = await zoekFactuur(db, inv.factuur)
  const status = tekst(inv.status)
  if (!status || !['draft', 'sent', 'paid'].includes(status)) throw new Error('status moet draft, sent of paid zijn.')

  // Zoals het keuzemenu in Invoices.tsx: naar betaald met een betaaldatum
  // ('s middags lokale tijd), van betaald af met paid_at leeg.
  const wijziging: Record<string, unknown> = { status }
  if (status === 'paid') {
    const dag = datum(inv.betaald_op, 'betaald_op') ?? vandaagNL()
    wijziging.paid_at = middagNL(dag)
  } else if (f.status === 'paid') {
    wijziging.paid_at = null
  }

  const nieuw = await enkele(
    db.from('invoices').update(wijziging).eq('id', f.id).select('id, number, status, amount, paid_at, client_name'),
  )
  const uitkomst = { was: f.status, factuur: nieuw, opmerking: 'Er is geen mail naar de klant gestuurd.' }
  await logboek(db, 'factuur_status_zetten', inv, uitkomst)
  return uitkomst
}

async function offerteStatusZetten(db: DB, inv: Invoer) {
  const o = await zoekOfferte(db, inv.offerte)
  const status = tekst(inv.status)
  if (!status || !['draft', 'sent', 'accepted', 'declined'].includes(status)) {
    throw new Error('status moet draft, sent, accepted of declined zijn.')
  }
  const nieuw = await enkele(db.from('quotes').update({ status }).eq('id', o.id).select('id, number, status, amount'))
  const uitkomst = { was: o.status, offerte: nieuw, opmerking: 'Er is geen mail naar de klant gestuurd.' }
  await logboek(db, 'offerte_status_zetten', inv, uitkomst)
  return uitkomst
}

// ------------------------------------------------------ wijzigen: werk --

async function werkzaamheidToevoegen(db: DB, inv: Invoer) {
  const domein = await zoekDomein(db, inv.domein)
  const categorie = tekst(inv.categorie) ?? 'onderhoud'
  if (!WERK_CATEGORIEEN.includes(categorie)) throw new Error(`categorie moet een van deze zijn: ${WERK_CATEGORIEEN.join(', ')}.`)

  const rij: Record<string, unknown> = {
    project_id: domein.id,
    title: verplicht(tekst(inv.titel), 'titel'),
    description: alsHtml(tekst(inv.omschrijving)),
    performed_at: datum(inv.datum, 'datum') ?? vandaagNL(),
    category: categorie,
  }
  if (inv.duur_minuten !== undefined) rij.duration_minutes = minuten(inv.duur_minuten)
  if (inv.factureerbaar !== undefined) rij.billable = bool(inv.factureerbaar)

  const nieuw = await enkele(db.from('work_logs').insert(rij).select('id, performed_at, title, duration_minutes, category, billable'))
  const uitkomst = { domein: domein.name, werkzaamheid: nieuw }
  await logboek(db, 'werkzaamheid_toevoegen', inv, uitkomst)
  return uitkomst
}

async function werkzaamheidBijwerken(db: DB, inv: Invoer) {
  const id = uuid(inv.id, 'id')
  const wijziging: Record<string, unknown> = {}
  if (inv.titel !== undefined) wijziging.title = verplicht(tekst(inv.titel), 'titel')
  if (inv.omschrijving !== undefined) wijziging.description = alsHtml(tekst(inv.omschrijving))
  if (inv.datum !== undefined) wijziging.performed_at = datum(inv.datum, 'datum')
  if (inv.duur_minuten !== undefined) wijziging.duration_minutes = Number(inv.duur_minuten) === 0 ? null : minuten(inv.duur_minuten)
  if (inv.categorie !== undefined) {
    const categorie = tekst(inv.categorie)
    if (!categorie || !WERK_CATEGORIEEN.includes(categorie)) throw new Error(`categorie moet een van deze zijn: ${WERK_CATEGORIEEN.join(', ')}.`)
    wijziging.category = categorie
  }
  if (inv.factureerbaar !== undefined) wijziging.billable = bool(inv.factureerbaar)
  if (Object.keys(wijziging).length === 0) throw new Error('Er viel niets te wijzigen.')
  wijziging.updated_at = new Date().toISOString()

  const nieuw = await enkele(db.from('work_logs').update(wijziging).eq('id', id).select('id, performed_at, title, duration_minutes, category, billable'))
  await logboek(db, 'werkzaamheid_bijwerken', inv, nieuw)
  return nieuw
}

async function strippenAfschrijven(db: DB, inv: Invoer) {
  const domein = await zoekDomein(db, inv.domein)
  const omschrijving = verplicht(tekst(inv.omschrijving), 'omschrijving')
  let strippen: number
  if (inv.strippen !== undefined) strippen = getal(inv.strippen, 'strippen')
  else if (inv.minuten !== undefined) strippen = Math.ceil(getal(inv.minuten, 'minuten') / 5)
  else throw new Error('Geef strippen of minuten op.')
  if (!Number.isInteger(strippen) || strippen < 1 || strippen > 1000) throw new Error('strippen moet een heel getal van 1 tot 1000 zijn.')

  const tekstMoment = tekst(inv.moment)
  const moment = tekstMoment
    ? /^\d{4}-\d{2}-\d{2}$/u.test(tekstMoment) ? middagNL(tekstMoment) : new Date(tekstMoment).toISOString()
    : new Date().toISOString()

  // De database-functie doet het met rijvergrendeling, oudste kaart eerst, en
  // mailt niemand - anders dan de timer in de UI.
  const { data, error } = await db.rpc('deduct_punch_card_time', {
    p_project_id: domein.id,
    p_strips: strippen,
    p_description: omschrijving,
    p_used_at: moment,
  })
  if (error) throw new Error(error.message)

  const kaarten = await rijen(db.from('punch_cards').select('total_punches, used_punches').eq('project_id', domein.id).eq('status', 'active'))
  const over = kaarten.reduce((a: number, k: any) => a + (k.total_punches - k.used_punches), 0)
  const uitkomst = {
    domein: domein.name,
    afgeschreven_strippen: strippen,
    afgeschreven_minuten: strippen * 5,
    per_kaart: data,
    saldo_strippen_nu: over,
    opmerking: 'Er is geen mail naar de klant gestuurd.',
  }
  await logboek(db, 'strippen_afschrijven', inv, uitkomst)
  return uitkomst
}

async function domeinBijwerken(db: DB, inv: Invoer) {
  const domein = await zoekDomein(db, inv.domein)
  const velden: [string, string][] = [
    ['naam', 'name'], ['omschrijving', 'description'], ['url', 'url'], ['staging_url', 'staging_url'],
    ['file_sharing_url', 'file_sharing_url'], ['feedback_title', 'feedback_title'], ['feedback_url', 'feedback_url'],
    ['factuur_naam', 'invoice_name'], ['factuur_email', 'invoice_email'],
  ]
  const wijziging: Record<string, unknown> = {}
  for (const [invoerNaam, kolom] of velden) {
    if (inv[invoerNaam] !== undefined) wijziging[kolom] = tekst(inv[invoerNaam]) ?? null
  }
  if (wijziging.name === null) throw new Error('Een domein heeft een naam nodig.')
  if (inv.deadline !== undefined) {
    wijziging.due_date = String(inv.deadline).toLowerCase() === 'geen' ? null : datum(inv.deadline, 'deadline')
  }
  if (inv.fase !== undefined) {
    const fase = tekst(inv.fase)
    if (!fase || !FASEN.includes(fase)) throw new Error(`fase moet een van deze zijn: ${FASEN.join(', ')}.`)
    wijziging.current_phase = fase
  }
  if (inv.status !== undefined) {
    const status = tekst(inv.status)
    if (status !== 'active' && status !== 'archived') throw new Error('status moet active of archived zijn.')
    wijziging.status = status
  }
  if (Object.keys(wijziging).length === 0) throw new Error('Er viel niets te wijzigen.')

  const nieuw = await enkele(
    db.from('projects').update(wijziging).eq('id', domein.id).select('id, name, url, status, current_phase, due_date'),
  )
  const uitkomst = {
    domein: nieuw,
    opmerking: wijziging.current_phase ? 'Fase stil gewijzigd: er is geen mail naar de klant gestuurd.' : undefined,
  }
  await logboek(db, 'domein_bijwerken', inv, uitkomst)
  return uitkomst
}

async function klantBijwerken(db: DB, inv: Invoer) {
  const klant = await zoekKlant(db, inv.klant)
  const wijziging: Record<string, unknown> = {}
  if (inv.naam !== undefined) wijziging.name = verplicht(tekst(inv.naam), 'naam')
  if (inv.email !== undefined) wijziging.email = verplicht(tekst(inv.email), 'email')
  if (inv.telefoon !== undefined) wijziging.phone = tekst(inv.telefoon) ?? null
  if (inv.bedrijf !== undefined) wijziging.company = tekst(inv.bedrijf) ?? null
  if (inv.status !== undefined) {
    const status = tekst(inv.status)
    if (status !== 'active' && status !== 'archived') throw new Error('status moet active of archived zijn.')
    wijziging.status = status
  }
  if (Object.keys(wijziging).length === 0) throw new Error('Er viel niets te wijzigen.')

  const nieuw = await enkele(db.from('clients').update(wijziging).eq('id', klant.id).select('id, name, company, email, phone, status'))
  await logboek(db, 'klant_bijwerken', inv, nieuw)
  return nieuw
}

async function meldingenGelezen(db: DB, inv: Invoer) {
  let vraag = db.from('admin_notifications').update({ read: true }).eq('read', false)
  if (bool(inv.alle)) {
    // alles wat nog ongelezen is
  } else if (Array.isArray(inv.ids) && inv.ids.length > 0) {
    vraag = vraag.in('id', inv.ids.map((i) => uuid(i, 'ids')))
  } else {
    throw new Error('Geef ids op, of alle: true.')
  }
  const data = await rijen(vraag.select('id, title'))
  const uitkomst = { gemarkeerd: data.length, meldingen: data }
  await logboek(db, 'meldingen_gelezen', inv, uitkomst)
  return uitkomst
}

async function ticketStatusZetten(db: DB, inv: Invoer) {
  const t = await zoekTicket(db, inv.ticket)
  const status = tekst(inv.status)
  if (!status || !['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
    throw new Error('status moet open, in_progress, resolved of closed zijn.')
  }
  // Zoals Tickets.tsx: updated_at altijd, resolved_at bij opgelost.
  const wijziging: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (status === 'resolved') wijziging.resolved_at = new Date().toISOString()
  const nieuw = await enkele(db.from('tickets').update(wijziging).eq('id', t.id).select('id, number, title, status'))
  const uitkomst = { was: t.status, ticket: nieuw, opmerking: 'Er is geen mail naar de klant gestuurd.' }
  await logboek(db, 'ticket_status_zetten', inv, uitkomst)
  return uitkomst
}

// ------------------------------------------------------------- opzoeken --

async function zoekDomein(db: DB, waarde: unknown) {
  const w = verplicht(tekst(waarde), 'domein')
  if (UUID.test(w)) return await enkele(db.from('projects').select('id, name, url').eq('id', w))
  // "https://www.voorbeeld.nl/" en "voorbeeld.nl" horen hetzelfde domein te vinden.
  const term = zoekterm(normaal(w)) ?? zoekterm(w)!
  const kandidaten = await rijen(
    db.from('projects').select('id, name, url, status').or(`name.ilike.%${term}%,url.ilike.%${term}%`).limit(10),
  )
  return kies(kandidaten, w, (d: any) => [d.name, d.url], 'domein', (d: any) => `${d.name} (${d.url ?? 'geen url'}, ${d.status})`)
}

async function zoekKlant(db: DB, waarde: unknown) {
  const w = verplicht(tekst(waarde), 'klant')
  if (UUID.test(w)) return await enkele(db.from('clients').select('id, name').eq('id', w))
  const term = zoekterm(w)!
  const kandidaten = await rijen(
    db.from('clients').select('id, name, company, email').or(`name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%`).limit(10),
  )
  return kies(kandidaten, w, (k: any) => [k.name, k.company, k.email], 'klant', (k: any) => `${k.name}${k.company ? ` (${k.company})` : ''}`)
}

async function zoekFactuur(db: DB, waarde: unknown) {
  const w = verplicht(tekst(waarde), 'factuur')
  const vraag = db.from('invoices').select('id, number, status, amount, client_name')
  const data = await rijen(UUID.test(w) ? vraag.eq('id', w) : vraag.eq('number', w))
  if (data.length === 0) throw new Error(`Geen factuur gevonden voor "${w}".`)
  if (data.length > 1) throw new Error(`Meerdere facturen met nummer "${w}" (test of tijdelijk); gebruik het id.`)
  return data[0]
}

async function zoekOfferte(db: DB, waarde: unknown) {
  const w = verplicht(tekst(waarde), 'offerte')
  const vraag = db.from('quotes').select('id, number, status')
  const data = await rijen(UUID.test(w) ? vraag.eq('id', w) : vraag.eq('number', w))
  if (data.length === 0) throw new Error(`Geen offerte gevonden voor "${w}".`)
  if (data.length > 1) throw new Error(`Meerdere offertes met nummer "${w}"; gebruik het id.`)
  return data[0]
}

async function zoekTicket(db: DB, waarde: unknown) {
  const w = verplicht(tekst(waarde), 'ticket')
  const vraag = db.from('tickets').select('id, number, status')
  const data = await rijen(UUID.test(w) ? vraag.eq('id', w) : vraag.eq('number', Number(w.replace(/^#/u, ''))))
  if (data.length === 0) throw new Error(`Geen ticket gevonden voor "${w}".`)
  return data[0]
}

/** Eén treffer: die. Meerdere: een exacte naam wint, anders vragen welke. */
function kies<T>(kandidaten: T[], w: string, namen: (x: T) => (string | null)[], soort: string, toon: (x: T) => string): T {
  if (kandidaten.length === 1) return kandidaten[0]
  const exact = kandidaten.filter((k) => namen(k).some((n) => n && normaal(n) === normaal(w)))
  if (exact.length === 1) return exact[0]
  if (kandidaten.length === 0) throw new Error(`Geen ${soort} gevonden voor "${w}".`)
  throw new Error(`Meerdere ${soort}en passen bij "${w}": ${kandidaten.map(toon).join('; ')}. Wees specifieker of gebruik het id.`)
}

// ------------------------------------------------------------- hulpjes --

async function rijen(vraag: any): Promise<any[]> {
  const { data, error } = await vraag
  if (error) throw new Error(error.message)
  return data ?? []
}

async function enkele(vraag: any): Promise<any> {
  const { data, error } = await vraag.maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Niet gevonden.')
  return data
}

async function uitvoeren(vraag: any): Promise<void> {
  const { error } = await vraag
  if (error) throw new Error(error.message)
}

async function telling(vraag: any): Promise<number> {
  const { count, error } = await vraag
  if (error) throw new Error(error.message)
  return count ?? 0
}

/** Het logboek mag een geslaagde wijziging niet alsnog laten mislukken. */
async function logboek(db: DB, actie: string, invoer: Invoer, uitkomst: unknown) {
  try {
    await db.from('mcp_audit_log').insert({ actor: ACTOR, action: actie, input: invoer, result: uitkomst })
  } catch {
    // stil
  }
}

function verwerktAls(t: any): string {
  if (t.invoice_id) return t.invoices?.number ? `factuur ${t.invoices.number}` : 'factuur'
  if (t.expense_id) return Number(t.amount) > 0 ? 'refund op kostenpost' : 'kostenpost'
  if (t.category) return `categorie ${t.category}`
  return 'onverwerkt'
}

function btwBedragen(incl: number, btw: number) {
  if (!Number.isFinite(btw) || btw < 0 || btw > 100) throw new Error('btw_percent moet tussen 0 en 100 liggen.')
  const excl = rond(incl / (1 + btw / 100))
  return { amount_incl_btw: rond(incl), btw_percent: btw, amount_excl_btw: excl, btw_amount: rond(incl - excl) }
}

function som(rijen: any[], veld: string): number {
  return rond(rijen.reduce((a, r) => a + Number(r[veld] ?? 0), 0))
}

function rond(x: number): number {
  return Math.round(x * 100) / 100
}

function vandaagNL(): string {
  return datumNL(new Date().toISOString())
}

function datumNL(tijdstip: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date(tijdstip))
}

/** 12:00 in Nederland op die dag, zoals de UI een handmatige datum opslaat. */
function middagNL(dag: string): string {
  const proef = new Date(`${dag}T12:00:00Z`)
  const uurNL = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hour12: false }).format(proef),
  )
  return new Date(proef.getTime() - (uurNL - 12) * 3_600_000).toISOString()
}

function tekst(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  const t = String(v).trim()
  return t === '' ? undefined : t
}

function verplicht<T>(v: T | undefined, veld: string): T {
  if (v === undefined) throw new Error(`${veld} is verplicht.`)
  return v
}

function getal(v: unknown, veld: string): number {
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`${veld} moet een getal zijn.`)
  return n
}

function minuten(v: unknown): number {
  const n = getal(v, 'duur_minuten')
  if (!Number.isInteger(n) || n < 1) throw new Error('duur_minuten moet een heel aantal minuten zijn.')
  return n
}

function bool(v: unknown): boolean {
  return v === true || v === 'true'
}

function datum(v: unknown, veld: string): string | undefined {
  const t = tekst(v)
  if (t === undefined) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(t)) throw new Error(`${veld} moet een datum als JJJJ-MM-DD zijn.`)
  return t
}

function uuid(v: unknown, veld: string): string {
  const t = verplicht(tekst(v), veld)
  if (!UUID.test(t)) throw new Error(`${veld} moet een id zijn.`)
  return t
}

function limiet(inv: Invoer): number {
  const n = Number(inv.limiet ?? 50)
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 1), 200) : 50
}

/** Tekens die in een PostgREST-filter iets betekenen gaan eruit. */
function zoekterm(v: unknown): string | undefined {
  const t = tekst(v)
  return t ? t.replace(/[%,()*\\]/gu, ' ').trim() || undefined : undefined
}

function normaal(t: string): string {
  return t.toLowerCase().replace(/^https?:\/\//u, '').replace(/^www\./u, '').replace(/\/+$/u, '').trim()
}

function zonderHtml(html: string | null): string {
  if (!html) return ''
  return html
    .replace(/<\/(p|li|h\d)>|<br\s*\/?>/giu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

/** De werklog-editor slaat HTML op; gewone tekst wordt hier alinea's. */
function alsHtml(t: string | undefined): string {
  if (!t) return ''
  const veilig = t.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
  return veilig
    .split(/\n{2,}/u)
    .map((alinea) => `<p>${alinea.replace(/\n/gu, '<br>')}</p>`)
    .join('')
}
