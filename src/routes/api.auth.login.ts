import { createFileRoute } from '@tanstack/react-router'
import { authThrottleSeconds, clearAuthFailures, getUserByEmail, recordAuthFailure } from '../../lib/database.mjs'
import { issueSession, safeUser, verifyPassword } from '../../lib/auth.mjs'

export const Route = createFileRoute('/api/auth/login')({
  server: { handlers: { POST: async ({ request }) => {
    const input=await request.json().catch(()=>null)
    const email=typeof input?.email==='string'?input.email.trim().toLowerCase():''
    const password=typeof input?.password==='string'?input.password:''
    const retryAfter=authThrottleSeconds(email)
    if(retryAfter) return Response.json({error:'Too many sign-in attempts. Try again later.'},{status:429,headers:{'Retry-After':String(retryAfter)}})
    if(password.length>256) return Response.json({error:'Email or password is incorrect.'},{status:401})
    const user=getUserByEmail(email)
    if(!user || user.role!=='CUSTOMER' || !verifyPassword(password,user.passwordHash)) {recordAuthFailure(email);return Response.json({error:'Email or password is incorrect.'},{status:401})}
    clearAuthFailures(email)
    return Response.json({user:safeUser(user)},{headers:{'Set-Cookie':issueSession(user)}})
  } } },
})
