'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { PhoneMockup } from '@/components/phone-mockup'
import styles from './template-demo-stage.module.css'

/** Shared presentation frame for every interactive template example. */
export function TemplateDemoStage({ controls, phone, children, note, id }: {
  controls: ReactNode; phone: boolean; children: ReactNode; note: ReactNode; id?: string
}) {
  const example = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const app = example.current
    if (!app) return
    const screen = () => app.querySelector('[data-preview-screen]')?.getAttribute('data-preview-screen')
    let previous = screen()
    const observer = new MutationObserver(() => {
      const current = screen()
      if (!current || current === previous) return
      const changed = previous !== undefined
      previous = current
      // A lower card can open a shorter screen. Keep its beginning below the site header.
      if (changed && app.getBoundingClientRect().top < 104) app.scrollIntoView({ block: 'start', behavior: 'instant' })
    })
    observer.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-preview-screen'] })
    return () => observer.disconnect()
  }, [])
  const app = <div ref={example} className={`demo-frame ${styles.app}`} data-template-demo-app data-ui>{children}</div>
  return <div className={styles.stage} id={id} data-phone={phone || undefined} data-template-demo>
    <div className={styles.controls}>{controls}</div>
    <div className={styles.canvas}>{phone ? <PhoneMockup height={680}>{app}</PhoneMockup> : app}</div>
    <p className={styles.note}>{note}</p>
  </div>
}
