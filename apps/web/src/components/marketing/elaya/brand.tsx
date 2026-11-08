import styles from './site.module.css'

/** The existing TableApp mark, set in the landing skill's single typeface. */
export function ElayaBrand() {
  return <span className={styles.brand}>
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#527157" /><path d="M9 10h14M9 16h9M9 22h11" stroke="white" strokeWidth="2.5" strokeLinecap="round" /></svg>
    <span>TableApp</span>
  </span>
}
