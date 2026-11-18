import { Logo } from '../logo'
import styles from './site.module.css'

/** Lockup Scatta в шапке и подвале лендинга (~26px desktop, ~22–23px phone). */
export function ElayaBrand() {
  return (
    <span className={styles.brand}>
      <Logo height={26} />
    </span>
  )
}
