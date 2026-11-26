'use client'

import { XIcon } from '@phosphor-icons/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import css from './ui.module.css'

export function Modal({
  title, open, onClose, children, footer,
}: {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.querySelector<HTMLElement>('button,a,input,[tabindex]')?.focus()
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('keydown', escape)
      previous?.focus()
    }
  }, [open, onClose])
  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div className={css.scrim} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className={css.modal} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel}>
        <div className={css.modalHead}>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className={css.iconButton} aria-label="Закрыть" onClick={onClose}><XIcon size={18} /></button>
        </div>
        <div className={css.modalBody}>{children}</div>
        {footer ? <div className={css.modalFoot}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
