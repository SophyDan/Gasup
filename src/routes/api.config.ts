import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/config')({
  server: {
    handlers: {
      GET: async () => Response.json({
        ...(process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_live_')
          ? (console.warn('GasUp requires Paystack test keys; a sk_live_ key is configured.'), {})
          : {}),
        shopName: process.env.SHOP_NAME || 'GasUp',
        shopAddress: process.env.SHOP_ADDRESS || 'No. 50 Efosa Close, off Aerodrome Close, Benin City, Edo State, Nigeria',
        makeConfigured: Boolean(process.env.MAKE_WEBHOOK_URL?.trim()),
        deliveryFeeNgn: Math.max(0, Number(process.env.DELIVERY_FEE_NGN || 1500)),
        paystackConfigured: Boolean(process.env.PAYSTACK_PUBLIC_KEY?.startsWith('pk_test_') && process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_test_')),
        paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY?.startsWith('pk_test_') && process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_test_')
          ? process.env.PAYSTACK_PUBLIC_KEY : '',
      }),
    },
  },
})
