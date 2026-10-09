'use client'

import type { Action, Field, Screen } from '@tableapp/schema'
import { byPosition, isComputed } from '@tableapp/schema'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatCell } from '@/lib/format'
import type { RuntimeApp, RuntimeTable } from '@/lib/app-runtime'
import type { RelatedTitles } from '@/lib/queries'
import type { TableRow } from '@/lib/table-store'
import { CollectionView } from './collection-view'
import { EMPTY_LIST_STATE, type ListState } from './app-shell'
import { ComponentView, type ComponentContext } from './component-view'
import { DashboardView } from './dashboard-view'
import { accentClasses, type Viewer } from './bindings'
import { Icon } from './icons'
import { EmptyState } from './ui'
import { FormFieldInput } from './form-field'
import { useUnsaved } from '@/lib/unsaved'

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
  /** Editable create-form values supplied by an action on another card. */
  initialValues?: Record<string, unknown>
  /** Отбор списка: хранится в оболочке, чтобы пережить открытие карточки. */
  listState?: ListState
  onListState?: (next: ListState) => void
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
}


export function ScreenView(props: Props) {
  const { screen, table, row, collection, viewer, accent, relatedTitles, runtime } = props

  const fields = table?.fields ?? []
  const titleField = fields.find((field) => field.id === (table?.primaryFieldId ?? '')) ?? fields[0]

  const relatedRows: ComponentContext['relatedRows'] = (relationFieldId) => {
    const relation = fields.find((field) => field.id === relationFieldId)
    if (!relation || relation.type !== 'relation' || !row) return []
    const ids = Array.isArray(row.data[relationFieldId]) ? (row.data[relationFieldId] as string[]) : []
    const titles = relatedTitles[relation.options.tableId] ?? []
    const target = runtime.tables[relation.options.tableId]
    return ids.map((id) => ({
      id,
      title: titles.find((candidate) => candidate.id === id)?.title ?? 'Строка удалена',
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
    return (
      <CollectionView
        screen={screen}
        rows={collection?.rows ?? []}
        fields={fields}
        relatedTitles={relatedTitles}
        state={props.listState ?? EMPTY_LIST_STATE}
        onState={props.onListState ?? (() => {})}
        exportHref={props.exportHref ?? null}
        onOpenRow={
          screen.onTapScreenId ? (rowId) => props.onOpenRow(screen.onTapScreenId!, rowId) : null
        }
      />
    )
  }

  if (screen.type === 'detail') {
    const inventory = runtime.app.inventory
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
        </div>
      )
    }
    /*
     * Поля, идущие подряд, собираются в один блок без внешних отступов:
     * иначе между строчками «Телефон» и «Сумма» появляется воздух, которого
     * в таблице значений быть не должно, и карточка расползается на экран.
     */
    const blocks: { fields: typeof components; other: typeof components[number] | null }[] = []
    for (const component of components) {
      if (component.type === 'field') {
        const last = blocks[blocks.length - 1]
        if (last && last.other === null) last.fields.push(component)
        else blocks.push({ fields: [component], other: null })
      } else {
        blocks.push({ fields: [], other: component })
      }
    }

    return (
      <div className="space-y-4 rounded-2xl border border-sand-200 bg-white p-5 shadow-soft sm:p-6">
        {blocks.map((block, index) =>
          block.other ? (
            <ComponentView key={block.other.id} component={block.other} ctx={ctx} />
          ) : (
            <div key={`fields-${index}`}>
              {block.fields.map((component) => (
                <ComponentView key={component.id} component={component} ctx={ctx} />
              ))}
            </div>
          ),
        )}
        {extras.length > 0 && <details className="border-t border-sand-200 pt-3">
          <summary className="cursor-pointer py-1 text-sm font-medium text-ink-soft">Ещё действия</summary>
          <div className="mt-3 space-y-3">{extras.map(component => <ComponentView key={component.id} component={component} ctx={ctx} />)}</div>
        </details>}
      </div>
    )
  }

  return <FormScreen {...props} fields={fields} />
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
}: Props & { fields: Field[] }) {
  const mode = screen.type === 'form' ? screen.mode : 'create'
  const [values, setValues] = useState<Record<string, unknown>>(mode === 'edit' && row ? { ...row.data } : { ...initialValues })
  const [dirty, setDirty] = useState(false)
  const sourceKey = `${screen.id}:${mode}:${row?.id ?? 'new'}`
  const source = useRef(sourceKey)
  const edited = useRef(false)
  const baseVersion = useRef(row?.version)
  useUnsaved(`runtime-form:${sourceKey}`, dirty)

  // При открытии формы редактирования поля заполняются текущими значениями строки.
  useEffect(() => {
    if (source.current === sourceKey && edited.current) return
    source.current = sourceKey
    edited.current = false
    setDirty(false)
    baseVersion.current = row?.version
    setValues(mode === 'edit' && row ? { ...row.data } : { ...initialValues })
  }, [sourceKey, mode, row, initialValues])

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

  return (
    <form
      className="space-y-5 rounded-2xl border border-sand-200 bg-white p-5 shadow-soft sm:p-6"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(values, mode, baseVersion.current)
      }}
    >
      {formNotice}

      {components.map((component) => {
        if (component.type !== 'form_field') {
          return <ComponentViewInForm key={component.id} component={component} fields={fields} row={row} accent={accent} />
        }
        const field = fields.find((candidate) => candidate.id === component.fieldId)
        // Вычисляемые поля в форме не редактируются — их значения выводятся.
        if (!field || isComputed(field.type)) return null

        const options =
          field.type === 'relation' ? (relatedTitles[field.options.tableId] ?? []) : []

        return (
          <label key={component.id} className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-ink-soft">
              {component.label ?? field.name}
              {component.required ? <span className="text-red-600"> *</span> : null}
            </span>
            <FormFieldInput
              field={field}
              value={values[field.id] ?? null}
              required={component.required}
              placeholder={component.placeholder}
              relatedOptions={options}
              appId={runtime.app.id}
              onChange={(value) => {
                edited.current = true
                setDirty(true)
                setValues((current) => ({ ...current, [field.id]: value }))
              }}
            />
          </label>
        )
      })}

      {formSlot}

      <button
        type="submit"
        className={`w-full rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-soft transition-all hover:-translate-y-px hover:shadow-lift ${accentStyle.bg}`}
      >
        {screen.submitLabel}
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
