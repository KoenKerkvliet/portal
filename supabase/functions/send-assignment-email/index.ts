// Verstuurt de opdracht(omschrijving) naar de klant. De klant krijgt een link
// waarmee de opdracht zonder inloggen te bekijken en te accepteren is
// (/d/opdracht/:token). Alleen aanroepbaar door admins (aanroepende JWT +
// role-check op profiles).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { publicDocumentUrl } from '../_shared/publicLink.ts'

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

    const { assignment_id } = await req.json()
    if (!assignment_id || typeof assignment_id !== 'string') {
      return json({ success: false, error: 'assignment_id ontbreekt' }, 400)
    }

    const { data: assignment, error: assignmentErr } = await adminClient
      .from('assignments')
      .select('id, title, project_id, client:clients(name, email), project:projects(name, client:clients(name, email))')
      .eq('id', assignment_id)
      .single()
    if (assignmentErr || !assignment) {
      throw new Error(`Opdracht niet gevonden: ${assignmentErr?.message || assignment_id}`)
    }

    type Contact = { name: string | null; email: string | null } | null
    const a = assignment as unknown as {
      title: string
      client: Contact
      project: { name: string; client: Contact } | null
    }

    // Klant van de opdracht; anders de hoofdklant van het domein
    const contact = a.client?.email ? a.client : a.project?.client
    const recipientEmail = contact?.email
    const recipientName = contact?.name || 'klant'
    const projectName = a.project?.name || 'je project'
    if (!recipientEmail) throw new Error('Klant heeft geen e-mailadres — kan geen mail sturen')

    const assignmentUrl = await publicDocumentUrl(adminClient, 'assignments', assignment_id)
    const title = escapeHtml(a.title)

    const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Opdracht ter bevestiging</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#222;font-size:15px;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 24px;font-size:14px;color:#888;">DesignPixels</p>
<p style="margin:0 0 16px;">Hoi ${escapeHtml(recipientName)},</p>
<p style="margin:0 0 16px;">Voor je project <strong>${escapeHtml(projectName)}</strong> staat de opdrachtomschrijving voor je klaar:</p>
<p style="margin:0 0 16px;"><strong>${title}</strong></p>
<p style="margin:0 0 24px;">Via de knop hieronder lees je de opdracht en geef je akkoord. Inloggen is niet nodig.</p>
<p style="margin:0 0 24px;"><a href="${assignmentUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;">Opdracht bekijken</a></p>
<p style="margin:0 0 24px;font-size:13px;color:#888;">Werkt de knop niet? Kopieer dan deze link:<br><a href="${assignmentUrl}" style="color:#6b46c1;word-break:break-all;">${assignmentUrl}</a></p>
<p style="margin:32px 0 0;font-size:14px;color:#888;">Met vriendelijke groet,<br>DesignPixels</p>
</div>
</body>
</html>`

    const text = `Hoi ${recipientName},

Voor je project ${projectName} staat de opdrachtomschrijving voor je klaar:

${a.title}

Via deze link lees je de opdracht en geef je akkoord (inloggen is niet nodig):
${assignmentUrl}

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
        to: recipientEmail,
        subject: `Opdracht ter bevestiging: ${a.title}`,
        html,
        text,
      }),
    })

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text()
      throw new Error(`EmailIt API error: ${emailResponse.status} ${errorText}`)
    }

    // Vastleggen dat de opdracht gemaild is; een concept wordt 'verzonden'
    const sentAt = new Date().toISOString()
    await adminClient.from('assignments').update({ last_sent_at: sentAt }).eq('id', assignment_id)
    await adminClient.from('assignments').update({ status: 'sent' }).eq('id', assignment_id).eq('status', 'draft')

    return json({ success: true, sent_to: recipientEmail, sent_at: sentAt })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-assignment-email error:', message)
    return json({ success: false, error: message }, 500)
  }
})
