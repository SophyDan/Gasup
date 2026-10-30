import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { consumePasswordResetToken, getUserById, savePasswordResetToken } from './database.mjs'

const SESSION_TTL = 60 * 60 * 24 * 14
function sessionSecret() {
  const configured = process.env.SESSION_SECRET
  if (configured && configured.length >= 32) return configured
  if (configured) throw new Error('SESSION_SECRET must be at least 32 characters')
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be configured in production')
  return 'gasup-local-development-session-secret-change-before-deploy'
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password,salt,64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password, encoded) {
  const [scheme,salt,expectedHex] = String(encoded || '').split('$')
  if (scheme !== 'scrypt' || !salt || !expectedHex) return false
  const expected = Buffer.from(expectedHex,'hex')
  const actual = scryptSync(password,salt,expected.length)
  return expected.length === actual.length && timingSafeEqual(expected,actual)
}

export function timingSafeStringEqual(value, expectedValue) {
  const actual=Buffer.from(String(value)), expected=Buffer.from(String(expectedValue))
  return actual.length===expected.length && timingSafeEqual(actual,expected)
}

export function createPasswordResetToken(userId) {
  const token=randomBytes(32).toString('base64url')
  const tokenHash=createHash('sha256').update(token).digest('hex')
  savePasswordResetToken(userId,tokenHash,Date.now()+30*60*1000)
  return token
}

export function completePasswordReset(token,password) {
  const tokenHash=createHash('sha256').update(token).digest('hex')
  return consumePasswordResetToken(tokenHash,hashPassword(password))
}

function sign(value) {
  return createHmac('sha256',sessionSecret()).update(value).digest('base64url')
}

export function issueSession(user) {
  const issuedAt=Date.now()
  const payload = Buffer.from(JSON.stringify({sub:user.id,role:user.role,iat:issuedAt,exp:Math.floor(issuedAt/1000)+SESSION_TTL})).toString('base64url')
  const token = `${payload}.${sign(payload)}`
  return `gasup_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}${process.env.NODE_ENV==='production'?'; Secure':''}`
}

export function clearSession() {
  return `gasup_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV==='production'?'; Secure':''}`
}

export function getSessionUser(request) {
  try {
    const raw = request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith('gasup_session='))?.slice('gasup_session='.length)
    if (!raw) return null
    const [payload,signature] = raw.split('.')
    const actual = Buffer.from(signature,'base64url')
    const expected = Buffer.from(sign(payload),'base64url')
    if (actual.length !== expected.length || !timingSafeEqual(actual,expected)) return null
    const session = JSON.parse(Buffer.from(payload,'base64url').toString())
    if (session.exp < Math.floor(Date.now()/1000)) return null
    const user = getUserById(session.sub)
    if (user?.passwordChangedAt && session.iat < user.passwordChangedAt) return null
    return user && user.role === session.role ? user : null
  } catch { return null }
}

export function safeUser(user) {
  return user ? {id:user.id,name:user.name,email:user.email,phone:user.phone,address:user.address,role:user.role,manualRefillDays:user.manualRefillDays} : null
}
