// Mails uit de Oplevering-fase, alleen verstuurd als de admin op 'Mail sturen' klikt:
//   kind 'live'   — de website staat live, met een knop naar projects.url
//   kind 'review' — verzoek om een review (reviewlink uit invoice_settings.review_url),
//                   met 6 gratis strippen als bedankje
// Legt projects.live_sent_at / review_requested_at vast. Ontvangers: gekoppelde
// klanten met 'Portaalmails' aan. Alleen aanroepbaar door admins.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const isHttpUrl = (url: string | null | undefined): url is string => !!url && /^https?:\/\//.test(url.trim())

const button = (url: string, label: string) =>
  `<p style="margin:0 0 24px;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;">${label}</a></p>
<p style="margin:0 0 24px;font-size:13px;color:#888;">Werkt de knop niet? Kopieer dan deze link:<br><a href="${escapeHtml(url)}" style="color:#6b46c1;word-break:break-all;">${escapeHtml(url)}</a></p>`

function buildMail(kind: 'live' | 'review', name: string, projectName: string, url: string) {
  const greeting = `<p style="margin:0 0 16px;">Hoi ${escapeHtml(name)},</p>`
  const closing = `<p style="margin:32px 0 0;font-size:14px;color:#888;">Met vriendelijke groet,<br>DesignPixels</p>`
  if (kind === 'live') {
    return {
      subject: `Je website staat live!`,
      body: `${greeting}
<p style="margin:0 0 16px;">Goed nieuws: de website van <strong>${escapeHtml(projectName)}</strong> staat live! Vanaf nu is hij voor iedereen te bezoeken.</p>
${button(url, 'Bekijk je website')}
<p style="margin:0 0 16px;">Heb je vragen, of wil je later iets laten aanpassen? Laat het me gerust weten.</p>
${closing}`,
      text: `Hoi ${name},

Goed nieuws: de website van ${projectName} staat live! Vanaf nu is hij voor iedereen te bezoeken.

Bekijk je website:
${url}

Heb je vragen, of wil je later iets laten aanpassen? Laat het me gerust weten.

Met vriendelijke groet,
DesignPixels`,
    }
  }
  return {
    subject: `Wil je een review achterlaten? Je krijgt er 6 strippen voor`,
    body: `${greeting}
<p style="margin:0 0 16px;">Wat fijn dat de website van <strong>${escapeHtml(projectName)}</strong> klaar is! Ben je tevreden? Dan zou ik het heel erg waarderen als je een korte review achterlaat. Daarmee help je andere ondernemers op weg.</p>
<p style="margin:0 0 24px;">Als bedankje krijg je van mij <strong>6 gratis strippen</strong>, voor onderhoud of kleine aanpassingen aan je website.</p>
${button(url, 'Review achterlaten')}
<p style="margin:0 0 16px;">Laat het me even weten als je de review hebt geplaatst, dan zet ik de strippen voor je klaar.</p>
${closing}`,
    text: `Hoi ${name},

Wat fijn dat de website van ${projectName} klaar is! Ben je tevreden? Dan zou ik het heel erg waarderen als je een korte review achterlaat. Daarmee help je andere ondernemers op weg.

Als bedankje krijg je van mij 6 gratis strippen, voor onderhoud of kleine aanpassingen aan je website.

Review achterlaten:
${url}

Laat het me even weten als je de review hebt geplaatst, dan zet ik de strippen voor je klaar.

Met vriendelijke groet,
DesignPixels`,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ success: false, error: 'Niet geautoriseerd' }, 401)

    const EMAILIT_API_KEY = Deno.env.get('EMAILIT_API_KEY')
    if (!EMAILIT_API_KEY) throw new Error('EMAILIT_API_KEY not configured')

    const EMAILIT_FROM = Deno.env.get('EMAILIT_FROM') || 'DesignPixels <noreply@designpixels.nl>'
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Identificeer aanroeper en check admin-rol
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ success: false, error: 'Niet ingelogd' }, 401)

    const adminClient = createClient(supabaseUrl, serviceKey)
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (callerProfile?.role !== 'admin') return json({ success: false, error: 'Geen admin-rechten' }, 403)

    const { project_id, kind } = await req.json()
    if (!project_id || typeof project_id !== 'string') return json({ success: false, error: 'project_id ontbreekt' }, 400)
    if (kind !== 'live' && kind !== 'review') return json({ success: false, error: 'Onbekend soort mail' }, 400)

    const { data: project, error: projectErr } = await adminClient
      .from('projects')
      .select('id, name, url')
      .eq('id', project_id)
      .single()
    if (projectErr || !project) throw new Error(`Domein niet gevonden: ${projectErr?.message || project_id}`)

    let url: string
    if (kind === 'live') {
      if (!isHttpUrl(project.url)) return json({ success: false, error: 'Vul eerst de website in bij Algemeen' }, 400)
      url = project.url.trim()
    } else {
      const { data: settings } = await adminClient.from('invoice_settings').select('review_url').limit(1).maybeSingle()
      if (!isHttpUrl(settings?.review_url)) {
        return json({ success: false, error: 'Stel eerst je reviewlink in bij Instellingen → Facturen → Bedrijfsgegevens' }, 400)
      }
      url = settings.review_url.trim()
    }

    const { data: pcRows } = await adminClient
      .from('project_clients')
      .select('notify_portal, client:clients(name, email)')
      .eq('project_id', project_id)

    const recipients: { name: string; email: string }[] = []
    for (const row of (pcRows || []) as Array<{ notify_portal: boolean; client: { name: string; email: string } | null }>) {
      if (!row.notify_portal || !row.client?.email) continue
      recipients.push({ name: row.client.name || 'klant', email: row.client.email })
    }
    if (recipients.length === 0) return json({ success: true, sent_to: [], note: 'Geen klanten met notify_portal=true' })

    const sentTo: string[] = []
    for (const r of recipients) {
      const mail = buildMail(kind, r.name, project.name as string, url)
      const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(mail.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#222;font-size:15px;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 24px;font-size:14px;color:#888;">DesignPixels</p>
${mail.body}
</div>
</body>
</html>`
      const emailResponse = await fetch('https://api.emailit.com/v2/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${EMAILIT_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: EMAILIT_FROM, to: r.email, subject: mail.subject, html, text: mail.text }),
      })
      if (!emailResponse.ok) {
        console.error(`EmailIt API error for ${r.email}: ${emailResponse.status} ${await emailResponse.text()}`)
        continue
      }
      sentTo.push(r.email)
    }
    if (sentTo.length === 0) throw new Error('Geen enkele mail kon verstuurd worden')

    const sentAt = new Date().toISOString()
    await adminClient
      .from('projects')
      .update(kind === 'live' ? { live_sent_at: sentAt } : { review_requested_at: sentAt })
      .eq('id', project_id)

    return json({ success: true, sent_to: sentTo, sent_at: sentAt })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-delivery-email error:', message)
    return json({ success: false, error: message }, 500)
  }
})
