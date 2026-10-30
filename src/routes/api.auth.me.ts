import { createFileRoute } from '@tanstack/react-router'
import { clearSession, getSessionUser, safeUser } from '../../lib/auth.mjs'

export const Route = createFileRoute('/api/auth/me')({
  server: { handlers: {
    GET: async ({request}) => Response.json({user:safeUser(getSessionUser(request))}),
    DELETE: async () => Response.json({ok:true},{headers:{'Set-Cookie':clearSession()}}),
  } },
})
