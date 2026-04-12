import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
    if (!STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY not configured')
    }

    const body = await req.json().catch(() => ({}))
    const { priceId, projectId, strips, origin } = body

    if (!priceId || !projectId || !strips) {
      throw new Error('Missing required fields: priceId, projectId, strips')
    }

    // Create Stripe Checkout Session
    const params = new URLSearchParams()
    params.append('mode', 'payment')
    params.append('success_url', `${origin || 'https://koenkerkvliet.github.io/portal'}/strippenkaart?success=true`)
    params.append('cancel_url', `${origin || 'https://koenkerkvliet.github.io/portal'}/strippenkaart`)
    params.append('line_items[0][price]', priceId)
    params.append('line_items[0][quantity]', '1')
    params.append('metadata[project_id]', projectId)
    params.append('metadata[total_punches]', String(strips))
    params.append('payment_method_types[0]', 'card')
    params.append('payment_method_types[1]', 'ideal')

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`Stripe error: ${errorData.error?.message || response.statusText}`)
    }

    const session = await response.json()

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
