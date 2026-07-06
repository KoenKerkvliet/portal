import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Zelfde nummer-logica als src/pages/admin/InvoiceBuilder.tsx en
// supabase/functions/process-recurring-invoices/index.ts — hier gedupliceerd
// omdat edge functions los gedeployed worden.
function generateInvoiceNumber(
  prefix: string,
  yearFormat: string,
  startNumber: number,
  existingNumbers: string[],
): string {
  const currentYear = new Date().getFullYear()
  const yearStr = yearFormat === 'YY' ? String(currentYear).slice(-2) : String(currentYear)
  const basePrefix = `${prefix}${yearStr}`
  let maxNum = startNumber - 1
  for (const num of existingNumbers) {
    if (num.startsWith(basePrefix)) {
      const suffix = num.slice(basePrefix.length)
      const parsed = parseInt(suffix, 10)
      if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed
    }
  }
  return `${basePrefix}${maxNum + 1}`
}

// Maakt een echte, betaalde factuur aan voor een strippenkaart-aankoop.
// Bewust GEEN mail/notificatie hier — dat gebeurt voorlopig nog handmatig
// via de bestaande "Versturen"-knop in het admin-facturenoverzicht, zodat
// eerst gecontroleerd kan worden of de factuur er goed uitziet.
async function createInvoiceForPunchCardPurchase(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  totalPunches: number,
  amountPaid: number,
) {
  const { data: projectClient } = await supabase
    .from('project_clients')
    .select('client_id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!projectClient?.client_id) {
    throw new Error(`Geen klant gekoppeld aan project ${projectId}`)
  }

  const { data: client } = await supabase
    .from('clients')
    .select('name, email, company')
    .eq('id', projectClient.client_id)
    .single()

  const { data: settings } = await supabase
    .from('invoice_settings')
    .select('invoice_prefix, year_format, start_number, kor_enabled')
    .limit(1)
    .single()

  const { data: existingInvoices } = await supabase
    .from('invoices')
    .select('number, is_test, has_temp_number, is_recurring')

  const realNumbers = (existingInvoices || [])
    .filter((inv) => !inv.is_test && !inv.has_temp_number && !inv.is_recurring)
    .map((inv) => inv.number as string)

  const number = generateInvoiceNumber(
    settings?.invoice_prefix || 'INV',
    settings?.year_format || 'YY',
    settings?.start_number || 1,
    realNumbers,
  )

  const btwPercent = settings?.kor_enabled ? 0 : 21
  const subtotal = btwPercent > 0 ? Math.round((amountPaid / (1 + btwPercent / 100)) * 100) / 100 : amountPaid
  const today = new Date().toISOString().split('T')[0]

  const { error: invoiceError } = await supabase.from('invoices').insert({
    number,
    project_id: projectId,
    client_id: projectClient.client_id,
    amount: amountPaid,
    subtotal,
    status: 'paid',
    invoice_date: today,
    due_date: today,
    is_test: false,
    has_temp_number: false,
    is_recurring: false,
    is_deposit_invoice: false,
    is_remainder_invoice: false,
    client_name: client?.name || '',
    client_email: client?.email || '',
    client_address: client?.company || '',
    btw_percent: btwPercent,
    discount_percent: 0,
    notes: '',
    items: [
      {
        id: crypto.randomUUID(),
        type: 'product',
        name: `Strippenkaart - ${totalPunches} strippen`,
        description: `Strippenkaart met ${totalPunches} strippen, gekocht via het klantportaal.`,
        quantity: 1,
        unit: 'stuk',
        price: subtotal,
        is_recurring: false,
      },
    ],
  })

  if (invoiceError) {
    throw new Error(`Factuur aanmaken mislukt: ${invoiceError.message}`)
  }

  console.log(`Factuur ${number} aangemaakt (betaald, €${amountPaid}) voor project ${projectId}`)
}

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

      // Factuur aanmaken voor deze aankoop. Fout hierin mag de webhook niet laten
      // falen — de strippenkaart zelf staat dan al goed, dat is het belangrijkste.
      try {
        await createInvoiceForPunchCardPurchase(supabase, projectId, totalPunches, amountPaid)
      } catch (invoiceError) {
        console.error('Factuur aanmaken voor strippenkaart-aankoop mislukt:', invoiceError)
      }
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
