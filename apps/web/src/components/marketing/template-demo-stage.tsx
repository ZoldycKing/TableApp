import type { ReactNode } from 'react'
import styles from './template-demo-stage.module.css'

/** Shared presentation frame for every interactive template example. */
export function TemplateDemoStage({ controls, phone, children, note, id }: {
  controls: ReactNode; phone: boolean; children: ReactNode; note: ReactNode; id?: string
}) {
  return <div className={styles.stage} id={id} data-phone={phone} data-template-demo>
    <div className={styles.controls}>{controls}</div>
    <div className={styles.canvas}><div className={`demo-frame ${styles.app}`} data-template-demo-app data-ui>{children}</div></div>
    <p className={styles.note}>{note}</p>
  </div>
}
