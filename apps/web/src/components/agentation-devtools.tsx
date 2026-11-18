'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'

const Toolbar = process.env.NODE_ENV === 'development'
  ? dynamic(() => import('agentation').then(module => module.Agentation), { ssr: false })
  : null

export function AgentationDevtools() {
  const pathname = usePathname()
  if (!Toolbar) return null
  // Keep the floating toolbar off published /a apps — it overlaps inventory/CRM chrome.
  if (pathname?.startsWith('/a/') || pathname?.startsWith('/p/') || pathname?.startsWith('/dispatch-shot') || pathname?.startsWith('/projects-shot')) return null

  return (
    <Toolbar
      key={pathname}
      appName="Scatta"
      endpoint="http://127.0.0.1:4747"
      enableKeyboardShortcuts={false}
      className="hidden md:block"
    />
  )
}
