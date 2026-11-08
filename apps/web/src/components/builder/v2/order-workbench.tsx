'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AppV2, AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { builderV2FormattedAmount } from '@/lib/builder-v2-catalog'
import presentation from '@/components/runtime/app-presentation.module.css'
import { BuilderV2DataNode } from './data-node'
import type { builderV2RecordParent } from './collection-navigation'
import { isBuilderV2OrderTable } from './record-presentation'
import { BuilderV2RecordAvatar } from './record-visuals'
import ui from './view.module.css'

export function BuilderV2OrderWorkbench({ app, parent, tables, recordId, record, onOpen, children }: {
  app: AppV2
  parent: ReturnType<typeof builderV2RecordParent>
  tables: readonly BuilderV2Table[]
  recordId?: string
  record?: AppV2Record
  onOpen: (id: string) => void
  children: ReactNode
}) {
  const area = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(false)
  const queue = parent?.queue
  const eligible = Boolean(queue && recordId && app.appearance?.presentation !== 'centered')
  useEffect(() => {
    if (!eligible || !area.current || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWide((entry?.contentRect.width ?? 0) >= 520))
    observer.observe(area.current)
    return () => observer.disconnect()
  }, [eligible])

  if (!eligible || !parent || !queue || !recordId) return children
  const table = tables.find(table => table.id === app.sources.find(source => source.id === queue.sourceId)?.tableId)
  const amountField = table?.fields.find(field => field.id === queue.recordGroup?.amountFieldId)
  const groupField = queue.recordGroup!.fieldId
  const orders = isBuilderV2OrderTable(table)
  return <div className={ui.workbench} ref={area} data-wide={wide}>
    {wide && <aside className={`${presentation.panel} ${ui.orderQueue}`} aria-label={orders ? 'Очередь заказов' : queue.name}>
      <header><h2 className={presentation.sectionTitle}>{queue.name}</h2></header>
      <BuilderV2DataNode app={app} node={queue} live table={table} scope={{ screenId: parent.screenId }} heading={false} searchPlaceholder={orders ? 'Найти заказ' : undefined}>
        {page => page?.rows.length ? <ul>
          {page.rows.map(row => {
            const key = row.values[groupField]
            const active = row.id === recordId || (typeof key === 'string' && key.trim() !== '' || typeof key === 'number') && key === record?.values[groupField]
            const total = row.summary?.amount != null && amountField ? builderV2FormattedAmount(row.summary.amount, amountField.name) : ''
            const person = queue.subtitleFieldId ? row.display[queue.subtitleFieldId] : undefined
            return <li key={row.id}><button type="button" aria-current={active ? 'true' : undefined} onClick={() => { if (!active) onOpen(row.id) }}>
              <BuilderV2RecordAvatar id={row.id} icon={orders ? 'receipt' : 'list'} />
              <strong>{row.display[queue.titleFieldId] || 'Без названия'}</strong>
              {person && <small>{person}</small>}
              {total && <span className={ui.queueAmount}>{total}</span>}
            </button></li>
          })}
        </ul> : <p className={ui.hint}>{orders ? 'Нет заказов по этому запросу' : 'Нет записей по этому запросу'}</p>}
      </BuilderV2DataNode>
    </aside>}
    <div className={ui.workbenchDetail}>{children}</div>
  </div>
}
