'use client'

import { useEffect, useRef } from 'react'
import { CorrespondenceModule } from '@/components/runtime/correspondence-module'
import type { ServiceConversationShot } from './service-screens'

function scrollIntoNearestScroller(node: HTMLElement) {
  let parent: HTMLElement | null = node.parentElement
  while (parent) {
    const { overflowY } = getComputedStyle(parent)
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight + 8) {
      const top = node.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop - 12
      parent.scrollTop = Math.max(0, top)
      return
    }
    parent = parent.parentElement
  }
  if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'start' })
}

/** Isolated so service-screens can lazy-load this without pulling conversation DB clients into every unit test. */
export function ServiceConversationShotPanel({
  desk,
  tableId,
  repairId,
  shot,
  slaBadge,
}: {
  desk: boolean
  tableId: string
  repairId: string
  shot: ServiceConversationShot
  slaBadge?: string | null
}) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = root.current?.querySelector('form') ?? root.current
    if (!(node instanceof HTMLElement)) return
    const id = window.requestAnimationFrame(() => scrollIntoNearestScroller(node))
    return () => window.cancelAnimationFrame(id)
  }, [shot])
  return (
    <div ref={root} data-conversation-shot-panel="">
      <CorrespondenceModule
        slug="service-demo"
        tableId={tableId}
        rowId={repairId}
        configured
        business={desk}
        showContext={false}
        slaBadge={desk ? slaBadge : null}
        fixture={shot.preview}
        fixtureFiles={shot.previewFiles}
        fixtureAlert={shot.previewAlert ?? null}
      />
    </div>
  )
}
