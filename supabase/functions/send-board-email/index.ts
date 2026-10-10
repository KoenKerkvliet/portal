// Mailt de klant de link naar de planning (takenbord) van een domein. Wordt alleen
// verstuurd als de admin op 'Mail sturen' klikt; wijzigingen op het bord sturen niets.
// Maakt de geheime code (projects.board_token) aan als die er nog niet is en legt
// projects.board_sent_at vast. Openstaande klanttaken staan in de mail, met datum.
// Ontvangers: gekoppelde klanten met 'Portaalmails' aan. Alleen aanroepbaar door admins.

import { corsHeaders, escapeHtml, json, mailButton, mailLayout, portalRecipients, requireAdmin, sendMail } from '../_shared/projectMail.ts'

const PORTAL_URL = 'https://portal.designpixels.nl'

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const db = await requireAdmin(req)
    if (db instanceof Response) return db

    const { project_id } = await req.json()
    if (!project_id || typeof project_id !== 'string') return json({ success: false, error: 'project_id ontbreekt' }, 400)

    const { data: project, error } = await db.from('projects').select('id, name, board_token').eq('id', project_id).single()
    if (error || !project) throw new Error(`Domein niet gevonden: ${error?.message || project_id}`)

    let token = project.board_token as string | null
    if (!token) {
      token = newToken()
      const { error: tokenError } = await db.from('projects').update({ board_token: token }).eq('id', project_id)
      if (tokenError) throw new Error(`Link aanmaken mislukt: ${tokenError.message}`)
    }
    const url = `${PORTAL_URL}/d/planning/${token}`

    const recipients = await portalRecipients(db, project_id)
    if (recipients.length === 0) return json({ success: true, sent_to: [], note: 'Geen klanten met notify_portal=true' })

    const { data: clientTasks } = await db
      .from('project_tasks')
      .select('title, due_date')
      .eq('project_id', project_id)
      .eq('assignee', 'client')
      .eq('private', false)
      .neq('status', 'done')
      .is('client_done_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(8)
    const open = (clientTasks || []) as { title: string; due_date: string | null }[]

    const projectName = project.name as string
    const subject = `De planning van ${projectName}`
    const openHtml = open.length > 0
      ? `<p style="margin:0 0 8px;">Hiervoor heb ik iets van je nodig:</p>
<ul style="margin:0 0 20px;padding-left:20px;">${open.map(t => `<li style="margin:0 0 4px;">${escapeHtml(t.title)}${t.due_date ? ` <span style="color:#6b7280;">(uiterlijk ${escapeHtml(formatDate(t.due_date))})</span>` : ''}</li>`).join('')}</ul>`
      : ''
    const openText = open.length > 0
      ? `Hiervoor heb ik iets van je nodig:\n${open.map(t => `- ${t.title}${t.due_date ? ` (uiterlijk ${formatDate(t.due_date)})` : ''}`).join('\n')}\n\n`
      : ''

    const sentTo: string[] = []
    for (const r of recipients) {
      const html = mailLayout(subject, `<p style="margin:0 0 16px;">Hoi ${escapeHtml(r.name)},</p>
<p style="margin:0 0 16px;">Via de knop hieronder zie je de planning van <strong>${escapeHtml(projectName)}</strong>: wat ik nog ga doen, waar ik mee bezig ben en wat al klaar is. Onder <strong>Van jou nodig</strong> staat wat ik van jou nodig heb, en tot wanneer.</p>
${openHtml}${mailButton(url, 'Bekijk de planning')}
<p style="margin:0 0 16px;">Heb je feedback op de testsite? Die geef je via dezelfde pagina door. Inloggen is niet nodig en de planning is altijd actueel, dus bewaar de link gerust.</p>`)
      const text = `Hoi ${r.name},

Via de link hieronder zie je de planning van ${projectName}: wat ik nog ga doen, waar ik mee bezig ben en wat al klaar is. Onder "Van jou nodig" staat wat ik van jou nodig heb, en tot wanneer.

${openText}Bekijk de planning: ${url}

Heb je feedback op de testsite? Die geef je via dezelfde pagina door. Inloggen is niet nodig en de planning is altijd actueel, dus bewaar de link gerust.

Met vriendelijke groet,
DesignPixels`
      if (await sendMail(r.email, subject, html, text)) sentTo.push(r.email)
    }
    if (sentTo.length === 0) throw new Error('Geen enkele mail kon verstuurd worden')

    const sentAt = new Date().toISOString()
    await db.from('projects').update({ board_sent_at: sentAt }).eq('id', project_id)
    return json({ success: true, sent_to: sentTo, sent_at: sentAt, url })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-board-email error:', message)
    return json({ success: false, error: message }, 500)
  }
})
