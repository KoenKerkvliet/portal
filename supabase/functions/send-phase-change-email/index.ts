// Verstuurt een mail naar de klant als de admin een domein naar een nieuwe fase
// schuift en daarbij 'stil bijwerken' uitzet. Bevat een korte fase-specifieke
// uitleg zodat de klant weet wat er gaat gebeuren. Tijdens het project loopt alles
// via mail met links (zonder inloggen); alleen in de onderhoudsfase verwijzen we
// naar het portaal. Ontvangers: gekoppelde klanten met 'Portaalmails' aan.
// Alleen aanroepbaar door admins.

import { corsHeaders, escapeHtml, json, mailButton, mailLayout, portalRecipients, requireAdmin, sendMail } from '../_shared/projectMail.ts'

const PORTAL_URL = 'https://portal.designpixels.nl'

const phaseLabels: Record<string, string> = {
  intake: 'Intake',
  design: 'Design',
  development: 'Development',
  oplevering: 'Oplevering',
  onderhoud: 'Onderhoud',
}

const phaseDescriptions: Record<string, string> = {
  intake: 'We zijn gestart met de intake. Wat je van ons nodig hebt, zoals de offerte en een uitnodiging voor het startgesprek, ontvang je per mail.',
  design: 'We gaan aan de slag met het ontwerp van je website. Zodra er een ontwerp klaarstaat, krijg je een mail met een link om het te bekijken en goed te keuren of feedback te geven. Inloggen is niet nodig.',
  development: 'Het ontwerp is akkoord, we gaan nu je website bouwen. Zodra er iets te zien is, krijg je een mail met een link naar de testsite.',
  oplevering: 'Je website is bijna klaar. We zetten de laatste puntjes op de i en laten je per mail weten zodra hij live staat.',
  onderhoud: 'Je website is live! Vanaf nu houden we hem voor je bij. In je portaal vind je je strippenkaart en de werkzaamheden die we voor je uitvoeren. Heb je nog geen account, dan krijg je daarvoor een aparte uitnodiging.',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const db = await requireAdmin(req)
    if (db instanceof Response) return db

    const { project_id, new_phase } = await req.json()
    if (!project_id || typeof project_id !== 'string' || !new_phase || typeof new_phase !== 'string') {
      return json({ success: false, error: 'project_id en new_phase ontbreken' }, 400)
    }

    const { data: project, error } = await db.from('projects').select('id, name').eq('id', project_id).single()
    if (error || !project) throw new Error(`Domein niet gevonden: ${error?.message || project_id}`)

    const recipients = await portalRecipients(db, project_id)
    if (recipients.length === 0) return json({ success: true, sent_to: [], note: 'Geen klanten met notify_portal=true' })

    const projectName = project.name as string
    const phaseLabel = phaseLabels[new_phase] || new_phase
    const phaseDescription = phaseDescriptions[new_phase] || `Je project is verplaatst naar de ${phaseLabel}-fase.`
    const withPortal = new_phase === 'onderhoud'
    const subject = `${projectName} is nu in de ${phaseLabel}-fase`

    const sentTo: string[] = []
    for (const r of recipients) {
      const html = mailLayout(subject, `<p style="margin:0 0 16px;">Hoi ${escapeHtml(r.name)},</p>
<p style="margin:0 0 16px;">Goed nieuws voor je project <strong>${escapeHtml(projectName)}</strong>: we zijn doorgegaan naar de <strong>${escapeHtml(phaseLabel)}</strong>-fase.</p>
<p style="margin:0 0 24px;">${escapeHtml(phaseDescription)}</p>
${withPortal ? mailButton(PORTAL_URL, 'Naar je portaal') : ''}`)
      const text = `Hoi ${r.name},

Goed nieuws voor je project ${projectName}: we zijn doorgegaan naar de ${phaseLabel}-fase.

${phaseDescription}
${withPortal ? `\nNaar je portaal:\n${PORTAL_URL}\n` : ''}
Met vriendelijke groet,
DesignPixels`
      if (await sendMail(r.email, subject, html, text)) sentTo.push(r.email)
    }

    return json({ success: true, sent_to: sentTo })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-phase-change-email error:', message)
    return json({ success: false, error: message }, 500)
  }
})
