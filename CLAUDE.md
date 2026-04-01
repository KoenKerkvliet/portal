# Klantportaal — Projectrichtlijnen

## Aanmeldproces (NIET WIJZIGEN)

Het volledige aanmeld- en verificatieproces is afgerond en werkt correct.
**Verander hier NIETS aan zonder expliciete toestemming van de gebruiker.**

Dit omvat:
- `supabase/functions/send-verification-email/index.ts` — Edge Function die gebruiker aanmaakt via `generateLink` en verificatiemail stuurt via EmailIt v2
- `supabase/functions/send-test-email/index.ts` — Testmail-knop op admin dashboard
- `src/pages/Login.tsx` — Registratieflow die de Edge Function aanroept
- `src/pages/Verify.tsx` — Verificatiepagina die Supabase tokens afhandelt
- `supabase/functions/_shared/cors.ts` — Gedeelde CORS headers
- Supabase Auth configuratie en EmailIt v2 integratie

Vraag altijd expliciet om toestemming voordat je iets aan deze bestanden of flow wijzigt.
