import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  useEffect(() => {
    if (document.querySelector('script[data-gasup-app="true"]')) return
    const script = document.createElement('script')
    script.src = '/gasup.js'
    script.dataset.gasupApp = 'true'
    script.async = true
    document.body.appendChild(script)
  }, [])

  return <>
    <header><div className="hd">
      <div className="logo"><span className="flame" aria-hidden="true">🔥</span><span>gasup</span></div>
      <div className="sp" />
      <nav className="nav" id="nav">
        <button data-action="nav-view" data-view="customer" id="nav-cust">Customer</button>
        <button data-action="auth-open" id="nav-auth">Sign in</button>
        <button data-action="nav-view" data-view="staff" id="nav-staff">Staff</button>
      </nav>
    </div></header>
    <main id="app" />
    <div id="toasts" />
    <div id="modal-root" />
  </>
}
