'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ShellIcon } from './shell/icons'

/** A disclosure with ordinary links: native Tab navigation, Escape and outside dismissal. */
export function TableActionsMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div ref={root} className="relative ms-auto min-w-0 max-w-full" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)} className="inline-flex min-h-11 items-center gap-3 rounded-lg border border-sand-200 bg-white px-3 py-2.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-sage-400">Действия с таблицей<ShellIcon name="chevron" className={`size-4 ${open ? 'rotate-180' : ''}`} /></button>
    {open ? <div id={id} role="region" aria-label="Действия с таблицей" onClick={event => { if ((event.target as Element).closest('a,button')) { setOpen(false); trigger.current?.focus() } }} className="absolute right-0 top-full z-30 mt-2 flex max-h-[70dvh] w-64 max-w-[calc(100vw-2.5rem)] flex-col gap-1 overflow-y-auto rounded-xl border border-sand-200 bg-white p-2 shadow-soft [&>a]:min-h-11 [&>a]:border-0 [&>a]:text-left [&>button]:min-h-11 [&>button]:border-0 [&>button]:text-left [&>span]:mt-1 [&>span]:min-h-11">{children}</div> : null}
  </div>
}
