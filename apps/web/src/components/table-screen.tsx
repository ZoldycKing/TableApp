'use client'

import type { Field, View, ViewType } from '@tableapp/schema'
import { defaultViewConfig, newId, positionBetween } from '@tableapp/schema'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  addRowAction,
  deleteRowAction,
  renameFieldAction,
  setCellAction,
  type ActionResult,
} from '@/app/actions'
import { createAppAction } from '@/app/app-actions'
import {
  createViewAction,
  deleteViewAction,
  renameViewAction,
  updateViewConfigAction,
} from '@/app/view-actions'
import { applyView, visibleFields } from '@/lib/apply-view'

import { HistoryPanel } from '@/components/history-panel'
import { RowCard } from '@/components/grid/row-card'
import { TemplateNotice } from '@/components/template-notice'
import { VIEW_TYPE_LABELS } from '@/lib/field-labels'
import type { LoadedTable } from '@/lib/queries'
import { useTable } from '@/lib/table-store'
import { useLiveTable } from '@/lib/use-live-table'
import { FieldEditor } from './fields/field-editor'
import { TableSwitcher } from './table-switcher'
import { DataGrid } from './grid/data-grid'
import { CalendarView } from './views/calendar-view'
import { GalleryView } from './views/gallery-view'
import { KanbanView } from './views/kanban-view'
import { ViewBar } from './views/view-bar'

const SAVE_DELAY_MS = 600

export function TableScreen({ table, member }: { table: LoadedTable; member: { role: string } }) {
  const readOnly = member.role === 'viewer'

  const store = useTable({
    id: table.id,
    name: table.name,
    fields: table.fields,
    rows: table.rows.map((row) => ({ id: row.id, position: row.position, data: row.data })),
  })

  const [views, setViews] = useState<View[]>(table.views)
  const [activeViewId, setActiveViewId] = useState(table.views[0]?.id ?? '')
  const [search, setSearch] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [keepVisible, setKeepVisible] = useState<string[]>([])
  const [openRowId, setOpenRowId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<Field | null | 'new'>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const activeView = views.find((view) => view.id === activeViewId) ?? views[0]

  /*
   * Таблицу редактируют вдвоём: правка соседа приезжает сюда сама.
   * Пока человек печатает в ячейке, обновление ждёт — см. `use-live-table`.
   */
  useLiveTable(table.id)

  // Сервер перечитал таблицу — локальное состояние заменяется целиком.
  const { reset } = store
  useEffect(() => {
    reset({
      id: table.id,
      name: table.name,
      fields: table.fields,
      rows: table.rows.map((row) => ({ id: row.id, position: row.position, data: row.data })),
    })
    setViews(table.views)
  }, [table, reset])

  const run = useCallback((action: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const result = await action()
      setError(result.ok ? null : result.error)
    })
  }, [])

  /**
   * Настройки представления сохраняются с задержкой: перетаскивание ползунка
   * фильтра не должно порождать запрос на каждое нажатие клавиши.
   */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  const changeConfig = (config: View['config']) => {
    if (!activeView) return
    setViews((current) =>
      current.map((view) => (view.id === activeView.id ? ({ ...view, config } as View) : view)),
    )
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      run(() => updateViewConfigAction(table.id, activeView.id, activeView.type, config))
    }, SAVE_DELAY_MS)
  }

  const renameView = (name: string) => {
    if (!activeView) return
    setViews((current) =>
      current.map((view) => (view.id === activeView.id ? { ...view, name } : view)),
    )
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      run(() => renameViewAction(table.id, activeView.id, name))
    }, SAVE_DELAY_MS)
  }

  const createView = (type: ViewType) => {
    startTransition(async () => {
      const result = await createViewAction(table.id, type)
      if (!result.ok) return setError(result.error)
      // Сервер вернул id — собираем представление локально с теми же настройками
      // по умолчанию, что записаны в базу, и переключаемся на него без перезагрузки.
      const created = {
        id: result.viewId,
        tableId: table.id,
        name: VIEW_TYPE_LABELS[type] ?? type,
        type,
        config: defaultViewConfig(type, newId('filter')),
        position: positionBetween(views[views.length - 1]?.position ?? null, null),
      } as View
      setViews((current) => [...current, created])
      setActiveViewId(created.id)
    })
  }

  const removeView = () => {
    if (!activeView) return
    startTransition(async () => {
      const result = await deleteViewAction(table.id, activeView.id)
      if (!result.ok) return setError(result.error)
      const remaining = views.filter((view) => view.id !== activeView.id)
      setViews(remaining)
      setActiveViewId(remaining[0]?.id ?? '')
    })
  }

  /**
   * Правка ячейки.
   *
   * Вместе со значением уходит основание — то, что человек видел перед
   * правкой. Если в базе уже другое, сервер откажет: чужую работу
   * не перезаписываем молча. Тогда возвращаем экран к серверному состоянию,
   * чтобы человек увидел свежее значение, а не своё отклонённое.
   */
  const setCell = (rowId: string, fieldId: string, value: unknown, base?: unknown) => {
    store.setCell(rowId, fieldId, value)
    startTransition(async () => {
      const result = await setCellAction(table.id, rowId, fieldId, value, base)
      if (result.ok) {
        setError(null)
        return
      }
      setError(result.error)
      router.refresh()
    })
  }

  /*
   * Новая строка почти никогда не подходит под фильтр представления: она
   * пустая. Раньше она создавалась и тут же исчезала — счётчик рос, а вписать
   * в неё было нечего. Теперь строка, созданная в этом сеансе, остаётся видимой,
   * пока человек не перезагрузит страницу.
   */
  const addRow = (afterRowId?: string) => {
    const rowId = newId('row')
    setKeepVisible((current) => [...current, rowId])
    store.addRow(afterRowId, rowId)
    run(() => addRowAction(table.id, afterRowId, rowId))
  }

  const deleteRow = (rowId: string) => {
    store.deleteRow(rowId)
    run(() => deleteRowAction(table.id, rowId))
  }

  const renameField = (fieldId: string, name: string) => {
    store.renameField(fieldId, name)
    run(() => renameFieldAction(table.id, fieldId, name))
  }

  const titleField =
    store.fieldIndex.get(table.primaryFieldId ?? '') ?? store.table.fields[0]

  const shownFields = useMemo(
    () => (activeView ? visibleFields(store.table.fields, activeView.config) : store.table.fields),
    [store.table.fields, activeView],
  )

  const applied = useMemo(
    () =>
      activeView
        ? applyView(store.table.rows, store.table.fields, activeView.config, search)
        : { rows: store.table.rows, groups: [{ key: '', value: null, rows: store.table.rows }], isGrouped: false, hiddenCount: 0 },
    [store.table.rows, store.table.fields, activeView, search],
  )

  /*
   * Выгружаем ровно то, что человек видит: представление задаёт отбор,
   * сортировку и набор колонок, строка поиска едет отдельно — её он набрал
   * и никуда не сохранял.
   *
   * Собирает файл сервер, хотя строки уже здесь. Книгу Excel иначе не сделать:
   * библиотека тянет узловые модули и в браузерной сборке оборачивается
   * полифилами ради одной кнопки. А собирать один формат тут, другой там —
   * верный способ получить два файла с разным содержимым.
   */
  const exportHref = (format: 'csv' | 'xlsx') => {
    const params = new URLSearchParams({ format })
    if (activeView) params.set('view', activeView.id)
    if (search.trim()) params.set('q', search)
    return `/t/${store.table.id}/export?${params.toString()}`
  }

  /*
   * Прикреплённые строки возвращаются в список, даже если фильтр их прячет.
   * При группировке этого не делаем: строке некуда встать — её значение
   * не относится ни к одной группе, и она выглядела бы потерянной.
   */
  const shown = useMemo(() => {
    if (applied.isGrouped || keepVisible.length === 0) return applied

    const inView = new Set(applied.rows.map((row) => row.id))
    const extra = store.table.rows.filter((row) => keepVisible.includes(row.id) && !inView.has(row.id))
    if (extra.length === 0) return applied

    const rows = [...applied.rows, ...extra].sort((a, b) => (a.position < b.position ? -1 : 1))
    return { ...applied, rows, groups: [{ key: '', value: null, rows }] }
  }, [applied, keepVisible, store.table.rows])

  const hiddenByFilter = shown.rows.length - applied.rows.length

  const groupField = activeView?.config.groupBy[0]
    ? store.fieldIndex.get(activeView.config.groupBy[0].fieldId)
    : undefined

  if (!activeView) {
    return (
      <main className="mx-auto w-full max-w-[1500px] px-5 py-6 sm:px-6">
        <p className="text-sm text-[var(--color-ink-muted)]">У таблицы нет ни одного представления.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[1400px] px-6 py-8">
      <TableSwitcher
        tables={table.workspaceTables}
        activeTableId={table.id}
        onError={setError}
      />

      {table.templateId && table.sampleCount > 0 ? (
        <TemplateNotice tableId={table.id} sampleCount={table.sampleCount} />
      ) : null}

      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{store.table.name}</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {shown.rows.length} из {store.table.rows.length} строк
            {pending ? ' · сохранение…' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await createAppAction(table.id)
                // Ведём в редактор созданного приложения, а не в список настроек:
                // человек должен сначала увидеть, что получилось, и только потом
                // решать про адрес и доступ.
                if (result.ok) router.push(`/apps/${result.appId}`)
                else setError(result.error)
              })
            }
            className="rounded-xl bg-ink px-3.5 py-2 text-sm font-medium text-sand-50 transition-all hover:-translate-y-px hover:bg-ink/90 disabled:translate-y-0 disabled:opacity-40"
          >
            Создать приложение
          </button>
          <a
            href="/apps"
            className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)]"
          >
            Приложения
          </a>
          <a
            href="/import"
            className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)]"
          >
            Импорт
          </a>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)]"
          >
            История
          </button>
          <span className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-subtle)] px-2 py-1">
            <span className="text-xs text-[var(--color-ink-muted)]">Выгрузить</span>
            <a
              href={exportHref('xlsx')}
              download
              title="Книга Excel: с шапкой, шириной колонок и фильтром"
              className="rounded px-1.5 py-1 text-sm font-medium hover:bg-[var(--color-surface-muted)]"
            >
              Excel
            </a>
            <a
              href={exportHref('csv')}
              download
              title="Файл CSV: открывается где угодно"
              className="rounded px-1.5 py-1 text-sm font-medium hover:bg-[var(--color-surface-muted)]"
            >
              CSV
            </a>
          </span>
        </div>
      </header>

      <ViewBar
        views={views}
        activeView={activeView}
        fields={store.table.fields}
        search={search}
        hiddenCount={applied.hiddenCount}
        onSelectView={setActiveViewId}
        onCreateView={createView}
        onRenameView={renameView}
        onDeleteView={removeView}
        onConfigChange={changeConfig}
        onSearch={setSearch}
      />

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {hiddenByFilter > 0 ? (
        <p className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>
            Новых строк, не подходящих под фильтр представления: {hiddenByFilter}. Они видны, пока
            вы на этой странице — заполните поля, по которым идёт фильтр, и строки останутся.
          </span>
          <button
            type="button"
            onClick={() => setKeepVisible([])}
            className="rounded border border-amber-300 px-2 py-1 text-xs hover:bg-amber-100"
          >
            Скрыть их
          </button>
        </p>
      ) : null}

      {activeView.type === 'grid' ? (
        <DataGrid
          fields={shownFields}
          groups={shown.groups}
          isGrouped={shown.isGrouped}
          onOpenRow={setOpenRowId}
          groupField={groupField}
          relatedTitles={table.relatedTitles}
          onEditField={readOnly ? undefined : (field) => setEditingField(field)}
          onAddField={readOnly ? undefined : () => setEditingField('new')}
          onSetCell={setCell}
          onAddRow={addRow}
          onDeleteRow={deleteRow}
          onRenameField={renameField}
        />
      ) : null}

      {activeView.type === 'kanban' ? (
        <KanbanView
          view={activeView}
          fields={store.table.fields}
          shownFields={shownFields}
          rows={shown.rows}
          titleField={titleField}
          onConfigChange={changeConfig}
          onSetCell={setCell}
          onAddRow={() => addRow()}
        />
      ) : null}

      {activeView.type === 'calendar' ? (
        <CalendarView
          view={activeView}
          fields={store.table.fields}
          rows={shown.rows}
          titleField={titleField}
          onConfigChange={changeConfig}
        />
      ) : null}

      {activeView.type === 'gallery' ? (
        <GalleryView
          view={activeView}
          fields={store.table.fields}
          shownFields={shownFields}
          rows={shown.rows}
          titleField={titleField}
          onConfigChange={changeConfig}
          onAddRow={() => addRow()}
        />
      ) : null}

      {editingField ? (
        <FieldEditor
          tableId={table.id}
          field={editingField === 'new' ? null : editingField}
          fields={store.table.fields}
          workspaceTables={table.workspaceTables}
          onClose={() => setEditingField(null)}
          onSaved={() => {
            setEditingField(null)
            // Состав полей меняет и производные значения строк, поэтому
            // проще перечитать таблицу целиком, чем чинить локальное состояние.
            router.refresh()
          }}
        />
      ) : null}

      {openRowId ? (() => {
        const index = shown.rows.findIndex((row) => row.id === openRowId)
        const row = shown.rows[index]
        if (!row) return null
        return (
          <RowCard
            row={row}
            fields={store.table.fields}
            relatedTitles={table.relatedTitles}
            relatedTables={Object.fromEntries(
              table.workspaceTables.map((item) => [item.id, { name: item.name, fields: item.fields }]),
            )}
            readOnly={readOnly}
            position={index + 1}
            total={shown.rows.length}
            onSetCell={setCell}
            onPrev={index > 0 ? () => setOpenRowId(shown.rows[index - 1]!.id) : undefined}
            onNext={
              index < shown.rows.length - 1 ? () => setOpenRowId(shown.rows[index + 1]!.id) : undefined
            }
            onClose={() => setOpenRowId(null)}
          />
        )
      })() : null}

      {historyOpen ? (
        <HistoryPanel
          tableId={table.id}
          fields={store.table.fields}
          titles={table.relatedTitles}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
    </main>
  )
}
