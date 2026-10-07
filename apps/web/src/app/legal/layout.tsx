import Link from 'next/link'
import type { ReactNode } from 'react'
import { SiteFooter } from '@/components/marketing/site-footer'
import { Logo } from '@/components/marketing/logo'

/** Правовые страницы живут отдельно от лендинга: тут нужен текст, а не сцены. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-sand-50 text-ink">
      <header className="border-b border-sand-200">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center px-5 sm:px-8">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <Logo />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8">{children}</main>

      <SiteFooter />
    </div>
  )
}
