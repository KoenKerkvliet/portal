# functions-archief

Edge functions die **wel live draaien op Supabase** maar **niet door de CI worden
uitgerold**. Ze staan hier zodat de broncode in git zit; dat was het enige
exemplaar niet.

De deploy-workflow (`.github/workflows/deploy-functions.yml`) triggert op
`supabase/functions/**` en loopt in de deploy-stap over `supabase/functions/*/`.
Deze map valt daar buiten, dus een push raakt de draaiende functions hier niet.

## api-maintenance

Voedt de strippenkaart-sectie in het klantrapport van de MainWP Mobile
Dashboard-plugin (`MWPMD_Portal::get_balance()`). Auth via de header
`x-integration-key`, vergeleken met `integration_config.dashboard_integration_key`.

- Aangemaakt op 11 april 2026, rechtstreeks op Supabase, nooit via deze repo.
- Draait als **version 1** met `verify_jwt: false`.
- Broncode hier is een kopie van die draaiende versie (opgehaald 20 september 2026).

### Als je 'm onder CI wilt brengen

Verplaats de map naar `supabase/functions/api-maintenance/` **en zet in dezelfde
commit** deze regels in `supabase/config.toml`:

```toml
[functions.api-maintenance]
verify_jwt = false
```

Die regels staan daar al klaar, uitgecommentarieerd.

**Zonder die regels gaat het mis.** De Supabase CLI zet `verify_jwt` bij elke
deploy terug op de standaard `true`. De gateway eist dan een Supabase-JWT, de
plugin stuurt alleen z'n `x-integration-key`, en het antwoord wordt een 401.
`MWPMD_Portal::request()` geeft dan `null` terug, `get_balance()` ook, en de
PDF-renderer slaat de hele strippenkaart-sectie over — zonder foutmelding.
De klant krijgt dus gewoon een rapport zónder strippenkaart.

Let er bij het verplaatsen ook op dat de deploy de function herbouwt (version 1
wordt 2) en dat `@supabase/supabase-js@2` daarbij opnieuw wordt opgehaald van
esm.sh, zonder vastgezette patchversie. Controleer na de eerste deploy of het
rapport nog vult.
