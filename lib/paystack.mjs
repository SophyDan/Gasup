import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyPaystackSignature(rawBody, signature, secret) {
  if (!signature || !secret.startsWith('sk_test_')) return false
  const expected = Buffer.from(createHmac('sha512',secret).update(rawBody,'utf8').digest('hex'),'utf8')
  const actual = Buffer.from(signature,'utf8')
  return actual.length === expected.length && timingSafeEqual(actual,expected)
}

export function paystackErrorMessage(error, fallback) {
  const causeCode = error && typeof error === 'object' && 'cause' in error
    ? error.cause?.code
    : undefined
  if (['EACCES','ENETUNREACH','ECONNREFUSED','EAI_AGAIN','ENOTFOUND','ETIMEDOUT'].includes(causeCode)) {
    return 'This server cannot reach Paystack. Check outbound HTTPS access to api.paystack.co, then retry.'
  }
  return error instanceof Error ? error.message : fallback
}
