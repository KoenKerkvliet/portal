import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Stripe webhook signature verification
async function verifySignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = sigHeader.split(',')
  const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1]
  const signature = parts.find(p => p.startsWith('v1='))?.split('=')[1]

  if (!timestamp || !signature) return false

  const signedPayload = `${timestamp}.${payload}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload))
  const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')

  return computed === signature
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const payload = await req.text()
    const sigHeader = req.headers.get('stripe-signature')

    // Verify webhook signature if secret is configured
    if (STRIPE_WEBHOOK_SECRET && sigHeader) {
      const valid = await verifySignature(payload, sigHeader, STRIPE_WEBHOOK_SECRET)
      if (!valid) {
        console.error('Invalid webhook signature')
        return new Response('Invalid signature', { status: 400 })
      }
    }

    const event = JSON.parse(payload)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const projectId = session.metadata?.project_id
      const totalPunches = parseInt(session.metadata?.total_punches || '12', 10)
      const amountPaid = (session.amount_total || 0) / 100 // cents to euros

      if (!projectId) {
        console.error('No project_id in session metadata')
        return new Response('Missing project_id', { status: 400 })
      }

      // Use service role to bypass RLS
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

      // Get the next card number for this project
      const { data: existingCards } = await supabase
        .from('punch_cards')
        .select('number')
        .eq('project_id', projectId)
        .order('number', { ascending: false })
        .limit(1)

      const nextNumber = (existingCards?.[0]?.number || 0) + 1

      // Create the punch card
      const { error: insertError } = await supabase.from('punch_cards').insert({
        project_id: projectId,
        number: nextNumber,
        total_punches: totalPunches,
        used_punches: 0,
        is_gift: false,
        price: amountPaid,
        status: 'active',
        purchased_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString(),
      })

      if (insertError) {
        console.error('Error creating punch card:', insertError)
        return new Response(JSON.stringify({ error: insertError.message }), { status: 500 })
      }

      console.log(`Punch card #${nextNumber} created for project ${projectId} (${totalPunches} punches, €${amountPaid})`)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
