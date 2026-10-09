// Mailt de klant de link naar de stagingsite (testsite) van een domein. Wordt
// alleen verstuurd als de admin op 'Mail sturen' klikt; het invullen van de link
// zelf stuurt niets. Legt projects.staging_sent_at vast. Ontvangers: gekoppelde
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

    const { project_id } = await req.json()
    if (!project_id || typeof project_id !== 'string') return json({ success: false, error: 'project_id ontbreekt' }, 400)

    const { data: project, error: projectErr } = await adminClient
      .from('projects')
      .select('id, name, staging_url')
      .eq('id', project_id)
      .single()
    if (projectErr || !project) throw new Error(`Domein niet gevonden: ${projectErr?.message || project_id}`)

    const stagingUrl = (project.staging_url as string | null)?.trim()
    if (!stagingUrl || !/^https?:\/\//.test(stagingUrl)) {
      return json({ success: false, error: 'Vul eerst een geldige link naar de stagingsite in' }, 400)
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

    const projectName = project.name as string
    const subject = `Je nieuwe website staat klaar om te bekijken`
    const sentTo: string[] = []

    for (const r of recipients) {
      const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#222;font-size:15px;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 24px;font-size:14px;color:#888;">DesignPixels</p>
<p style="margin:0 0 16px;">Hoi ${escapeHtml(r.name)},</p>
<p style="margin:0 0 16px;">De website voor <strong>${escapeHtml(projectName)}</strong> is in ontwikkeling. Op mijn testomgeving kun je alvast zien hoe hij eruitziet.</p>
<p style="margin:0 0 24px;">Let op: dit is nog niet de live website, er kan dus nog van alles veranderen.</p>
<p style="margin:0 0 24px;"><a href="${escapeHtml(stagingUrl)}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;">Testsite bekijken</a></p>
<p style="margin:0 0 24px;font-size:13px;color:#888;">Werkt de knop niet? Kopieer dan deze link:<br><a href="${escapeHtml(stagingUrl)}" style="color:#6b46c1;word-break:break-all;">${escapeHtml(stagingUrl)}</a></p>
<p style="margin:32px 0 0;font-size:14px;color:#888;">Met vriendelijke groet,<br>DesignPixels</p>
</div>
</body>
</html>`

      const text = `Hoi ${r.name},

De website voor ${projectName} is in ontwikkeling. Op mijn testomgeving kun je alvast zien hoe hij eruitziet.

Let op: dit is nog niet de live website, er kan dus nog van alles veranderen.

Testsite bekijken:
${stagingUrl}

Met vriendelijke groet,
DesignPixels`

      const emailResponse = await fetch('https://api.emailit.com/v2/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${EMAILIT_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: EMAILIT_FROM, to: r.email, subject, html, text }),
      })
      if (!emailResponse.ok) {
        console.error(`EmailIt API error for ${r.email}: ${emailResponse.status} ${await emailResponse.text()}`)
        continue
      }
      sentTo.push(r.email)
    }

    let sentAt: string | null = null
    if (sentTo.length > 0) {
      sentAt = new Date().toISOString()
      await adminClient.from('projects').update({ staging_sent_at: sentAt }).eq('id', project_id)
    } else {
      throw new Error('Geen enkele mail kon verstuurd worden')
    }

    return json({ success: true, sent_to: sentTo, sent_at: sentAt })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-staging-email error:', message)
    return json({ success: false, error: message }, 500)
  }
})
