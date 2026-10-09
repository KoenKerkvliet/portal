// Mailt de klant een vragenlijst (formulier gekoppeld aan een domein) met een link om
// hem zonder inloggen in te vullen (/d/vragenlijst/:token). Wordt alleen verstuurd als
// de admin op 'Mail sturen' klikt; koppelen zelf stuurt niets. Legt last_sent_at vast.
// Ontvangers: gekoppelde klanten met 'Portaalmails' aan. Alleen aanroepbaar door admins.

import { corsHeaders, escapeHtml, json, mailButton, mailLayout, portalRecipients, requireAdmin, sendMail } from '../_shared/projectMail.ts'
import { publicDocumentUrl } from '../_shared/publicLink.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const db = await requireAdmin(req)
    if (db instanceof Response) return db

    const { submission_id } = await req.json()
    if (!submission_id || typeof submission_id !== 'string') return json({ success: false, error: 'submission_id ontbreekt' }, 400)

    const { data: sub, error } = await db
      .from('form_submissions')
      .select('id, project_id, submitted_at, data, form:forms(title), project:projects(name)')
      .eq('id', submission_id)
      .single()
    if (error || !sub) throw new Error(`Vragenlijst niet gevonden: ${error?.message || submission_id}`)
    if (sub.submitted_at) return json({ success: false, error: 'Deze vragenlijst is al ingevuld' }, 400)

    const recipients = await portalRecipients(db, sub.project_id as string)
    if (recipients.length === 0) return json({ success: true, sent_to: [], note: 'Geen klanten met notify_portal=true' })

    const formTitle = (sub.form as unknown as { title: string } | null)?.title || 'Vragenlijst'
    const projectName = (sub.project as unknown as { name: string } | null)?.name || ''
    const started = sub.data && Object.keys(sub.data as Record<string, unknown>).length > 0
    const url = await publicDocumentUrl(db, 'form_submissions', sub.id as string)
    const subject = `${formTitle} voor ${projectName}`

    const sentTo: string[] = []
    for (const r of recipients) {
      const html = mailLayout(subject, `<p style="margin:0 0 16px;">Hoi ${escapeHtml(r.name)},</p>
<p style="margin:0 0 16px;">${started
        ? `Je bent al begonnen met de vragenlijst <strong>${escapeHtml(formTitle)}</strong> voor <strong>${escapeHtml(projectName)}</strong>. Via de knop hieronder ga je verder waar je gebleven was.`
        : `Om je website zo goed mogelijk te maken, leer ik je graag beter kennen. Wil je de vragenlijst <strong>${escapeHtml(formTitle)}</strong> voor <strong>${escapeHtml(projectName)}</strong> invullen?`}</p>
${mailButton(url, 'Vragenlijst invullen')}
<p style="margin:0 0 16px;">Inloggen is niet nodig. Wat je invult, wordt tussendoor bewaard: je kunt dus stoppen en later via dezelfde link verder.</p>`)
      const text = `Hoi ${r.name},

${started
  ? `Je bent al begonnen met de vragenlijst ${formTitle} voor ${projectName}. Via deze link ga je verder waar je gebleven was:`
  : `Om je website zo goed mogelijk te maken, leer ik je graag beter kennen. Wil je de vragenlijst ${formTitle} voor ${projectName} invullen?`}
${url}

Inloggen is niet nodig. Wat je invult, wordt tussendoor bewaard: je kunt dus stoppen en later via dezelfde link verder.

Met vriendelijke groet,
DesignPixels`
      if (await sendMail(r.email, subject, html, text)) sentTo.push(r.email)
    }
    if (sentTo.length === 0) throw new Error('Geen enkele mail kon verstuurd worden')

    const sentAt = new Date().toISOString()
    await db.from('form_submissions').update({ last_sent_at: sentAt }).eq('id', sub.id)
    return json({ success: true, sent_to: sentTo, sent_at: sentAt })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-form-email error:', message)
    return json({ success: false, error: message }, 500)
  }
})
