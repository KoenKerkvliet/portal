// Verstuurt een mail naar de klant als de admin een domein naar een nieuwe fase
// schuift en daarbij 'stil bijwerken' uitzet (bij de overgang naar development staat
// mailen standaard aan). Bevat een korte fase-specifieke uitleg zodat de klant weet
// wat er gaat gebeuren. Tijdens het project loopt alles via mail met links (zonder
// inloggen); alleen in de onderhoudsfase verwijzen we naar het portaal. Teksten in de
// ik-vorm: DesignPixels is een eenmanszaak. Ontvangers: gekoppelde klanten met
// 'Portaalmails' aan. Alleen aanroepbaar door admins.

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
  intake: 'Ik ben gestart met de intake. Alles wat je van mij nodig hebt, zoals de offerte en een uitnodiging voor het startgesprek, ontvang je per mail.',
  design: 'Ik ga aan de slag met het ontwerp van je website. Zodra er een ontwerp klaarstaat, krijg je een mail met een link om het te bekijken en goed te keuren of feedback te geven. Inloggen is niet nodig.',
  oplevering: 'Je website is bijna klaar. Ik zet de laatste puntjes op de i en laat je per mail weten zodra hij live staat.',
  onderhoud: 'Je website is live! Vanaf nu houd ik hem voor je bij. In je portaal vind je je strippenkaart en de werkzaamheden die ik voor je uitvoer. Heb je nog geen account, dan krijg je daarvoor een aparte uitnodiging.',
}

type Block = { html: string; text: string }
const para = (html: string, text: string, margin = 16): Block =>
  ({ html: `<p style="margin:0 0 ${margin}px;">${html}</p>`, text })

// Development: het wordt rustiger, maar er wordt hard gewerkt. Met de opleverdatum en
// een herinnering om foto's en teksten aan te leveren (met de link als die er is).
function developmentBlocks(dueDate: string | null, filesUrl: string | null): Block[] {
  const blocks: Block[] = [
    para(
      'Het ontwerp is akkoord, en nu begint het bouwen. In deze fase hoor je wat minder van mij, maar achter de schermen wordt hard gewerkt: ik zet de goedgekeurde ontwerpen om naar een echte website en maak de overige pagina\'s in dezelfde stijl.',
      'Het ontwerp is akkoord, en nu begint het bouwen. In deze fase hoor je wat minder van mij, maar achter de schermen wordt hard gewerkt: ik zet de goedgekeurde ontwerpen om naar een echte website en maak de overige pagina\'s in dezelfde stijl.',
    ),
  ]
  if (dueDate && /^\d{4}-\d{2}-\d{2}/.test(dueDate)) {
    const label = new Date(`${dueDate.slice(0, 10)}T12:00:00Z`)
      .toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    blocks.push(para(
      `De geplande opleverdatum is <strong>${escapeHtml(label)}</strong>. Ik werk er hard aan om die te halen.`,
      `De geplande opleverdatum is ${label}. Ik werk er hard aan om die te halen.`,
    ))
  }
  blocks.push(para(
    'Zodra de website zo goed als klaar is, krijg je van mij een mail met een link waar je hem kunt bekijken.',
    'Zodra de website zo goed als klaar is, krijg je van mij een mail met een link waar je hem kunt bekijken.',
    24,
  ))
  const filesHtml = filesUrl ? ' Je kunt ze via de knop hieronder met mij delen.' : ' Heb je ze nog niet aangeleverd? Stuur ze dan zo snel mogelijk.'
  const filesText = filesUrl ? ` Je kunt ze hier met mij delen:\n${filesUrl}` : ' Heb je ze nog niet aangeleverd? Stuur ze dan zo snel mogelijk.'
  blocks.push(para(
    `<strong>Belangrijk:</strong> lever je eigen foto's en teksten aan. Hoe eerder ik ze heb, hoe beter de website wordt en hoe makkelijker de opleverdatum haalbaar blijft.${filesHtml}`,
    `Belangrijk: lever je eigen foto's en teksten aan. Hoe eerder ik ze heb, hoe beter de website wordt en hoe makkelijker de opleverdatum haalbaar blijft.${filesText}`,
    filesUrl ? 16 : 24,
  ))
  if (filesUrl) blocks.push({ html: mailButton(filesUrl, 'Bestanden delen'), text: '' })
  return blocks
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

    const { data: project, error } = await db.from('projects').select('id, name, due_date, file_sharing_url').eq('id', project_id).single()
    if (error || !project) throw new Error(`Domein niet gevonden: ${error?.message || project_id}`)

    const recipients = await portalRecipients(db, project_id)
    if (recipients.length === 0) return json({ success: true, sent_to: [], note: 'Geen klanten met notify_portal=true' })

    const projectName = project.name as string
    const phaseLabel = phaseLabels[new_phase] || new_phase
    const filesUrl = ((project.file_sharing_url as string | null) || '').trim()
    const blocks: Block[] = new_phase === 'development'
      ? developmentBlocks(project.due_date as string | null, /^https?:\/\//.test(filesUrl) ? filesUrl : null)
      : [para(escapeHtml(phaseDescriptions[new_phase] || `Je project is verplaatst naar de ${phaseLabel}-fase.`),
          phaseDescriptions[new_phase] || `Je project is verplaatst naar de ${phaseLabel}-fase.`, 24)]
    if (new_phase === 'onderhoud') blocks.push({ html: mailButton(PORTAL_URL, 'Naar je portaal'), text: `Naar je portaal:\n${PORTAL_URL}` })
    const subject = `${projectName} is nu in de ${phaseLabel}-fase`

    const sentTo: string[] = []
    for (const r of recipients) {
      const html = mailLayout(subject, `<p style="margin:0 0 16px;">Hoi ${escapeHtml(r.name)},</p>
<p style="margin:0 0 16px;">Goed nieuws: je project <strong>${escapeHtml(projectName)}</strong> gaat door naar de <strong>${escapeHtml(phaseLabel)}</strong>-fase.</p>
${blocks.map(b => b.html).join('\n')}`)
      const text = `Hoi ${r.name},

Goed nieuws: je project ${projectName} gaat door naar de ${phaseLabel}-fase.

${blocks.map(b => b.text).filter(Boolean).join('\n\n')}

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
