'use client'

import { byPosition, customerWorkflows, evalFilter, indexFields, type Component, type ScreenOf } from '@tableapp/schema'
import type { ReactNode } from 'react'
import type { RuntimeApp } from '@/lib/app-runtime'
import { ComponentView, RecordField, type ComponentContext } from './component-view'
import { EmptyState } from './ui'
import { formatCell } from '@/lib/format'
import { isImage } from '@/components/file-upload'
import { DemoCatalogPhoto, useDemoCatalogPhoto } from './demo-catalog-media'
import presentation from './app-presentation.module.css'

/** Plain generated cards inherit the common task layout; authored compositions keep their order. */
export function plainRecordDetail(screen: ScreenOf<'detail'>, primaryFieldId: string | null) {
  return screen.components.length > 0 && screen.components.every(component => ['field', 'button', 'related_list', 'image', 'gallery'].includes(component.type) ||
    component.type === 'text' && component.source.kind === 'field' ||
    component.type === 'heading' && component.source.kind === 'field' && component.source.fieldId === primaryFieldId)
}

export function RecordDetail({ screen, runtime, ctx, primaryFieldId, actions, notice, catalogAction }: {
  screen: ScreenOf<'detail'>; runtime: RuntimeApp; ctx: ComponentContext; primaryFieldId: string | null; actions?: ReactNode; notice?: ReactNode; catalogAction?: ReactNode
}) {
  const { app } = runtime, stock = app.inventory, production = app.production
  const workflow = customerWorkflows(app).find(config => config.tableId === screen.tableId)
  const catalog = customerWorkflows(app).find(config => config.catalog?.detailScreenId === screen.id)?.catalog
  const service = app.booking?.tables.services === screen.tableId ? app.booking.service : undefined
  const showcase = Boolean(catalog || service)
  const catalogList = catalog && app.screens.find(item => (item.type === 'list' || item.type === 'tiles') && item.onTapScreenId === screen.id)
  const priceId = service?.price ?? (catalogList && 'metaFieldId' in catalogList ? catalogList.metaFieldId : null)
  const demoPhoto = useDemoCatalogPhoto(ctx.row?.id)
  const leads = new Set<string>([
    ...(stock && screen.tableId === stock.tables.items ? [stock.item.stock] : []),
    ...(production && screen.tableId === production.tables.production ? [production.run.qty, production.run.defects] : []),
    ...(production && screen.tableId === production.tables.norms ? [production.norm.perUnit] : []),
    ...(production && screen.tableId === production.tables.movements ? [production.movement.qty] : []),
    ...(workflow ? [workflow.statusFieldId] : []),
    ...(app.booking && screen.tableId === app.booking.tables.visits ? [app.booking.visit.status, app.booking.visit.start] : []),
  ])
  const contacts = new Set([workflow?.profile?.nameFieldId, workflow?.profile?.phoneFieldId, workflow?.emailFieldId, workflow?.assignmentFieldId])
  const components = [...screen.components].sort(byPosition).filter(component =>
    !(component.type === 'heading' && component.source.kind === 'field' && component.source.fieldId === primaryFieldId) &&
    !(component.type === 'field' && component.fieldId === primaryFieldId && !component.label) &&
    (!component.visibleWhen || !ctx.row || evalFilter(component.visibleWhen, ctx.row.data, indexFields(ctx.fields))) &&
    (component.type !== 'field' || ctx.fields.some(field => field.id === component.fieldId && (field.type === 'checkbox' || component.showWhenEmpty || Boolean(formatCell(field, ctx.row?.data[field.id]))))) &&
    (component.type !== 'image' && component.type !== 'gallery' || (Array.isArray(ctx.row?.data[component.fieldId]) && (ctx.row!.data[component.fieldId] as {mime:string}[]).some(item => isImage(item.mime)))))
  const summary = components.filter((component): component is Extract<Component, {type:'field'}> => component.type === 'field' && leads.has(component.fieldId))
  const buttons = components.filter((component): component is Extract<Component, {type:'button'}> => component.type === 'button')
  const primary = buttons.find(component => component.style === 'primary') ?? buttons.find(component => component.style !== 'danger')
  const heroAction = showcase ? catalogAction ?? (primary?.style === 'primary' ? <ComponentView component={primary} ctx={ctx} /> : null) : null
  const otherButtons = heroAction && !catalogAction ? buttons.filter(component => component !== primary) : buttons
  const stockTargets = stock && screen.tableId === stock.tables.items ? new Set([stock.receiptScreenId, stock.operations?.screens.issue]) : new Set<string>()
  const main = otherButtons.filter(component => component === primary || component.action.type === 'open_screen' && stockTargets.has(component.action.screenId))
  const secondary = otherButtons.filter(component => !main.includes(component))
  const content = components.filter(component => !summary.includes(component as typeof summary[number]) && component.type !== 'button')
  const photo = showcase ? content.find(component => component.type === 'image' || component.type === 'gallery') : undefined
  const price = showcase ? content.find((component): component is Extract<Component, { type: 'field' }> => component.type === 'field' && component.fieldId === priceId) : undefined
  const description = showcase ? content.find(component => {
    const id = component.type === 'field' ? component.fieldId : component.type === 'text' && component.source.kind === 'field' ? component.source.fieldId : null
    return Boolean(id && ctx.fields.some(field => field.id === id && field.type === 'long_text' && /описание|description/iu.test(field.name)))
  }) : undefined
  const contact = content.filter(component => component.type === 'field' && contacts.has(component.fieldId))
  const body = content.filter(component => !contact.includes(component) && component !== photo && component !== price && component !== description)
  const render = (component: Component) => component.type === 'field' ? <RecordField key={component.id} component={component} ctx={ctx} /> : <div key={component.id} className="min-w-0 @min-[640px]:col-span-2"><ComponentView component={component} ctx={ctx} /></div>
  if (!components.length && !actions && !notice && !heroAction && demoPhoto === undefined) return <EmptyState icon="file" title="На карточке пока нечего показать" />
  return <div className="@container space-y-5">
    {notice}
    {showcase && (photo || demoPhoto !== undefined || price || description || heroAction) ? <section className={presentation.detailHero} aria-label="О товаре или услуге">
      {photo ? <div className={presentation.detailMedia}><ComponentView component={photo} ctx={ctx} /></div> : demoPhoto !== undefined ? <div className={presentation.detailMedia}><DemoCatalogPhoto index={demoPhoto} /></div> : null}
      {price || description || heroAction ? <div className={presentation.detailText}>
        {price ? <RecordField component={price} ctx={ctx} emphasis showIcon={false} /> : null}
        {description ? <div>{render(description)}</div> : null}
        {heroAction}
      </div> : null}
    </section> : null}
    {summary.length || otherButtons.length || actions ? <section aria-label="Состояние и действия" className="space-y-4 rounded-2xl border border-sand-200 bg-white p-5 sm:p-6">
      {summary.length ? <div className="flex flex-wrap gap-x-8 gap-y-4">{summary.map(component => <RecordField key={component.id} component={component} ctx={ctx} emphasis />)}</div> : null}
      {otherButtons.length ? <div className={`flex flex-wrap items-center gap-3 ${summary.length ? 'border-t border-sand-200 pt-4' : ''}`}>
        {main.map(component => <ComponentView key={component.id} component={component !== primary && component.style === 'primary' ? {...component,style:'secondary'} : component} ctx={ctx} desktopButton="compact" />)}
        {secondary.length <= 1 ? secondary.map(component => <ComponentView key={component.id} component={component.style === 'primary' ? {...component,style:'secondary'} : component} ctx={ctx} desktopButton="compact" />) : <details className="relative"><summary className="flex min-h-11 cursor-pointer items-center rounded-xl border border-sand-200 px-4 text-sm text-ink-soft">Ещё действия</summary><div className="mt-3 grid gap-2">{secondary.map(component => <ComponentView key={component.id} component={component.style === 'primary' ? {...component,style:'secondary'} : component} ctx={ctx} desktopButton="compact" />)}</div></details>}
      </div> : null}
      {actions}
    </section> : null}
    {body.length ? <section aria-label="Сведения" className="rounded-2xl border border-sand-200 bg-white p-5 sm:p-6"><h2 className="mb-4 text-base font-semibold">Сведения</h2><div className="grid min-w-0 gap-x-8 gap-y-5 @min-[640px]:grid-cols-2">{body.map(render)}</div></section> : null}
    {contact.length ? <section aria-label="Контакты" className="rounded-2xl border border-sand-200 bg-white p-5 sm:p-6"><h2 className="mb-4 text-base font-semibold">Контакты</h2><div className="grid min-w-0 gap-x-8 gap-y-5 @min-[640px]:grid-cols-2">{contact.map(render)}</div></section> : null}
  </div>
}
