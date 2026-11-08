'use client'

import type { Action, Field, Screen } from '@tableapp/schema'
import { byPosition, customerWorkflows, fieldTimeZone, isComputed } from '@tableapp/schema'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatCell } from '@/lib/format'
import type { RuntimeApp, RuntimeTable } from '@/lib/app-runtime'
import type { RelatedTitles } from '@/lib/queries'
import type { TableRow } from '@/lib/table-store'
import { CollectionView } from './collection-view'
import { BookingVisits } from './booking-visits'
import { CustomerRecords } from './customer-records'
import { EMPTY_LIST_STATE, type ListState } from './app-shell'
import { ComponentView, type ComponentContext } from './component-view'
import { DashboardView } from './dashboard-view'
import { accentClasses, type Viewer } from './bindings'
import { Icon } from './icons'
import { EmptyState } from './ui'
import { FormFieldInput } from './form-field'
import { useUnsaved } from '@/lib/unsaved'
import { bookingVisitSection } from '@/lib/booking-lifecycle'
import { CatalogHub } from './catalog-hub'
import type { RuntimePageControls } from '@/lib/use-screen-runtime'
import { customerFormPresentation } from '@/lib/customer-form-presentation'
import { catalogFieldUnits } from '@/lib/catalog-field-units'
import { sameCellValue } from '@/lib/cell-conflict'
import { productionCancellationCopy } from '@/lib/production-copy'
import { OrderDetail, usesOrderDetail } from './order-detail'
import { RecordDetail, plainRecordDetail } from './record-detail'

export type RuntimeFormDraft = { values: Record<string, unknown>; baseVersion?: number }

type Props = {
  screen: Screen
  table: RuntimeTable | undefined
  row: TableRow | null
  collection: { rows: TableRow[]; shownFields: Field[] } | null
  viewer: Viewer
  accent: string
  relatedTitles: RelatedTitles
  runtime: RuntimeApp
  /** Экран открыт владельцем в конструкторе: ему видно то, что нужно поправить. */
  editing?: boolean
  pending?: boolean
  /** Editable create-form values supplied by an action on another card. */
  initialValues?: Record<string, unknown>
  draft?: RuntimeFormDraft | null
  onDraftChange?: (draft: RuntimeFormDraft) => void
  now?: number
  /** Отбор списка: хранится в оболочке, чтобы пережить открытие карточки. */
  listState?: ListState
  onListState?: (next: ListState) => void
  pageControls?: Readonly<Record<string, RuntimePageControls>>
  /** Адрес выгрузки списка; `null` — если выгружать нечего или не из чего. */
  exportHref?: string | null
  onOpenRow: (screenId: string, rowId: string) => void
  onOpenScreen: (screenId: string, filter?: Partial<ListState>) => void
  onAction: (action: Action) => void
  onSubmit: (values: Record<string, unknown>, mode: 'create' | 'edit', baseVersion?: number) => void
  /**
   * Что сейчас введено в форме. Нужно там, где ответ на введённое считает
   * сервер: расход материалов по количеству выпуска показывается до
   * сохранения и тем же расчётом, которым потом спишет.
   */
  onValues?: (values: Record<string, unknown>) => void
  /** Блок над кнопкой отправки: предпросмотр того, что произойдёт. */
  formSlot?: ReactNode
  /**
   * Блок над полями формы.
   *
   * Нужен показу на сайте: предупреждение «это демонстрация» должно стоять
   * **до** того, как человек прочитает обещание формы ответить на почту,
   * а не после него.
   */
  formNotice?: ReactNode
  /** Server-authorized order operations, placed beside the order's state. */
  detailActions?: ReactNode
  catalogAction?: ReactNode
}


export function ScreenView(props: Props) {
  if (props.screen.id === props.runtime.app.homeScreenId && props.runtime.app.catalogScreenIds) return <CatalogHub runtime={props.runtime} state={props.listState ?? EMPTY_LIST_STATE} onState={props.onListState ?? (() => {})} onOpenRow={props.onOpenRow} pageControls={props.pageControls} />
  const { screen, table, row, collection, viewer, accent, relatedTitles, runtime } = props

  const fields = table?.fields ?? []
  const order = customerWorkflows(runtime.app).find(config => config.tableId === table?.id && config.cart && config.logistics?.kind === 'sales')
  const orderPriceField = order?.cart ? runtime.tables[order.cart.itemsTableId]?.fields.find(field => field.id === order.cart!.itemPriceFieldId) : undefined
  const titleField = fields.find((field) => field.id === (table?.primaryFieldId ?? '')) ?? fields[0]

  const relatedRows: ComponentContext['relatedRows'] = (relationFieldId) => {
    const relation = fields.find((field) => field.id === relationFieldId)
    if (!relation || relation.type !== 'relation' || !row) return []
    const ids = Array.isArray(row.data[relationFieldId]) ? (row.data[relationFieldId] as string[]) : []
    const titles = relatedTitles[relation.options.tableId] ?? []
    const target = runtime.tables[relation.options.tableId]
    return ids.map((id) => ({
      id,
      title: titles.find((candidate) => candidate.id === id)?.title ?? 'Запись недоступна',
      row: target?.rows.find((candidate) => candidate.id === id) ?? null,
    }))
  }

  const ctx: ComponentContext = {
    fields,
    row,
    viewer,
    accent,
    relatedTitles,
    relatedRows,
    onAction: props.onAction,
    onOpenRow: props.onOpenRow,
    lookupText: (field, value) => {
      if (field.type !== 'lookup') return formatCell(field, value)
      const relation = fields.find(candidate => candidate.id === field.options.relationFieldId)
      const target = relation?.type === 'relation' ? runtime.tables[relation.options.tableId]?.fields.find(candidate => candidate.id === field.options.targetFieldId) : undefined
      if (!target || target.type !== 'single_select' && target.type !== 'multi_select') return formatCell(field, value)
      const values = Array.isArray(value) ? value.flat() : [value]
      return target.type === 'multi_select' ? formatCell(target, values) : values.map(item => formatCell(target, item)).filter(Boolean).join(', ')
    },
  }

  if (screen.type === 'dashboard') {
    return (
      <DashboardView
        screen={screen}
        runtime={runtime}
        editing={props.editing}
        onOpenScreen={props.onOpenScreen}
        onOpenRow={props.onOpenRow}
      />
    )
  }

  if (screen.type === 'list' || screen.type === 'tiles') {
    const customer = customerWorkflows(runtime.app).find(config => screen.id === config.listScreenId)
    if (customer && screen.id === customer.listScreenId) {
      const catalog = runtime.app.screens.find(candidate => 'source' in candidate && runtime.views[candidate.source.viewId]?.tableId === customer.catalog?.tableId)
      return <div className="space-y-4">{customer.parent ? <button type="button" onClick={() => props.onOpenScreen(customer.formScreenId)} className="rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm font-medium">Задать вопрос по заказу</button> : null}<CustomerRecords app={runtime.app} config={customer} screen={screen} rows={collection?.rows ?? []} fields={fields} relatedTitles={relatedTitles} state={props.listState ?? EMPTY_LIST_STATE}
        onState={props.onListState ?? (() => {})} accent={accent} onCatalog={catalog ? () => props.onOpenScreen(runtime.app.catalogScreenIds ? runtime.app.homeScreenId! : catalog.id) : null}
        onOpenRow={screen.onTapScreenId ? id => props.onOpenRow(screen.onTapScreenId!, id) : null} page={runtime.screens[screen.id]?.page} pageControls={props.pageControls?.[screen.id]} orderPriceField={orderPriceField} /></div>
    }
    const booking = runtime.app.booking
    if (booking && screen.id === (booking.listScreenId ?? runtime.app.homeScreenId) && table?.id === booking.tables.visits) {
      const services = runtime.app.screens.find(candidate => (candidate.type === 'list' || candidate.type === 'tiles') && runtime.views[candidate.source.viewId]?.tableId === booking.tables.services)
      const dateField = fields.find(field => field.id === booking.visit.start)
      return <BookingVisits screen={screen} rows={collection?.rows ?? []} fields={fields} relatedTitles={relatedTitles} config={booking}
        timeZone={dateField ? fieldTimeZone(dateField) : 'UTC'} now={runtime.screens[screen.id]?.page?.asOf ?? props.now ?? runtime.loadedAt ?? Date.now()}
        state={props.listState ?? EMPTY_LIST_STATE} onState={props.onListState ?? (() => {})} accent={accent}
        onChooseService={services ? () => props.onOpenScreen(runtime.app.catalogScreenIds ? runtime.app.homeScreenId! : services.id) : null}
        onOpenRow={screen.onTapScreenId ? id => props.onOpenRow(screen.onTapScreenId!, id) : null} page={runtime.screens[screen.id]?.page} pageControls={props.pageControls?.[screen.id]} />
    }
    const create = screen.sectionId ? runtime.app.screens.find(candidate => candidate.sectionId === screen.sectionId && candidate.type === 'form' && candidate.mode === 'create') : undefined
    return (
      <div className="space-y-4">{create ? <div className="flex justify-end"><button type="button" onClick={() => props.onOpenScreen(create.id)} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white ${accentClasses(accent).bg}`}><Icon name="plus" className="size-4" />Добавить запись</button></div> : null}<CollectionView
        screen={screen}
        rows={collection?.rows ?? []}
        fields={fields}
        relatedTitles={relatedTitles}
        fieldUnits={catalogFieldUnits(runtime.app, table?.id)}
        order={order}
        orderPriceField={orderPriceField}
        state={props.listState ?? EMPTY_LIST_STATE}
        onState={props.onListState ?? (() => {})}
        exportHref={props.exportHref ?? null}
        page={runtime.screens[screen.id]?.page}
        pageControls={props.pageControls?.[screen.id]}
        onOpenRow={
          screen.onTapScreenId ? (rowId) => props.onOpenRow(screen.onTapScreenId!, rowId) : null
        }
      /></div>
    )
  }

  if (!row && (screen.type === 'detail' || screen.type === 'form' && screen.mode === 'edit')) return <div className="rounded-2xl border border-sand-200 bg-white shadow-soft"><EmptyState icon="file" title="Запись недоступна" hint="Откройте другую запись из своего списка." /></div>
  if (screen.type === 'detail') {
    if (order && usesOrderDetail(screen, order)) return <OrderDetail screen={screen} config={order} runtime={runtime} ctx={ctx} actions={props.detailActions} />
    const booking = runtime.app.booking
    const bookingDate = booking ? fields.find(field => field.id === booking.visit.start) : undefined
    const outcomePending = booking && screen.tableId === booking.tables.visits && row &&
      [booking.statuses.booked, booking.statuses.arrived].includes(String(row.data[booking.visit.status])) &&
      bookingVisitSection(booking, row, bookingDate ? fieldTimeZone(bookingDate) : 'UTC', props.now ?? runtime.loadedAt ?? Date.now()) === 'history'
    if (plainRecordDetail(screen, table?.primaryFieldId ?? null)) return <RecordDetail screen={screen} runtime={runtime} ctx={ctx} primaryFieldId={table?.primaryFieldId ?? null} actions={props.detailActions} catalogAction={props.catalogAction} notice={outcomePending ? <p className="text-sm leading-relaxed text-ink-soft">Результат посещения ещё не отмечен. Статус обновит мастер или администратор после оказания услуги.</p> : undefined} />
    const inventory = runtime.app.inventory
    const primaryTargets = inventory && screen.tableId === inventory.tables.items
      ? new Set([inventory.receiptScreenId, inventory.operations?.screens.issue].filter((id): id is string => Boolean(id)))
      : new Set<string>()
    const isStockAction = (component: typeof screen.components[number]) => component.type === 'button' && component.action.type === 'open_screen' && primaryTargets.has(component.action.screenId)
    const stockLayout = screen.components.some(isStockAction)
    const extraTargets = inventory && screen.tableId === inventory.tables.items && inventory.operations
      ? new Set([inventory.operations.screens.writeOff, inventory.operations.screens.returnIn, inventory.operations.screens.returnOut,
        inventory.operations.screens.stocktake, ...runtime.app.screens.filter(s => s.type === 'form' && s.mode === 'edit' && s.tableId === inventory.tables.items).map(s => s.id)])
      : new Set<string>()
    const extras = screen.components.filter(c => c.type === 'button' && c.action.type === 'open_screen' && extraTargets.has(c.action.screenId))
    /*
     * Заголовок записи уже стоит в шапке экрана: сборщик добавляет его
     * ещё и компонентом, и карточка открывалась с названием заказа дважды
     * подряд. Показываем один раз — в шапке, где его ищут глазами.
     */
    const titleFieldId = table?.primaryFieldId ?? fields[0]?.id ?? null
    const components = [...screen.components]
      .map(component => runtime.app.production?.tables.production === screen.tableId && component.type === 'text' && component.source.kind === 'literal'
        ? { ...component, source: { ...component.source, value: productionCancellationCopy(component.source.value, Boolean(runtime.app.production.stock)) } } : component)
      .filter(
        (component) =>
          !extras.includes(component) && !(
            component.type === 'heading' &&
            component.source.kind === 'field' &&
            component.source.fieldId === titleFieldId
          ),
      )
      .sort(byPosition)
    if (components.length === 0) {
      return (
        <div className="rounded-2xl border border-sand-200 bg-white shadow-soft">
          <EmptyState icon="file" title="На карточке пока нечего показать" />
          {props.catalogAction}
        </div>
      )
    }
    /*
     * Поля, идущие подряд, собираются в один блок без внешних отступов:
     * иначе между строчками «Телефон» и «Сумма» появляется воздух, которого
     * в таблице значений быть не должно, и карточка расползается на экран.
     */
    const blocks: { fields: typeof components; other: typeof components[number] | null; actions?: typeof components }[] = []
    for (const component of components) {
      if (component.type === 'field') {
        const last = blocks[blocks.length - 1]
        if (last && last.other === null && !last.actions) last.fields.push(component)
        else blocks.push({ fields: [component], other: null })
      } else if (isStockAction(component)) {
        const last = blocks[blocks.length - 1]
        if (last?.actions) last.actions.push(component)
        else blocks.push({ fields: [], other: null, actions: [component] })
      } else {
        blocks.push({ fields: [], other: component })
      }
    }

    const content = blocks.map((block, index) =>
          block.actions ? <div key={`actions-${index}`} className="grid gap-4 empty:hidden @min-[860px]:flex @min-[860px]:flex-wrap @min-[860px]:justify-end @min-[860px]:gap-3">
            {block.actions.map(component => <ComponentView key={component.id} component={component} ctx={ctx}
              desktopButton={component.type === 'button' && component.action.type === 'open_screen' && component.action.screenId === inventory?.operations?.screens.issue ? 'secondary' : 'compact'} />)}
          </div> :
          block.other ? (
            stockLayout ? <div key={block.other.id} className="empty:hidden @min-[860px]:col-span-2"><ComponentView component={block.other} ctx={ctx} /></div>
              : <ComponentView key={block.other.id} component={block.other} ctx={ctx} />
          ) : (
            <div key={`fields-${index}`}>
              {block.fields.map((component) => (
                <ComponentView key={component.id} component={component} ctx={ctx}
                  desktopEmphasis={stockLayout && component.type === 'field' && component.fieldId === inventory?.item.stock} />
              ))}
            </div>
          ),
        )
    return (
      <div className="space-y-4 rounded-2xl border border-sand-200 bg-white p-5 shadow-soft sm:p-6">
        {props.detailActions}
        {props.catalogAction}
        {outcomePending && <p className="text-xs leading-relaxed text-ink-muted">Результат посещения ещё не отмечен. Статус обновит мастер или администратор после оказания услуги.</p>}
        {stockLayout ? <div className="space-y-4 @min-[860px]:grid @min-[860px]:grid-cols-[minmax(0,1fr)_auto] @min-[860px]:items-center @min-[860px]:gap-x-8 @min-[860px]:gap-y-4 @min-[860px]:space-y-0">{content}</div> : content}
        {extras.length > 0 && <details className="border-t border-sand-200 pt-3">
          <summary className="cursor-pointer py-1 text-sm font-medium text-ink-soft">Ещё действия</summary>
          <div className="mt-3 grid gap-3 @min-[860px]:flex @min-[860px]:flex-wrap">{extras.map(component => <ComponentView key={component.id} component={component} ctx={ctx} desktopButton="compact" />)}</div>
        </details>}
      </div>
    )
  }

  return <FormScreen key={`${runtime.app.id}:${screen.id}:${screen.mode}:${row?.id ?? 'new'}`} {...props} fields={fields} />
}

function FormScreen({
  screen,
  row,
  fields,
  relatedTitles,
  accent,
  runtime,
  onSubmit,
  onValues,
  formSlot,
  formNotice,
  initialValues,
  draft,
  onDraftChange,
  pending,
}: Props & { fields: Field[] }) {
  const mode = screen.type === 'form' ? screen.mode : 'create'
  const [values, setValues] = useState<Record<string, unknown>>(draft ? { ...draft.values } : mode === 'edit' && row ? { ...row.data } : { ...initialValues })
  const currentValues = useRef(values)
  currentValues.current = values
  const uploadingFields = useRef(new Set<string>())
  const [uploading, setUploading] = useState(false)
  const [dirty, setDirty] = useState(Boolean(draft))
  const sourceKey = `${screen.id}:${mode}:${row?.id ?? 'new'}`
  const source = useRef(sourceKey)
  const edited = useRef(Boolean(draft))
  const baseVersion = useRef(draft?.baseVersion ?? row?.version)
  useUnsaved(`runtime-form:${sourceKey}`, dirty)

  // При открытии формы редактирования поля заполняются текущими значениями строки.
  useEffect(() => {
    if (source.current === sourceKey && edited.current) return
    source.current = sourceKey
    edited.current = Boolean(draft)
    setDirty(Boolean(draft))
    baseVersion.current = draft?.baseVersion ?? row?.version
    const next = draft ? { ...draft.values } : mode === 'edit' && row ? { ...row.data } : { ...initialValues }
    currentValues.current = next
    setValues(current => sameCellValue(current, next) ? current : next)
  }, [sourceKey, mode, row, initialValues, draft])

  /*
   * О введённом сообщаем наружу через ссылку на обработчик, а не зависимостью
   * эффекта: обработчик, пересобранный родителем, иначе запускал бы отправку
   * на каждый его рендер.
   */
  const report = useRef(onValues)
  useEffect(() => {
    report.current = onValues
  })
  useEffect(() => {
    report.current?.(values)
  }, [values])

  if (screen.type !== 'form') return null

  const accentStyle = accentClasses(accent)
  const components = [...screen.components].sort(byPosition)
  const presentation = customerFormPresentation(runtime.app, screen, fields)
  const checkout = customerWorkflows(runtime.app).some(config => config.cart && config.formScreenId === screen.id)
  const defaultCheckoutIntro = 'Проверьте состав и контакты. Мы свяжемся с вами для подтверждения и согласуем получение. Оплаты онлайн нет. После оформления сотрудник бизнеса свяжется с вами и согласует оплату.'

  return (
    <form
      className="@container space-y-5 rounded-2xl border border-sand-200 bg-white p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault()
        if (pending || uploadingFields.current.size > 0) return
        onSubmit(currentValues.current, mode, baseVersion.current)
      }}
    >
      {formNotice}
      {checkout ? <><fieldset disabled={pending} className="min-w-0">{formSlot}</fieldset><h2 className="border-t border-sand-200 pt-5 text-base font-semibold">Ваши контакты</h2></> : null}
      <fieldset disabled={pending} className="grid min-w-0 gap-5 @min-[640px]:grid-cols-2">
      {components.map((component) => {
        if (component.type !== 'form_field') {
          if (checkout && component.type === 'text' && component.source.kind === 'literal' && component.source.value === defaultCheckoutIntro) return null
          return <div key={component.id} className="min-w-0 @min-[640px]:col-span-2"><ComponentViewInForm component={component} fields={fields} row={row} accent={accent} /></div>
        }
        const field = fields.find((candidate) => candidate.id === component.fieldId)
        if (presentation.hidden.has(component.fieldId)) return null
        // Вычисляемые поля в форме не редактируются — их значения выводятся.
        if (!field || isComputed(field.type)) return null

        const options =
          field.type === 'relation' ? (relatedTitles[field.options.tableId] ?? []) : []

        return (
          <label key={component.id} className={`block min-w-0 space-y-1.5 ${['long_text','attachment','image','relation','multi_select'].includes(field.type) ? '@min-[640px]:col-span-2' : ''}`}>
            <span className="block text-[13px] font-medium text-ink-soft">
              {component.label && component.label !== field.name ? component.label : presentation.labels.get(field.id) ?? field.name}
              {component.required ? <span className="text-red-600"> *</span> : null}
            </span>
            <FormFieldInput
              field={field}
              value={values[field.id] ?? null}
              required={component.required}
              placeholder={component.placeholder}
              relatedOptions={options}
              appId={runtime.app.id}
              disabled={pending}
              onBusyChange={(busy) => {
                if (busy) uploadingFields.current.add(component.id)
                else uploadingFields.current.delete(component.id)
                setUploading(uploadingFields.current.size > 0)
              }}
              onChange={(value) => {
                edited.current = true
                setDirty(true)
                const next = { ...currentValues.current, [field.id]: value }
                currentValues.current = next
                setValues(next)
                onDraftChange?.({ values: next, baseVersion: baseVersion.current })
              }}
            />
            {presentation.hints.has(field.id) ? <span className="block text-xs leading-relaxed text-ink-muted">{presentation.hints.get(field.id)}</span> : null}
          </label>
        )
      })}
      </fieldset>
      {!checkout ? formSlot : null}

      {uploading ? <p role="status" className="text-xs text-ink-muted">Загружаем файлы. Дождитесь завершения перед сохранением.</p> : null}

      <button
        type="submit"
        disabled={pending || uploading}
        className={`min-h-11 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${accentStyle.bg}`}
      >
        {pending ? 'Сохраняем…' : screen.submitLabel}
      </button>
    </form>
  )
}

/** Не-полевые компоненты формы отрисовываются без обработчиков действий. */
function ComponentViewInForm({
  component,
  fields,
  row,
  accent,
}: {
  component: Parameters<typeof ComponentView>[0]['component']
  fields: Field[]
  row: TableRow | null
  accent: string
}) {
  return (
    <ComponentView
      component={component}
      ctx={{
        fields,
        row,
        viewer: null,
        accent,
        relatedTitles: {},
        relatedRows: () => [],
        onAction: () => {},
      }}
    />
  )
}
