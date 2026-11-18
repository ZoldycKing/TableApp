import { Logo } from '../logo'
import styles from './site.module.css'

/** Lockup Scatta в шапке и подвале лендинга. */
export function ElayaBrand() {
  return (
    <span className={styles.brand}>
      <Logo height={28} />
    </span>
  )
}
