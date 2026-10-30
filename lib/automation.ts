export type AutomationType = 'READY' | 'REMINDER' | 'PAID' | 'OUT_FOR_DELIVERY' | 'TEST' | 'PASSWORD_RESET'

export type AutomationPayload = {
  type: AutomationType
  order_id?: string
  customer_name: string
  customer_email: string
  customer_phone?: string
  size_kg?: number
  quantity?: number
  fulfilment?: 'PICKUP' | 'DELIVERY'
  delivery_address?: string
  shop_name: string
  shop_address: string
  subject: string
  message: string
}

/** Sends automation data to Make. Email delivery remains Make's responsibility. */
export async function triggerAutomation(payload: AutomationPayload) {
  const webhookUrl = process.env.MAKE_WEBHOOK_URL?.trim()
  if (!webhookUrl) throw new Error('MAKE_WEBHOOK_URL is not configured')

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(`Make webhook returned HTTP ${response.status}`)
  }
}
