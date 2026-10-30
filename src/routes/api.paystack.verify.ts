import { createFileRoute } from '@tanstack/react-router'
import { verifyPaystackPayment } from '../../lib/database.mjs'
import { paystackErrorMessage } from '../../lib/paystack.mjs'

export const Route = createFileRoute('/api/paystack/verify')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const reference = new URL(request.url).searchParams.get('reference') || ''
        if (!reference) return Response.json({ ok: false, error: 'Missing reference' }, { status: 400 })
        try {
          const result = await verifyPaystackPayment(reference)
          return Response.json(result, { status: result.ok ? 200 : result.status || 402 })
        } catch (error) {
          return Response.json({ ok: false, error: paystackErrorMessage(error, 'Payment verification failed') }, { status: 502 })
        }
      },
    },
  },
})
