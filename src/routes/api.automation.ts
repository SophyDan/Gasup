import { createFileRoute } from '@tanstack/react-router'
import { triggerAutomation, type AutomationPayload } from '../../lib/automation'
import { getAutomationCustomer, listAutomationLogs, markReadyEmailSent, prepareOrderAutomation, recordAutomationLog } from '../../lib/database.mjs'
import { getSessionUser } from '../../lib/auth.mjs'

export const Route = createFileRoute('/api/automation')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (getSessionUser(request)?.role !== 'STAFF') return Response.json({ error: 'Staff login required' }, { status: 401 })
        return Response.json({ logs: listAutomationLogs() })
      },
      POST: async ({ request }) => {
        if (getSessionUser(request)?.role !== 'STAFF') return Response.json({ error: 'Staff login required' }, { status: 401 })
        const origin = request.headers.get('origin')
        if (origin && new URL(origin).origin !== new URL(request.url).origin) {
          return Response.json({ error: 'Cross-origin request rejected' }, { status: 403 })
        }

        let payload: AutomationPayload
        try {
          payload = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }
        if (!['READY', 'REMINDER', 'PAID', 'OUT_FOR_DELIVERY', 'TEST'].includes(payload?.type) || !payload?.customer_email) {
          return Response.json({ error: 'Invalid automation payload' }, { status: 400 })
        }

        try {
          const orderState = payload.order_id ? prepareOrderAutomation(payload.order_id, payload.type) : null
          if (payload.type === 'READY' && orderState?.readyEmailSentAt) return Response.json({ ok: true, alreadySent: true })
          await triggerAutomation(payload)
          if (payload.type === 'READY' && orderState) markReadyEmailSent(payload.order_id!)
          const customerId = payload.order_id ? getAutomationCustomer(payload.order_id) : null
          recordAutomationLog(payload.type, customerId ? payload.order_id : undefined, customerId, 'SENT')
          return Response.json({ ok: true })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Automation request failed'
          const customerId = payload.order_id ? getAutomationCustomer(payload.order_id) : null
          recordAutomationLog(payload.type, customerId ? payload.order_id : undefined, customerId, 'FAILED', message)
          return Response.json({ error: message }, { status: 502 })
        }
      },
    },
  },
})
