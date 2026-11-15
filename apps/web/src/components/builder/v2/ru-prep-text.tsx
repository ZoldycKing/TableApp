import type { ReactNode } from 'react'
import styles from './ru-prep-text.module.css'

/** One-letter Russian prepositions that typographs glue with NBSP. */
const PREP = 'АаВвИиКкОоСсУу'

/**
 * Normalize NBSP/NNBSP after one-letter prepositions to a regular space and
 * wrap the prep+word so inherited negative letter-spacing cannot shrink that
 * gap below a normal Manrope space (reads as «Оклиенте» / «Осделке» otherwise).
 */
export function ruPrepText(text: string): ReactNode {
  if (!text) return text
  const normalized = text
    .replace(new RegExp(`(^|\\s)([${PREP}])[\u00a0\u202f\u2009]+`, 'g'), '$1$2 ')
  const re = new RegExp(`(^|\\s)([${PREP}]) ([^\\s]+)`, 'g')
  const nodes: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(normalized))) {
    if (match.index > last) nodes.push(normalized.slice(last, match.index))
    if (match[1]) nodes.push(match[1])
    nodes.push(
      <span key={key++} className={styles.prepNowrap}>
        {match[2]} {match[3]}
      </span>,
    )
    last = match.index + match[0].length
  }
  if (last === 0) return normalized
  if (last < normalized.length) nodes.push(normalized.slice(last))
  return nodes.length === 1 ? nodes[0] : <>{nodes}</>
}
