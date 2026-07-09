// Start een Stripe Checkout-sessie voor een strippenkaart-aankoop.
//
// Belangrijk: het AANTAL strippen wordt hier serverzijdig uit de priceId
// bepaald (PRICE_STRIPS), niet uit de client. Anders zou een gebruiker de
// goedkoopste prijs kunnen combineren met een groot aantal strippen.

// Inline cors (geen ../_shared-import) zodat de function ook los te deployen is.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Autoritatieve prijs → aantal strippen. Houd dit gelijk aan de plannen in
// src/pages/client/PunchCardShop.tsx.
const PRICE_STRIPS: Record<string, number> = {
  'price_1SK2keLuTqlntkE3h5E3LLRe': 12, // 60 min — € 40
  'price_1SK2mCLuTqlntkE3rEXsSNDu': 36, // 180 min — € 100
  'price_1SK2n2LuTqlntkE3XCKb6ux9': 60, // 300 min — € 160
}

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
    const { priceId, projectId, origin } = body

    if (!priceId || !projectId) {
      throw new Error('Missing required fields: priceId, projectId')
    }

    // Aantal strippen serverzijdig bepalen; onbekende priceId weigeren.
    const strips = PRICE_STRIPS[priceId]
    if (!strips) {
      throw new Error('Onbekende priceId')
    }

    const base = origin || 'https://portal.designpixels.nl'

    // Create Stripe Checkout Session
    const params = new URLSearchParams()
    params.append('mode', 'payment')
    params.append('success_url', `${base}/strippenkaart?success=true`)
    params.append('cancel_url', `${base}/strippenkaart`)
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
