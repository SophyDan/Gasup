import { createFileRoute } from '@tanstack/react-router'
import { verifyPaystackPayment } from '../../lib/database.mjs'
import { paystackErrorMessage } from '../../lib/paystack.mjs'

export const Route = createFileRoute('/api/paystack/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const reference = url.searchParams.get('reference') || ''
        try {
          const result = reference ? await verifyPaystackPayment(reference) : { ok: false, message: 'Missing payment reference' }
          const target = new URL('/', url.origin)
          target.searchParams.set('payment', result.ok ? 'success' : 'failed')
          if (result.orderId) target.searchParams.set('orderId', result.orderId)
          if (reference) target.searchParams.set('reference', reference)
          if (result.message) target.searchParams.set('paymentMessage', result.message)
          return Response.redirect(target, 303)
        } catch (error) {
          const target = new URL('/', url.origin)
          target.searchParams.set('payment', 'failed')
          if (reference) target.searchParams.set('reference', reference)
          target.searchParams.set('paymentMessage', paystackErrorMessage(error, 'Payment verification failed'))
          return Response.redirect(target, 303)
        }
      },
    },
  },
})
