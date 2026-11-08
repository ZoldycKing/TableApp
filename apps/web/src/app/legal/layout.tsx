import type { ReactNode } from 'react'
import { MarketingShell } from '@/components/marketing/blocks'
import styles from '@/components/marketing/elaya/content-pages.module.css'

/** Правовые страницы живут отдельно от лендинга: тут нужен текст, а не сцены. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <MarketingShell signedIn={false}>
      <div className={styles.legal}>{children}</div>
    </MarketingShell>
  )
}
