'use client'
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {BuilderThemeContext} from './theme-context'
import { createPortal } from 'react-dom'
import { ProtoIcon } from './icons'
import styles from './prototype.module.css'

export function PrototypeDialog({ title, children, onClose, closeDisabled = false }: { title: string; children: ReactNode; onClose: () => void; closeDisabled?: boolean }) {
  const theme=useContext(BuilderThemeContext)
  const ref = useRef<HTMLDialogElement>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    if (!mounted) return
    const node = ref.current!, previous = document.activeElement
    node.showModal(); node.querySelector<HTMLInputElement>('input')?.focus()
    return () => { node.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [mounted])
  if (!mounted) return null
  return createPortal(<dialog ref={ref} className={`${styles.dialog} ${theme?.className??''}`} data-scheme={theme?.scheme} style={theme?.style} aria-label={title} onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}><div className={styles.dialogInner}>
    <header><h2>{title}</h2><button type="button" className={styles.iconButton} aria-label="Закрыть окно" disabled={closeDisabled} onClick={onClose}><ProtoIcon name="close" /></button></header>{children}
  </div></dialog>, document.body)
}
