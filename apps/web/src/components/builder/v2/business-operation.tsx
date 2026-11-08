'use client'

import type { AppV2Node } from '@tableapp/schema/app-v2'
import { BUILDER_BUSINESS_COPY, type BuilderBusinessApp, type BuilderBusinessLink } from '@/lib/builder-v2-business-types'
import { ProtoIcon } from '../prototype/icons'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'

type BusinessNode = Extract<AppV2Node, { type: 'business' }>

export function BuilderBusinessSettings({ node, apps, tableId, onChange }: {
  node: BusinessNode; apps: readonly BuilderBusinessApp[]; tableId: string | null; onChange: (node: BusinessNode) => void
}) {
  const groups = apps.map(app => ({ ...app, operations: app.operations.filter(item => !item.recordTableId || item.recordTableId === tableId) }))
    .filter(app => app.operations.length)
  const value = node.target ? `${node.target.appId}:${node.target.operation}` : ''
  const available = groups.some(app => app.operations.some(item => `${app.id}:${item.operation}` === value))
  return <>
    <label>Рабочий сценарий
      <select value={value} onChange={event => {
        const [appId, operation] = event.target.value.split(':')
        const item = groups.find(app => app.id === appId)?.operations.find(item => item.operation === operation)
        const currentLabel = node.target && BUILDER_BUSINESS_COPY[node.target.operation].label
        const useDefault = !node.name.trim() || node.name === 'Бизнес-операция' || node.name === currentLabel
        onChange({ ...node, ...(item && useDefault ? { name: BUILDER_BUSINESS_COPY[item.operation].label } : {}), target: appId && item ? { appId, operation: item.operation } : null })
      }}>
        <option value="">Выберите операцию</option>
        {value && !available && <option value={value}>Текущая операция недоступна</option>}
        {groups.map(app => <optgroup key={app.id} label={app.name}>
          {app.operations.map(({ operation }) => <option key={operation} value={`${app.id}:${operation}`}>{BUILDER_BUSINESS_COPY[operation].label}</option>)}
        </optgroup>)}
      </select>
    </label>
    <p className={ui.hint}>{groups.length ? 'Операция откроется в связанном приложении.' : 'Опубликуйте приложение со складом, производством или записью по времени.'}</p>
    {!tableId && apps.some(app => app.operations.some(item => item.recordTableId)) ? <p className={ui.hint}>Чтобы принять или выдать конкретный товар, добавьте операцию в карточку товара.</p> : null}
  </>
}

export function BuilderBusinessOperation({ node, link, apps }: { node: BusinessNode; link?: BuilderBusinessLink; apps?: readonly BuilderBusinessApp[] }) {
  const operation = link?.operation ?? node.target?.operation
  const copy = operation ? BUILDER_BUSINESS_COPY[operation] : null
  const name = link?.name ?? apps?.find(app => app.id === node.target?.appId)?.name
  return <div className={ui.businessOperation}>
    <div><ProtoIcon name={copy?.icon ?? 'action'} size={20} /><span>{name ?? 'Рабочий сценарий'}</span></div>
    {link ? <a className={styles.secondary} href={link.href}>{node.name.trim() || copy?.label}<ProtoIcon name="arrow" size={16} /></a>
      : copy ? <><strong>{node.name.trim() || copy.label}</strong><p className={ui.hint}>Откроется после публикации</p></>
      : <p className={ui.hint}>Выберите операцию в свойствах элемента.</p>}
  </div>
}
