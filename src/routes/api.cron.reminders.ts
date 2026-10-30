import { createFileRoute } from '@tanstack/react-router'
import { findDueReminderCustomers, recordAutomationLog } from '../../lib/database.mjs'
import { triggerAutomation } from '../../lib/automation'

export const Route = createFileRoute('/api/cron/reminders')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET || ''
        if (!secret) return Response.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
        if (request.headers.get('x-cron-secret') !== secret) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const due = findDueReminderCustomers(3)
        const results = []
        for (const customer of due) {
          const payload = {
            type: 'REMINDER' as const, customer_name: customer.name, customer_email: customer.email,
            customer_phone: customer.phone, size_kg: customer.sizeKg, shop_name: process.env.SHOP_NAME || 'GasUp',
            shop_address: process.env.SHOP_ADDRESS || 'No. 50 Efosa Close, off Aerodrome Close, Benin City, Edo State, Nigeria',
            subject: `Time to refill your ${customer.sizeKg} kg cylinder`,
            message: `Hello ${customer.name}, based on your refill history your ${customer.sizeKg} kg cylinder may run out in about ${customer.daysLeft} days. Order a refill with GasUp to avoid the queue.`,
          }
          try {
            await triggerAutomation(payload)
            recordAutomationLog('REMINDER', undefined, customer.customerId, 'SENT')
            results.push({ customerId: customer.customerId, status: 'SENT' })
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Automation failed'
            recordAutomationLog('REMINDER', undefined, customer.customerId, 'FAILED', message)
            results.push({ customerId: customer.customerId, status: 'FAILED', error: message })
          }
        }
        return Response.json({ processed: results.length, results })
      },
    },
  },
})
