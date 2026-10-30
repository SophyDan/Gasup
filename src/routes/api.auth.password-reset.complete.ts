import { createFileRoute } from '@tanstack/react-router'
import { completePasswordReset } from '../../lib/auth.mjs'

export const Route = createFileRoute('/api/auth/password-reset/complete')({
  server: { handlers: { POST: async ({request}) => {
    const input=await request.json().catch(()=>null)
    const token=typeof input?.token==='string'?input.token:''
    const password=typeof input?.password==='string'?input.password:''
    if(token.length<32 || token.length>128 || password.length<10 || password.length>256) return Response.json({error:'The link or new password is invalid.'},{status:400})
    try {
      if(!completePasswordReset(token,password)) return Response.json({error:'This reset link is invalid or expired.'},{status:400})
      return Response.json({ok:true})
    } catch { return Response.json({error:'Could not reset the password.'},{status:500}) }
  } } },
})
