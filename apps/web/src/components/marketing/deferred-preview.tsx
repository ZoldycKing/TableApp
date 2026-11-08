'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import type { AppShell } from '@/components/runtime/app-shell'
import type { TemplatePreviewProps } from './template-preview-shell'

function PreviewPlaceholder() {
  return <div className="flex h-full min-h-80 flex-col gap-4 bg-sand-50 p-6" role="status">
    <p className="text-sm text-ink-soft">Открываем интерактивный пример…</p>
    <div aria-hidden="true" className="grid gap-4">
      {[0, 1, 2].map(item => <div key={item} className="h-24 rounded-2xl border border-sand-200 bg-white" />)}
    </div>
  </div>
}

const TemplateRuntime = dynamic(() => import('./template-preview-shell').then(module => module.TemplatePreviewShell), { ssr: false, loading: PreviewPlaceholder })
const AppRuntime = dynamic(() => import('@/components/runtime/app-shell').then(module => module.AppShell), { ssr: false, loading: PreviewPlaceholder })

/** Import the runtime only when the example is near the viewport. */
function PreviewGate({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (visible) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '200px' })
    if (root.current) observer.observe(root.current)
    return () => observer.disconnect()
  }, [visible])
  return <div ref={root} className="h-full min-w-0" onFocusCapture={() => setVisible(true)}>{visible ? children : <PreviewPlaceholder />}</div>
}

export function DeferredTemplatePreview(props: TemplatePreviewProps) {
  return <PreviewGate><TemplateRuntime {...props} /></PreviewGate>
}

export function DeferredAppPreview(props: ComponentProps<typeof AppShell>) {
  return <PreviewGate><AppRuntime {...props} /></PreviewGate>
}
