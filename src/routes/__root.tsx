import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'GasUp — Cooking Gas Refills' },
      { name: 'theme-color', content: '#302651' },
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: '/flame.svg' },
      { rel: 'preload', as: 'image', href: '/images/gasup-hero.jpg', fetchPriority: 'high' },
    ],
  }),
  component: Root,
})

function Root() {
  return <html lang="en"><head><HeadContent /></head><body><Outlet /><Scripts /></body></html>
}
