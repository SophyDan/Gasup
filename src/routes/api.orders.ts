import { createFileRoute } from '@tanstack/react-router'
import { createOrder, listCustomerOrders, listStaffOrders, updateOrderStatus } from '../../lib/database.mjs'
import { getSessionUser } from '../../lib/auth.mjs'

export const Route = createFileRoute('/api/orders')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user=getSessionUser(request)
        if(user?.role==='CUSTOMER') return Response.json({orders:mapOrders(listCustomerOrders(user.id))})
        if (user?.role !== 'STAFF') return Response.json({ error: 'Login required' }, { status: 401 })
        return Response.json({ orders:mapOrders(listStaffOrders()) })
      },
      PATCH: async ({ request }) => {
        if (getSessionUser(request)?.role !== 'STAFF') return Response.json({ error: 'Staff login required' }, { status: 401 })
        const input = await request.json().catch(() => null)
        const allowed = ['PREPARING','READY','OUT_FOR_DELIVERY','COMPLETED','CANCELLED']
        if (!input?.orderId || !allowed.includes(input.status)) return Response.json({ error: 'Invalid order status' }, { status: 400 })
        return updateOrderStatus(input.orderId,input.status)
          ? Response.json({ ok:true })
          : Response.json({ error:'Order not found' }, { status:404 })
      },
      POST: async ({ request }) => {
        const user = getSessionUser(request)
        if (!user || user.role !== 'CUSTOMER') return Response.json({ error: 'Sign in as a customer to place an order' }, { status: 401 })
        const origin = request.headers.get('origin')
        if (origin && new URL(origin).origin !== new URL(request.url).origin) return Response.json({ error: 'Cross-origin request rejected' }, { status: 403 })
        const input = await request.json().catch(() => null)
        if (!input ||
          !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 6 ||
          !Number.isFinite(input.sizeKg) || !['PICKUP','DELIVERY'].includes(input.fulfilment) ||
          (input.fulfilment === 'DELIVERY' && (typeof input.deliveryAddress !== 'string' || input.deliveryAddress.trim().length < 5))) {
          return Response.json({ error: 'Please check the order details and try again' }, { status: 400 })
        }
        try {
          const order = createOrder({
            customerName: user.name, customerEmail: user.email,
            customerPhone: user.phone, sizeKg: input.sizeKg, quantity: input.quantity,
            fulfilment: input.fulfilment, deliveryAddress: input.deliveryAddress?.trim() || '',
          })
          return Response.json(order, { status: 201 })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not create order'
          return Response.json({ error: message }, { status: 400 })
        }
      },
    },
  },
})

function mapOrders(orders:any[]){
  const statusMap: Record<string,string> = { PENDING:'new', PAID:'new', PREPARING:'preparing', READY:'ready', OUT_FOR_DELIVERY:'out', COMPLETED:'done', CANCELLED:'cancelled' }
  return orders.map((order:any) => ({
    id:order.id, customerName:order.customerName, customerPhone:order.customerPhone, customerEmail:order.customerEmail,
    size:order.sizeKg, qty:order.quantity, type:order.fulfilment.toLowerCase(), address:order.deliveryAddress,
    total:order.totalPrice, createdAt:order.createdAt, readyAt:order.readyAt, completedAt:order.completedAt,
    status:statusMap[order.status] || 'new', unitPrice:0, deliveryFee:0, _server:true,
    payment:{status:order.paymentStatus==='SUCCESS'?'paid':'unpaid',method:'paystack',ref:order.paymentReference || '',amount:order.totalPrice,at:0},
  }))
}
