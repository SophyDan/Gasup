import { createFileRoute } from '@tanstack/react-router'
import { createPasswordResetToken } from '../../lib/auth.mjs'
import { authThrottleSeconds, getUserByEmail, recordAuthFailure, recordAutomationLog } from '../../lib/database.mjs'
import { triggerAutomation } from '../../lib/automation'

export const Route = createFileRoute('/api/auth/password-reset')({
  server: { handlers: { POST: async ({request}) => {
    const input=await request.json().catch(()=>null)
    const email=typeof input?.email==='string'?input.email.trim().toLowerCase():''
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({error:'Enter a valid email address.'},{status:400})
    if(authThrottleSeconds(email)) return Response.json({ok:true,message:'If that email belongs to a GasUp customer account, a reset link will be sent.'})
    recordAuthFailure(email)
    const user=getUserByEmail(email)
    if(user?.role==='CUSTOMER'){
      const token=createPasswordResetToken(user.id)
      const resetUrl=new URL('/',request.url)
      resetUrl.searchParams.set('password_reset',token)
      try {
        await triggerAutomation({type:'PASSWORD_RESET',customer_name:user.name,customer_email:user.email,
          shop_name:process.env.SHOP_NAME||'GasUp',shop_address:process.env.SHOP_ADDRESS||'No. 50 Efosa Close, off Aerodrome Close, Benin City, Edo State, Nigeria',
          subject:'Reset your GasUp password',message:`Hello ${user.name}, use this link within 30 minutes to reset your GasUp password: ${resetUrl.toString()}`})
        recordAutomationLog('PASSWORD_RESET',undefined,user.id,'SENT')
      } catch(error) {
        recordAutomationLog('PASSWORD_RESET',undefined,user.id,'FAILED',error instanceof Error?error.message:'Make delivery failed')
      }
    }
    return Response.json({ok:true,message:'If that email belongs to a GasUp customer account, a reset link will be sent.'})
  } } },
})
