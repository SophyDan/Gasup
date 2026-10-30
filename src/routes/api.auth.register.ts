import { createFileRoute } from '@tanstack/react-router'
import { activateDemoCustomer, createUser, getUserByEmail } from '../../lib/database.mjs'
import { hashPassword, issueSession, safeUser } from '../../lib/auth.mjs'

export const Route = createFileRoute('/api/auth/register')({
  server: { handlers: { POST: async ({ request }) => {
    const input = await request.json().catch(() => null)
    const name = typeof input?.name==='string' ? input.name.trim() : ''
    const email = typeof input?.email==='string' ? input.email.trim().toLowerCase() : ''
    const phone = typeof input?.phone==='string' ? input.phone.trim() : ''
    const password = typeof input?.password==='string' ? input.password : ''
    if(name.length<2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || phone.replace(/\D/g,'').length<7 || password.length<10 || password.length>256) {
      return Response.json({error:'Enter your name, a valid email and phone, and a password with at least 10 characters.'},{status:400})
    }
    const existing=getUserByEmail(email)
    if(existing && (existing.role!=='CUSTOMER' || existing.passwordHash)) return Response.json({error:'An account with that email already exists.'},{status:409})
    try {
      const passwordHash=hashPassword(password)
      const user=existing ? activateDemoCustomer(existing.id,{name,phone,passwordHash}) : createUser({name,email,phone,passwordHash,role:'CUSTOMER'})
      return Response.json({user:safeUser(user)},{headers:{'Set-Cookie':issueSession(user)}})
    } catch { return Response.json({error:'Could not create your account.'},{status:500}) }
  } } },
})
