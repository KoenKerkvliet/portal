// Mailt een beveiligde link (bijv. van Inprivy, secrets.designpixels.nl) naar een
// e-mailadres, vanaf de domeinpagina (Algemeen > Privacy). Bedoeld voor
// privacygevoelige gegevens zoals inloggegevens. De link wordt NIET opgeslagen of
// gelogd: alleen dát er iets is verstuurd (aan wie, wanneer, waarover) komt in
// secure_link_sends. Alleen aanroepbaar door admins.

import { corsHeaders, escapeHtml, json, mailButton, mailLayout, requireAdmin, sendMail } from '../_shared/projectMail.ts'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_NOTE = 200

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const db = await requireAdmin(req)
    if (db instanceof Response) return db

    const body = await req.json()
    const projectId = typeof body.project_id === 'string' ? body.project_id : ''
    const to = typeof body.to === 'string' ? body.to.trim().toLowerCase() : ''
    const url = typeof body.url === 'string' ? body.url.trim() : ''
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_NOTE) : ''
    const hasPassword = body.has_password === true

    if (!projectId) return json({ success: false, error: 'Domein ontbreekt' }, 400)
    if (!EMAIL_PATTERN.test(to)) return json({ success: false, error: 'Vul een geldig e-mailadres in' }, 400)
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return json({ success: false, error: 'Vul een geldige link in' }, 400)
    }
    if (parsed.protocol !== 'https:') return json({ success: false, error: 'De link moet met https:// beginnen' }, 400)

    const { data: project, error } = await db.from('projects').select('id, name').eq('id', projectId).single()
    if (error || !project) throw new Error('Domein niet gevonden')

    // Naam van de ontvanger als het adres bij een klant hoort
    const { data: client } = await db.from('clients').select('name').ilike('email', to).limit(1).maybeSingle()
    const name = (client?.name as string | undefined)?.trim()

    const projectName = project.name as string
    const subject = `Beveiligde gegevens${note ? `: ${note}` : ''} (${projectName})`
    const what = note ? `<strong>${escapeHtml(note)}</strong>` : 'gegevens'
    const whatText = note || 'gegevens'
    const html = mailLayout(subject, `<p style="margin:0 0 16px;">Hoi${name ? ` ${escapeHtml(name)}` : ''},</p>
<p style="margin:0 0 16px;">Ik heb je ${what} voor <strong>${escapeHtml(projectName)}</strong> gestuurd via een beveiligde link. Zo komen ze niet zomaar in je mailbox te staan.</p>
<p style="margin:0 0 24px;">Open de link en klik op <strong>Toon geheime informatie</strong>. Mogelijk kun je de link maar een beperkt aantal keer openen of verloopt hij na een tijdje. Bewaar de gegevens daarom meteen op een veilige plek, bijvoorbeeld in je wachtwoordkluis.</p>
${mailButton(url, 'Gegevens bekijken')}
${hasPassword ? '<p style="margin:0 0 16px;">De link is extra beveiligd met een wachtwoord. Dat stuur ik je apart, via een ander kanaal.</p>' : ''}
<p style="margin:0 0 16px;font-size:13px;color:#888;">Verwachtte je deze mail niet? Open de link dan niet en laat het me even weten.</p>`)
    const text = `Hoi${name ? ` ${name}` : ''},

Ik heb je ${whatText} voor ${projectName} gestuurd via een beveiligde link. Zo komen ze niet zomaar in je mailbox te staan.

Open de link en klik op "Toon geheime informatie". Mogelijk kun je de link maar een beperkt aantal keer openen of verloopt hij na een tijdje. Bewaar de gegevens daarom meteen op een veilige plek, bijvoorbeeld in je wachtwoordkluis.

${url}
${hasPassword ? '\nDe link is extra beveiligd met een wachtwoord. Dat stuur ik je apart, via een ander kanaal.\n' : ''}
Verwachtte je deze mail niet? Open de link dan niet en laat het me even weten.

Met vriendelijke groet,
DesignPixels`

    if (!(await sendMail(to, subject, html, text))) throw new Error('De mail kon niet verstuurd worden')

    const { data: logged } = await db
      .from('secure_link_sends')
      .insert({ project_id: projectId, recipient_email: to, note, has_password: hasPassword })
      .select('sent_at')
      .single()
    return json({ success: true, sent_to: to, sent_at: logged?.sent_at || new Date().toISOString() })
  } catch (err) {
    // Bewust zonder de link in de foutmelding
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-secure-link error:', message)
    return json({ success: false, error: message }, 500)
  }
})
