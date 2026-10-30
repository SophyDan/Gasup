import { createFileRoute } from '@tanstack/react-router'
import { getOrderForPayment, savePendingPayment, failPayment } from '../../lib/database.mjs'
import { getSessionUser } from '../../lib/auth.mjs'
import { paystackErrorMessage } from '../../lib/paystack.mjs'

export const Route = createFileRoute('/api/paystack/initialize')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = request.headers.get('origin')
        if (origin && new URL(origin).origin !== new URL(request.url).origin) return Response.json({ error: 'Cross-origin request rejected' }, { status: 403 })
        const secret = process.env.PAYSTACK_SECRET_KEY || ''
        const publicKey = process.env.PAYSTACK_PUBLIC_KEY || ''
        if (secret.startsWith('sk_live_')) {
          console.warn('GasUp requires Paystack test keys; refusing a live secret key.')
          return Response.json({ error: 'Live Paystack keys are disabled in this app' }, { status: 503 })
        }
        if (!secret.startsWith('sk_test_') || !publicKey.startsWith('pk_test_')) return Response.json({ error: 'Matching Paystack test keys are not configured' }, { status: 503 })
        const { orderId } = await request.json().catch(() => ({}))
        const user=getSessionUser(request)
        if(user?.role!=='CUSTOMER') return Response.json({error:'Customer login required'},{status:401})
        const order = typeof orderId === 'string' ? getOrderForPayment(orderId) : null
        if (!order || order.customerId!==user.id || order.status !== 'PENDING') return Response.json({ error: 'Order cannot be paid' }, { status: 404 })

        const reference = `GASUP-${order.id}-${Date.now()}`
        const amount = Math.round(order.totalPrice * 100)
        savePendingPayment(order.id, reference, amount)
        try {
          const response = await fetch('https://api.paystack.co/transaction/initialize', {
            method: 'POST',
            headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: order.email, amount, currency: 'NGN', reference,
              callback_url: `${new URL(request.url).origin}/api/paystack/callback`,
              metadata: { order_id: order.id },
            }),
          })
          const result = await response.json().catch(() => ({}))
          if (!response.ok || !result?.data?.authorization_url) throw new Error(result?.message || 'Paystack could not initialize checkout')
          return Response.json({ authorizationUrl: result.data.authorization_url, reference })
        } catch (error) {
          failPayment(reference)
          const message = paystackErrorMessage(error, 'Paystack initialization failed')
          return Response.json({ error: message }, { status: 502 })
        }
      },
    },
  },
})
