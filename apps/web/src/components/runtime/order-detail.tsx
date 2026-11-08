'use client'

import type { Component, CustomerWorkflow, Field, ScreenOf } from '@tableapp/schema'
import { byPosition, evalFilter, indexFields } from '@tableapp/schema'
import type { ReactNode } from 'react'
import type { RuntimeApp } from '@/lib/app-runtime'
import { formatCell } from '@/lib/format'
import { ComponentView, FieldValue, type ComponentContext } from './component-view'
import { StatusPill } from './ui'
import { Icon } from './icons'
import { RecordFieldLabel } from './record-field-label'
import presentation from './app-presentation.module.css'

/** Keep authored layouts intact. This presentation groups the starter's plain order fields only. */
export function usesOrderDetail(screen: ScreenOf<'detail'>, config: CustomerWorkflow | undefined) {
  return Boolean(config?.cart && config.logistics?.kind === 'sales' && screen.components.some(component => component.type === 'related_list' && component.relationFieldId === config.cart!.positionsFieldId) && screen.components.every(component =>
    component.type === 'field' || component.type === 'button' || component.type === 'related_list' ||
    component.type === 'text' && component.source.kind === 'field'))
}

export function orderAmount(field: Field, value: unknown, priceField?: Field): string {
  if (field.type === 'rollup' && typeof value === 'number' && Number.isFinite(value) && priceField?.type === 'number' && priceField.options.format === 'currency') {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: priceField.options.currency || 'RUB', maximumFractionDigits: 2 }).format(value)
  }
  return formatCell(field, value)
}

export function OrderDetail({ screen, config, runtime, ctx, actions }: {
  screen: ScreenOf<'detail'>; config: CustomerWorkflow; runtime: RuntimeApp; ctx: ComponentContext; actions?: ReactNode
}) {
  const row = ctx.row!, fields = ctx.fields, cart = config.cart!
  const sourceId = (component: Component) => component.type === 'field' ? component.fieldId : component.type === 'text' && component.source.kind === 'field' ? component.source.fieldId : null
  const fieldFor = (component: Component) => fields.find(field => field.id === sourceId(component))
  const components = [...screen.components].sort(byPosition).filter(component => {
    if (component.visibleWhen && !evalFilter(component.visibleWhen, row.data, indexFields(fields))) return false
    if (component.type !== 'field' && component.type !== 'text') return true
    const field = fieldFor(component)
    return Boolean(field && (component.type === 'field' && (component.showWhenEmpty || field.type === 'checkbox') || formatCell(field, row.data[field.id])))
  })
  const primaryId = runtime.tables[config.tableId]?.primaryFieldId
  const status = components.find(component => component.type === 'field' && component.fieldId === config.statusFieldId)
  const total = components.find(component => {
    const field = fieldFor(component)
    return field?.type === 'rollup' && field.options.relationFieldId === cart.positionsFieldId && field.options.fn === 'sum'
  })
  const items = components.find(component => component.type === 'related_list' && component.relationFieldId === cart.positionsFieldId)
  const count = components.find(component => {
    const field = fieldFor(component)
    return component.type === 'field' && !component.label && field?.type === 'count' && field.options.relationFieldId === cart.positionsFieldId
  })
  const paid = components.find(component => {
    const field = fieldFor(component)
    return component.type === 'field' && !component.label && field?.type === 'checkbox' && field.name === 'Оплачен'
  })
  const contactIds = new Set([config.profile?.nameFieldId, config.profile?.phoneFieldId])
  const secondaryIds = new Set([config.emailFieldId, config.assignmentFieldId, config.createdFieldId])
  const used = new Set<Component>([status, total, items, count, paid].filter((item): item is Component => Boolean(item)))
  const contacts: Component[] = [], receiving: Component[] = [], secondary: Component[] = [], remaining: Component[] = [], buttons: Component[] = []
  for (const component of components) {
    if (used.has(component)) continue
    const field = fieldFor(component), id = sourceId(component)
    if (id === primaryId && component.type === 'field' && !component.label) continue
    if (component.type === 'button') buttons.push(component)
    else if (id && secondaryIds.has(id)) secondary.push(component)
    else if ((id && contactIds.has(id)) || field?.type === 'phone' || field?.type === 'email' || field?.type === 'text' && field.name === 'Покупатель') contacts.push(component)
    else if (id === config.logistics?.addressFieldId || field?.type === 'date' || component.type === 'text') receiving.push(component)
    else remaining.push(component)
  }
  const itemTable = runtime.tables[cart.itemsTableId]
  const priceField = itemTable?.fields.find(field => field.id === cart.itemPriceFieldId)
  const statusField = status && fieldFor(status), totalField = total && fieldFor(total)
  const countField = count && fieldFor(count), paidField = paid && fieldFor(paid)
  const section = (title: string, entries: Component[]) => entries.length ? <section className="min-w-0" aria-label={title}>
    <h2 className={`mb-3 ${presentation.sectionTitle}`}>{title}</h2>
    <div className="space-y-3">{entries.map(component => component.type === 'field' ? <OrderField key={component.id} component={component} ctx={ctx} /> : <ComponentView key={component.id} component={component} ctx={ctx} />)}</div>
  </section> : null
  return <div className="@container space-y-5">
    <section aria-label="Состояние заказа" className={`${presentation.panel} p-5 sm:p-6`}>
      <div className="grid gap-3 @min-[560px]:flex @min-[560px]:flex-wrap @min-[560px]:items-center @min-[560px]:justify-between">
        <div className="flex flex-wrap items-center gap-3">{statusField ? <StatusPill field={statusField} value={row.data[statusField.id]} /> : null}{paidField ? <span className="text-xs text-ink-soft">{row.data[paidField.id] ? 'Оплачен' : 'Не оплачен'}</span> : null}</div>
        {totalField && row.data[totalField.id] != null ? <div className="@min-[560px]:ml-auto @min-[560px]:text-right @min-[560px]:[&>span]:justify-end"><RecordFieldLabel as="span" label={total?.type === 'field' ? total.label ?? 'Сумма заказа' : 'Сумма заказа'} showIcon={false} /><strong className="mt-1 block text-3xl font-bold tracking-tight tabular-nums">{orderAmount(totalField, row.data[totalField.id], priceField)}</strong></div> : null}
      </div>
      {actions}
    </section>
    <div className="grid items-start gap-5 @min-[760px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section aria-label="Состав заказа" className={`${presentation.panel} p-5 sm:p-6`}>
        <h2 className={`mb-2 flex items-baseline gap-2 ${presentation.sectionTitle}`}>Состав заказа{countField && row.data[countField.id] != null ? <span className="text-sm font-normal tabular-nums text-ink-muted">{formatCell(countField, row.data[countField.id])}</span> : null}</h2>
        {items?.type === 'related_list' ? <div className="divide-y divide-sand-200">{ctx.relatedRows(items.relationFieldId).slice(0, items.limit).map(item => {
          const quantity = item.row?.data[cart.quantityFieldId], price = item.row?.data[cart.itemPriceFieldId]
          const quantityField = itemTable?.fields.find(field => field.id === cart.quantityFieldId)
          const hasQuantity = quantityField && typeof quantity === 'number' && Number.isFinite(quantity)
          const hasPrice = priceField && typeof price === 'number' && Number.isFinite(price)
          const content = <><span className="min-w-0 flex-1"><span className="block text-sm font-medium leading-relaxed [overflow-wrap:anywhere]">{item.title}</span>{hasQuantity || hasPrice ? <span className="mt-1 block text-xs leading-relaxed text-ink-muted">{hasQuantity ? `${formatCell(quantityField, quantity)}${hasPrice ? ' × ' : ' ед.'}` : ''}{hasPrice ? formatCell(priceField, price) : ''}</span> : null}</span>{hasQuantity && hasPrice ? <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCell(priceField, quantity * price)}</span> : null}{items.onTapScreenId ? <Icon name="back" className="size-4 shrink-0 rotate-180 text-ink-muted" /> : null}</>
          return items.onTapScreenId ? <button key={item.id} type="button" onClick={() => ctx.onOpenRow?.(items.onTapScreenId!, item.id)} className="flex w-full items-center gap-3 py-4 text-left transition-colors hover:text-sage-700 focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-600">{content}</button> : <div key={item.id} className="flex items-center gap-3 py-4">{content}</div>
        })}</div> : <p className="py-3 text-sm text-ink-muted">Состав заказа не указан.</p>}
        {remaining.length ? <div className="mt-3 space-y-3 border-t border-sand-200 pt-4">{remaining.map(component => component.type === 'field' ? <OrderField key={component.id} component={component} ctx={ctx} /> : <ComponentView key={component.id} component={component} ctx={ctx} />)}</div> : null}
      </section>
      {receiving.length || contacts.length || buttons.length ? <div className={`${presentation.panel} space-y-5 p-5 sm:p-6`}>
        {section('Получение', receiving)}
        {receiving.length && contacts.length ? <hr className="border-sand-200" /> : null}
        {section('Контакты', contacts)}
        {buttons.length ? <div className="flex flex-wrap gap-2 border-t border-sand-200 pt-4">{buttons.map(component => <ComponentView key={component.id} component={component.type === 'button' && component.style === 'primary' ? { ...component, style: 'secondary' } : component} ctx={ctx} desktopButton="compact" />)}</div> : null}
      </div> : null}
    </div>
    {secondary.length ? <section aria-label="Дополнительно" className="px-1"><h2 className="mb-3 text-sm font-semibold">Дополнительно</h2><div className="grid gap-4 @min-[760px]:grid-cols-3">{secondary.map(component => component.type === 'field' ? <OrderField key={component.id} component={component} ctx={ctx} /> : <ComponentView key={component.id} component={component} ctx={ctx} />)}</div></section> : null}
  </div>
}

function OrderField({ component, ctx }: { component: Extract<Component, { type: 'field' }>; ctx: ComponentContext }) {
  const field = ctx.fields.find(field => field.id === component.fieldId)
  if (!field || !ctx.row) return null
  const value = ctx.row.data[field.id], text = formatCell(field, value)
  if (!text && !component.showWhenEmpty && field.type !== 'checkbox') return null
  return <dl className="min-w-0"><RecordFieldLabel label={component.label ?? field.name} field={field} /><dd className="mt-1 text-sm leading-relaxed [overflow-wrap:anywhere]"><FieldValue field={field} value={value} ctx={ctx} /></dd></dl>
}
