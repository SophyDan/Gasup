import { createFileRoute } from '@tanstack/react-router'
import { verifyPaystackPayment } from '../../lib/database.mjs'
import { verifyPaystackSignature } from '../../lib/paystack.mjs'

export const Route = createFileRoute('/api/paystack/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.PAYSTACK_SECRET_KEY || ''
        if (secret.startsWith('sk_live_')) {
          console.warn('GasUp Paystack webhook requires a test secret key; live keys are disabled.')
          return Response.json({ error: 'Live Paystack keys are disabled' }, { status: 503 })
        }
        const rawBody = await request.text()
        if (!verifyPaystackSignature(rawBody, request.headers.get('x-paystack-signature'), secret)) {
          return Response.json({ error: 'Invalid Paystack signature' }, { status: 401 })
        }
        let event: any
        try { event = JSON.parse(rawBody) } catch { return Response.json({ error: 'Invalid event body' }, { status: 400 }) }
        if (event?.event !== 'charge.success') return Response.json({ received: true, ignored: true })
        const reference = typeof event?.data?.reference === 'string' ? event.data.reference : ''
        if (!reference) return Response.json({ error: 'Missing payment reference' }, { status: 400 })
        try {
          const result = await verifyPaystackPayment(reference)
          return result.ok
            ? Response.json({ received: true, orderId: result.orderId })
            : Response.json({ error: result.message || 'Payment verification failed' }, { status: result.status || 502 })
        } catch {
          return Response.json({ error: 'Could not verify payment event' }, { status: 502 })
        }
      },
    },
  },
})
