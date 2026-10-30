import { createFileRoute } from '@tanstack/react-router'
import { listUserCylinderRefillEstimates, saveUserCylinderRefillEstimate } from '../../lib/database.mjs'
import { getSessionUser } from '../../lib/auth.mjs'

export const Route = createFileRoute('/api/customer/reminder')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = getSessionUser(request)
        if(!user || user.role!=='CUSTOMER') return Response.json({error:'Customer login required'},{status:401})
        return Response.json({estimates:listUserCylinderRefillEstimates(user.id)})
      },
      POST: async ({ request }) => {
        const user = getSessionUser(request)
        if(!user || user.role!=='CUSTOMER') return Response.json({error:'Customer login required'},{status:401})
        const origin = request.headers.get('origin')
        if (origin && new URL(origin).origin !== new URL(request.url).origin) return Response.json({ error: 'Cross-origin request rejected' }, { status: 403 })
        const input = await request.json().catch(() => null)
        if (!input || !Number.isInteger(input.days) || input.days < 7 || input.days > 90 || typeof input.sizeKg !== 'number' || !Number.isFinite(input.sizeKg)) {
          return Response.json({ error: 'Choose a cylinder and enter an estimate between 7 and 90 days' }, { status: 400 })
        }
        const saved = saveUserCylinderRefillEstimate(user.id,input.sizeKg,input.days)
        return saved ? Response.json({ ok:true }) : Response.json({ error:'That cylinder size is unavailable' }, { status:404 })
      },
    },
  },
})
