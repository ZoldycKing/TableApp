import type { ReactNode } from 'react'
import css from './ui.module.css'

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'info' | 'wait' | 'ok' | 'bad' }) {
  return <span className={css.badge} data-tone={tone}>{children}</span>
}
