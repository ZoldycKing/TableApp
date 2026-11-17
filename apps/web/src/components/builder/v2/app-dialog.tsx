'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ProtoIcon } from '../prototype/icons'
import css from './app-dialog.module.css'

/** Centred dialog inside the app frame; a bottom sheet when the frame is narrow. Covers the tab bar. */
export function AppDialog({ title, onClose, children, footer, placement = 'sheet' }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; placement?: 'sheet' | 'center' }) {
  const marker = useRef<HTMLSpanElement>(null)
  const [frame, setFrame] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setFrame(marker.current?.closest('[data-navigation]') ?? marker.current?.closest('[data-app-frame]') ?? null)
  }, [])
  const panel = (
    <div className={css.host}>
      <button type="button" className={css.scrim} aria-label="Закрыть" onClick={onClose} />
      <div className={css.panel} data-placement={placement} role="dialog" aria-modal="true" aria-label={title}>
        <div className={css.header}>
          <h2>{title}</h2>
          <button type="button" className={css.close} aria-label="Закрыть" onClick={onClose}><ProtoIcon name="close" size={18} /></button>
        </div>
        <div className={css.body} data-scroll={placement === 'center' && !footer ? true : undefined} data-split={footer ? true : undefined}>{children}</div>
        {footer ? <div className={css.footer}>{footer}</div> : null}
      </div>
    </div>
  )
  return <>
    <span ref={marker} hidden />
    {frame ? createPortal(panel, frame) : panel}
  </>
}
