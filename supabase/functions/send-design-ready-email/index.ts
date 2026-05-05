// Verstuurt een mail naar de klant zodra de admin een design-bestand
// (styleguide / homepage / contactpagina) upload, zodat de klant weet dat hij
// het mag beoordelen. Ondersteunt zowel een eerste upload als een nieuwe versie
// na eerdere afkeuring. Alleen aanroepbaar door admins.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PORTAL_URL = 'https://portal.designpixels.nl'

const designLabels: Record<string, string> = {
  styleguide: 'Styleguide',
  homepage: 'Homepage',
  contactpage: 'Contactpagina',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Niet geautoriseerd' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const EMAILIT_API_KEY = Deno.env.get('EMAILIT_API_KEY')
    if (!EMAILIT_API_KEY) throw new Error('EMAILIT_API_KEY not configured')

    const EMAILIT_FROM = Deno.env.get('EMAILIT_FROM') || 'DesignPixels <noreply@designpixels.nl>'
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Niet ingelogd' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const adminClient = createClient(supabaseUrl, serviceKey)
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (callerProfile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'Geen admin-rechten' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { project_id, design_type, is_new_version } = await req.json()
    if (
      !project_id || typeof project_id !== 'string' ||
      !design_type || typeof design_type !== 'string' ||
      !designLabels[design_type]
    ) {
      return new Response(
        JSON.stringify({ success: false, error: 'project_id en geldige design_type vereist' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const newVersion = !!is_new_version
    const designLabel = designLabels[design_type]

    const { data: project, error: projectErr } = await adminClient
      .from('projects')
      .select('id, name')
      .eq('id', project_id)
      .single()
    if (projectErr || !project) {
      throw new Error(`Project niet gevonden: ${projectErr?.message || project_id}`)
    }

    const { data: pcRows } = await adminClient
      .from('project_clients')
      .select('notify_portal, client:clients(name, email)')
      .eq('project_id', project_id)

    type Recipient = { name: string; email: string }
    const recipients: Recipient[] = []
    for (const row of (pcRows || []) as Array<{ notify_portal: boolean; client: { name: string; email: string } | null }>) {
      if (!row.notify_portal) continue
      if (!row.client?.email) continue
      recipients.push({ name: row.client.name || 'klant', email: row.client.email })
    }

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent_to: [], note: 'Geen klanten met notify_portal=true' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const deeplink = `${PORTAL_URL}/design/${design_type}/${project_id}`
    const subject = newVersion
      ? `Nieuwe versie van je ${designLabel.toLowerCase()} staat klaar`
      : `Je ${designLabel.toLowerCase()} staat klaar voor beoordeling`

    const introHtml = newVersion
      ? `Op basis van je feedback hebben we een nieuwe versie van de <strong>${designLabel.toLowerCase()}</strong> klaargezet voor je project <strong>${project.name}</strong>.`
      : `De <strong>${designLabel.toLowerCase()}</strong> voor je project <strong>${project.name}</strong> staat klaar voor beoordeling.`

    const introText = newVersion
      ? `Op basis van je feedback hebben we een nieuwe versie van de ${designLabel.toLowerCase()} klaargezet voor je project ${project.name}.`
      : `De ${designLabel.toLowerCase()} voor je project ${project.name} staat klaar voor beoordeling.`

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
<p style="margin:0 0 16px;">Hoi ${r.name},</p>
<p style="margin:0 0 16px;">${introHtml}</p>
<p style="margin:0 0 24px;">Open het ontwerp in je portaal om het te bekijken, feedback te geven of goed te keuren:</p>
<p style="margin:0 0 24px;"><a href="${deeplink}" style="color:#6b46c1;">${deeplink}</a></p>
<p style="margin:32px 0 0;font-size:14px;color:#888;">Met vriendelijke groet,<br>DesignPixels</p>
</div>
</body>
</html>`

      const text = `Hoi ${r.name},

${introText}

Open het ontwerp in je portaal om het te bekijken, feedback te geven of goed te keuren:
${deeplink}

Met vriendelijke groet,
DesignPixels`

      const emailResponse = await fetch('https://api.emailit.com/v2/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${EMAILIT_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: EMAILIT_FROM,
          to: r.email,
          subject,
          html,
          text,
        }),
      })

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text()
        console.error(`EmailIt API error for ${r.email}: ${emailResponse.status} ${errorText}`)
        continue
      }
      sentTo.push(r.email)
    }

    return new Response(
      JSON.stringify({ success: true, sent_to: sentTo }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-design-ready-email error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
