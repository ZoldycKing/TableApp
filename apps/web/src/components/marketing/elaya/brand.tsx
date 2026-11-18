import { Logo } from '../logo'
import styles from './site.module.css'

/** Lockup Scatta в шапке и подвале лендинга (коробка выше из‑за padding во viewBox SVG). */
export function ElayaBrand() {
  return (
    <span className={styles.brand}>
      <Logo height={34} />
    </span>
  )
}
