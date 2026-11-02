import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

if (process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_live_')) {
  console.warn('GasUp uses Paystack test mode only. A live secret key is configured and payments will be refused.')
}

export default defineConfig({
  plugins: [tanstackStart(), viteReact()]
})
