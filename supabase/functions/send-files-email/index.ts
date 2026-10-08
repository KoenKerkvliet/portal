// Mailt de klant de link naar de omgeving om bestanden te delen (projects.
// file_sharing_url). Wordt alleen verstuurd als de admin op 'Mail sturen' klikt;
// de link invullen zelf stuurt niets. De klant kan de link meerdere keren
// gebruiken. Legt projects.files_sent_at vast. Ontvangers: gekoppelde klanten met
// 'Portaalmails' aan. Alleen aanroepbaar door admins.

import { corsHeaders, escapeHtml, json, mailButton, mailLayout, portalRecipients, requireAdmin, sendMail } from '../_shared/projectMail.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const db = await requireAdmin(req)
    if (db instanceof Response) return db

    const { project_id } = await req.json()
    if (!project_id || typeof project_id !== 'string') return json({ success: false, error: 'project_id ontbreekt' }, 400)

    const { data: project, error } = await db.from('projects').select('id, name, file_sharing_url').eq('id', project_id).single()
    if (error || !project) throw new Error(`Domein niet gevonden: ${error?.message || project_id}`)

    const url = (project.file_sharing_url as string | null)?.trim()
    if (!url || !/^https?:\/\//.test(url)) return json({ success: false, error: 'Vul eerst een geldige link voor bestanden delen in' }, 400)

    const recipients = await portalRecipients(db, project_id)
    if (recipients.length === 0) return json({ success: true, sent_to: [], note: 'Geen klanten met notify_portal=true' })

    const projectName = project.name as string
    const subject = `Je bestanden voor ${projectName} met ons delen`
    const sentTo: string[] = []
    for (const r of recipients) {
      const html = mailLayout(subject, `<p style="margin:0 0 16px;">Hoi ${escapeHtml(r.name)},</p>
<p style="margin:0 0 16px;">We gaan aan de slag met <strong>${escapeHtml(projectName)}</strong>. Heb je teksten, foto's, een logo of andere bestanden voor je website? Via de knop hieronder kom je in een omgeving waar je ze met ons kunt delen.</p>
${mailButton(url, 'Bestanden delen')}
<p style="margin:0 0 16px;">Je kunt deze link zo vaak gebruiken als je wilt, ook later nog. Bewaar deze mail dus even.</p>`)
      const text = `Hoi ${r.name},

We gaan aan de slag met ${projectName}. Heb je teksten, foto's, een logo of andere bestanden voor je website? Via deze link kom je in een omgeving waar je ze met ons kunt delen:
${url}

Je kunt deze link zo vaak gebruiken als je wilt, ook later nog. Bewaar deze mail dus even.

Met vriendelijke groet,
DesignPixels`
      if (await sendMail(r.email, subject, html, text)) sentTo.push(r.email)
    }
    if (sentTo.length === 0) throw new Error('Geen enkele mail kon verstuurd worden')

    const sentAt = new Date().toISOString()
    await db.from('projects').update({ files_sent_at: sentAt }).eq('id', project_id)
    return json({ success: true, sent_to: sentTo, sent_at: sentAt })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-files-email error:', message)
    return json({ success: false, error: message }, 500)
  }
})
