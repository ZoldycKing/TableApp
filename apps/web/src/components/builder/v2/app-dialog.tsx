'use client'
import type { ReactNode } from 'react'
import { ProtoIcon } from '../prototype/icons'
import css from './app-dialog.module.css'

/** Centred dialog inside the app frame; a bottom sheet when the frame is narrow. */
export function AppDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className={css.host}>
      <button type="button" className={css.scrim} aria-label="Закрыть" onClick={onClose} />
      <div className={css.panel} role="dialog" aria-modal="true" aria-label={title}>
        <div className={css.header}>
          <h2>{title}</h2>
          <button type="button" className={css.close} aria-label="Закрыть" onClick={onClose}><ProtoIcon name="close" size={18} /></button>
        </div>
        <div className={css.body}>{children}</div>
      </div>
    </div>
  )
}
