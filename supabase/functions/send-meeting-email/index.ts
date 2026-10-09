// Mailt de klant de uitnodiging/bevestiging voor het startgesprek (projects.
// start_meeting_at, optioneel start_meeting_location: adres of videolink), met een
// agenda-uitnodiging (.ics) als bijlage. Wordt alleen
// verstuurd als de admin op 'Mail sturen' klikt; de datum invullen zelf stuurt
// niets. Opnieuw sturen na een wijziging werkt de afspraak in de agenda bij (zelfde
// UID, hogere SEQUENCE). Legt start_meeting_sent_at en start_meeting_sent_for vast.
// Ontvangers: gekoppelde klanten met 'Portaalmails' aan. Alleen aanroepbaar door admins.

import { corsHeaders, escapeHtml, json, mailButton, mailLayout, portalRecipients, requireAdmin, sendMail } from '../_shared/projectMail.ts'

const DURATION_MINUTES = 60
const TIME_ZONE = 'Europe/Amsterdam'

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

// RFC 5545: regels langer dan 75 octets vouwen (vervolgregel begint met een spatie)
const fold = (line: string) => {
  const parts: string[] = []
  for (let i = 0; i < line.length; i += 70) parts.push((i ? ' ' : '') + line.slice(i, i + 70))
  return parts.join('\r\n')
}

const toBase64 = (s: string) => {
  let binary = ''
  for (const byte of new TextEncoder().encode(s)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const db = await requireAdmin(req)
    if (db instanceof Response) return db

    const { project_id } = await req.json()
    if (!project_id || typeof project_id !== 'string') return json({ success: false, error: 'project_id ontbreekt' }, 400)

    const { data: project, error } = await db.from('projects').select('id, name, start_meeting_at, start_meeting_location').eq('id', project_id).single()
    if (error || !project) throw new Error(`Domein niet gevonden: ${error?.message || project_id}`)

    if (!project.start_meeting_at) return json({ success: false, error: 'Vul eerst een datum en tijd voor het startgesprek in' }, 400)
    const start = new Date(project.start_meeting_at as string)
    if (start.getTime() < Date.now()) return json({ success: false, error: 'Het startgesprek ligt in het verleden' }, 400)
    const end = new Date(start.getTime() + DURATION_MINUTES * 60_000)

    const recipients = await portalRecipients(db, project_id)
    if (recipients.length === 0) return json({ success: true, sent_to: [], note: 'Geen klanten met notify_portal=true' })

    const projectName = project.name as string
    const day = start.toLocaleDateString('nl-NL', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const time = start.toLocaleTimeString('nl-NL', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })
    const when = `${day} om ${time}`
    const subject = `Startgesprek ${projectName}: ${day}, ${time}`
    // Locatie is optioneel: een adres, "telefonisch" of een videolink
    const location = ((project.start_meeting_location as string | null) || '').trim()
    const locationUrl = /^https?:\/\/\S+$/i.test(location) ? location : ''

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//DesignPixels//Klantportaal//NL',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:startgesprek-${project.id}@designpixels.nl`,
      `SEQUENCE:${Math.floor(Date.now() / 1000)}`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      fold(`SUMMARY:${icsText(`Startgesprek ${projectName} met DesignPixels`)}`),
      fold(`DESCRIPTION:${icsText(`Startgesprek over de nieuwe website voor ${projectName}.${locationUrl ? `\nDeelnemen: ${locationUrl}` : ''}`)}`),
      ...(location ? [fold(`LOCATION:${icsText(location)}`)] : []),
      ...(locationUrl ? [fold(`URL:${locationUrl}`)] : []),
      'ORGANIZER;CN=DesignPixels:mailto:info@designpixels.nl',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
    const attachments = [{ filename: 'startgesprek.ics', content: toBase64(ics), content_type: 'text/calendar' }]

    const sentTo: string[] = []
    for (const r of recipients) {
      const html = mailLayout(subject, `<p style="margin:0 0 16px;">Hoi ${escapeHtml(r.name)},</p>
<p style="margin:0 0 16px;">Leuk dat we aan de slag gaan met <strong>${escapeHtml(projectName)}</strong>! Hierbij de bevestiging van ons startgesprek:</p>
<p style="margin:0 0 24px;padding:14px 18px;background:#f5f3ff;border-radius:10px;font-weight:600;color:#4c1d95;">${escapeHtml(when)}${location && !locationUrl ? `<br><span style="font-weight:400;">${escapeHtml(location)}</span>` : ''}</p>
${locationUrl ? `<p style="margin:0 0 12px;">We spreken elkaar online. Via deze knop doe je op het afgesproken moment mee:</p>\n${mailButton(locationUrl, 'Deelnemen aan het gesprek')}` : ''}
<p style="margin:0 0 16px;">In de bijlage vind je een agenda-uitnodiging, zodat je de afspraak met één klik in je agenda zet.</p>
<p style="margin:0 0 16px;">Komt dit moment toch niet goed uit? Laat het even weten, dan zoeken we samen een ander moment.</p>`)
      const text = `Hoi ${r.name},

Leuk dat we aan de slag gaan met ${projectName}! Hierbij de bevestiging van ons startgesprek:

${when}${location && !locationUrl ? `\n${location}` : ''}
${locationUrl ? `\nWe spreken elkaar online. Op het afgesproken moment doe je mee via:\n${locationUrl}\n` : ''}
In de bijlage vind je een agenda-uitnodiging, zodat je de afspraak met één klik in je agenda zet.

Komt dit moment toch niet goed uit? Laat het even weten, dan zoeken we samen een ander moment.

Met vriendelijke groet,
DesignPixels`
      if (await sendMail(r.email, subject, html, text, attachments)) sentTo.push(r.email)
    }
    if (sentTo.length === 0) throw new Error('Geen enkele mail kon verstuurd worden')

    const sentAt = new Date().toISOString()
    await db.from('projects').update({ start_meeting_sent_at: sentAt, start_meeting_sent_for: project.start_meeting_at, start_meeting_sent_location: location || null }).eq('id', project_id)
    return json({ success: true, sent_to: sentTo, sent_at: sentAt })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-meeting-email error:', message)
    return json({ success: false, error: message }, 500)
  }
})
