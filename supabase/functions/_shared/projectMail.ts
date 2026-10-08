// Gedeelde bouwstenen voor mails over een domein die de admin met een knop verstuurt:
// admincontrole, ontvangers (gekoppelde klanten met 'Portaalmails' aan), opmaak en
// verzenden via EmailIt.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

export const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Geeft een service_role-client terug als de aanroeper admin is, anders een foutresponse
export async function requireAdmin(req: Request): Promise<SupabaseClient | Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ success: false, error: 'Niet geautoriseerd' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return json({ success: false, error: 'Niet ingelogd' }, 401)

  const adminClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: profile } = await adminClient.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return json({ success: false, error: 'Geen admin-rechten' }, 403)
  return adminClient
}

export async function portalRecipients(db: SupabaseClient, projectId: string) {
  const { data } = await db
    .from('project_clients')
    .select('notify_portal, client:clients(name, email)')
    .eq('project_id', projectId)
  const recipients: { name: string; email: string }[] = []
  for (const row of (data || []) as Array<{ notify_portal: boolean; client: { name: string; email: string } | null }>) {
    if (!row.notify_portal || !row.client?.email) continue
    recipients.push({ name: row.client.name || 'klant', email: row.client.email })
  }
  return recipients
}

export const mailButton = (url: string, label: string) =>
  `<p style="margin:0 0 24px;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;">${escapeHtml(label)}</a></p>
<p style="margin:0 0 24px;font-size:13px;color:#888;">Werkt de knop niet? Kopieer dan deze link:<br><a href="${escapeHtml(url)}" style="color:#6b46c1;word-break:break-all;">${escapeHtml(url)}</a></p>`

export const mailLayout = (title: string, bodyHtml: string) => `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#222;font-size:15px;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 24px;font-size:14px;color:#888;">DesignPixels</p>
${bodyHtml}
<p style="margin:32px 0 0;font-size:14px;color:#888;">Met vriendelijke groet,<br>DesignPixels</p>
</div>
</body>
</html>`

// Verstuurt via EmailIt; geeft false terug (en logt) als het mislukt
export async function sendMail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const apiKey = Deno.env.get('EMAILIT_API_KEY')
  if (!apiKey) throw new Error('EMAILIT_API_KEY not configured')
  const from = Deno.env.get('EMAILIT_FROM') || 'DesignPixels <noreply@designpixels.nl>'
  const res = await fetch('https://api.emailit.com/v2/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, text }),
  })
  if (!res.ok) {
    console.error(`EmailIt API error for ${to}: ${res.status} ${await res.text()}`)
    return false
  }
  return true
}
