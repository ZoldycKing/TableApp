'use client'

import type { Field, View, ViewType } from '@tableapp/schema'
import { defaultViewConfig, newId, positionBetween } from '@tableapp/schema'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { OrderDeliveryPanel } from '@/components/runtime/order-delivery-panel'
import { InventoryBalancePanel, OrderStockPanel } from '@/components/runtime/order-stock-panel'
import { CustomerHistoryPanel } from '@/components/runtime/customer-history-panel'
import { TemplateNotice } from '@/components/template-notice'
import { VIEW_TYPE_LABELS } from '@/lib/field-labels'
import type { LoadedTable } from '@/lib/queries'
import { useTable } from '@/lib/table-store'
import { useLiveTable } from '@/lib/use-live-table'
import { cellText } from '@/lib/table-export'
import { CELL_CONFLICT } from '@/lib/cell-conflict'
import { FieldEditor } from './fields/field-editor'
import { TableSwitcher } from './table-switcher'
import { DataGrid } from './grid/data-grid'
import { CalendarView } from './views/calendar-view'
import { GalleryView } from './views/gallery-view'
import { KanbanView } from './views/kanban-view'
import { ViewBar } from './views/view-bar'
import { TableRecordsEditor } from './table-records-editor'

const SAVE_DELAY_MS = 600

export function TableScreen({ table, member, initialRowId = null, initialMode = 'grid', viewOnly = false, customerHistoryAvailable = false }: { table: LoadedTable; member: { role: string }; initialRowId?: string | null; initialMode?: 'grid' | 'records'; viewOnly?: boolean; customerHistoryAvailable?: boolean }) {
  const readOnly = member.role === 'viewer' || viewOnly

  const store = useTable({
    id: table.id,
    name: table.name,
    fields: table.fields,
    rows: table.rows.map((row) => ({ id: row.id, position: row.position, data: row.data, version: row.version })),
  })

  const [views, setViews] = useState<View[]>(table.views)
  const [activeViewId, setActiveViewId] = useState(table.views[0]?.id ?? '')
  const [search, setSearch] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [keepVisible, setKeepVisible] = useState<string[]>([])
  const [openRowId, setOpenRowId] = useState<string | null>(() => table.rows.some(row => row.id === initialRowId) ? initialRowId : null)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(initialRowId)
  const [mode, setMode] = useState(initialMode)
  const [recordDirty, setRecordDirty] = useState(false)
  const recordDirtyRef = useRef(false)
  recordDirtyRef.current = recordDirty
  const recordLeaveGuard = useRef<(() => Promise<boolean>) | null>(null)
  const registerRecordGuard = useCallback((guard: (() => Promise<boolean>) | null) => { recordLeaveGuard.current = guard }, [])
  const [addingRecord, setAddingRecord] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<Field | null | 'new'>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const query = useSearchParams().toString()
  const setupReturn = new URLSearchParams(query).get('setup')
  const returnToSetup = setupReturn?.startsWith('/setup?') ? setupReturn : null
  const [newGridRowId, setNewGridRowId] = useState<string | null>(null)

  useEffect(() => {
    if (!recordDirty) return
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const leave = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]')
      if (!link || link.hasAttribute('download') || link.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      event.preventDefault(); event.stopPropagation()
      void canLeaveRecord().then(allowed => { if (allowed) window.location.assign(link.href) })
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', leave, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', leave, true) }
  }, [recordDirty])

  const canLeaveRecord = async () => {
    if (!recordDirtyRef.current) return true
    if (recordLeaveGuard.current && await recordLeaveGuard.current()) return true
    return window.confirm('Есть несохранённые изменения. Отменить их и продолжить?')
  }
  const writeEditorQuery = (nextMode: 'grid' | 'records', id: string | null) => {
    const params = new URLSearchParams(window.location.search)
    params.set('mode', nextMode)
    if (id) params.set('r', id)
    else params.delete('r')
    window.history.replaceState(null, '', `/t/${encodeURIComponent(table.id)}?${params}`)
  }
  const selectRecord = async (id: string | null) => {
    if (id === selectedRowId || await canLeaveRecord()) { setSelectedRowId(id); writeEditorQuery(mode, id) }
  }
  const changeMode = async (next: 'grid' | 'records') => {
    if (next === mode || !await canLeaveRecord()) return
    setMode(next)
    setOpenRowId(null)
    writeEditorQuery(next, selectedRowId)
  }

  // Search-only navigation and browser history can reuse this Client Component.
  // Read the URL too, rather than treating initial props as permanent state.
  useEffect(() => {
    const params = new URLSearchParams(query)
    const nextMode = params.get('mode') === 'records' ? 'records' : 'grid'
    const requested = params.get('r')
    const nextRow = requested && (requested === selectedRowId || store.table.rows.some(row => row.id === requested)) ? requested : null
    if (nextMode === mode && nextRow === selectedRowId) return
    let live = true
    void canLeaveRecord().then(allowed => {
      if (!live) return
      if (!allowed) { writeEditorQuery(mode, selectedRowId); return }
      setMode(nextMode); setSelectedRowId(nextRow); setOpenRowId(nextMode === 'grid' ? nextRow : null)
    })
    return () => { live = false }
    // Local changes write the URL in the same event; only a changed URL should replay navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

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
      rows: table.rows.map((row) => ({ id: row.id, position: row.position, data: row.data, version: row.version })),
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
    if (readOnly) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      run(() => updateViewConfigAction(table.id, activeView.id, activeView.type, config))
    }, SAVE_DELAY_MS)
  }

  const renameView = (name: string) => {
    if (readOnly || !activeView) return
    setViews((current) =>
      current.map((view) => (view.id === activeView.id ? { ...view, name } : view)),
    )
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      run(() => renameViewAction(table.id, activeView.id, name))
    }, SAVE_DELAY_MS)
  }

  const createView = (type: ViewType) => {
    if (readOnly) return
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
    if (readOnly || !activeView) return
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
    if (readOnly) return
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

  const saveRecordCell = async (rowId: string, fieldId: string, value: unknown, base: unknown): Promise<ActionResult> => {
    if (readOnly) return { ok: false, error: 'Таблица открыта только для просмотра.' }
    const result = await setCellAction(table.id, rowId, fieldId, value, base)
    if (result.ok) { store.setCell(rowId, fieldId, value); setError(null) }
    else {
      const error = result.error === CELL_CONFLICT ? 'Это поле изменил другой сотрудник. Ваш ввод остался в форме. Верните сохранённое значение, чтобы увидеть его правку и продолжить.' : result.error
      setError(error); router.refresh()
      return { ok: false, error }
    }
    return result
  }

  /*
   * Новая строка почти никогда не подходит под фильтр представления: она
   * пустая. Раньше она создавалась и тут же исчезала — счётчик рос, а вписать
   * в неё было нечего. Теперь строка, созданная в этом сеансе, остаётся видимой,
   * пока человек не перезагрузит страницу.
   */
  const addRow = (afterRowId?: string) => {
    if (readOnly) return
    const rowId = newId('row')
    setNewGridRowId(rowId)
    setKeepVisible((current) => [...current, rowId])
    store.addRow(afterRowId, rowId)
    run(() => addRowAction(table.id, afterRowId, rowId))
  }

  const addRecord = async () => {
    if (readOnly || addingRecord || !await canLeaveRecord()) return
    const rowId = newId('row')
    const previous = selectedRowId
    setAddingRecord(true)
    store.addRow(undefined, rowId)
    setKeepVisible(current => [...current, rowId])
    setSelectedRowId(rowId)
    writeEditorQuery(mode, rowId)
    try {
      const result = await addRowAction(table.id, undefined, rowId)
      if (!result.ok) { store.deleteRow(rowId); setSelectedRowId(previous); writeEditorQuery(mode, previous); setError(result.error); return }
      setError(null)
    } catch { store.deleteRow(rowId); setSelectedRowId(previous); writeEditorQuery(mode, previous); setError('Не удалось добавить запись. Попробуйте ещё раз.') }
    finally { setAddingRecord(false) }
  }

  const deleteRow = (rowId: string) => {
    if (readOnly) return
    const version = store.table.rows.find((row) => row.id === rowId)?.version
    store.deleteRow(rowId)
    run(() => deleteRowAction(table.id, rowId, version))
  }

  const renameField = (fieldId: string, name: string) => {
    if (readOnly) return
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

  const recordRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU')
    if (!query) return store.table.rows
    return store.table.rows.filter(row => store.table.fields.some(field =>
      cellText(field, row.data[field.id], table.relatedTitles).toLocaleLowerCase('ru-RU').includes(query),
    ))
  }, [search, store.table.rows, store.table.fields, table.relatedTitles])

  const groupField = activeView?.config.groupBy[0]
    ? store.fieldIndex.get(activeView.config.groupBy[0].fieldId)
    : undefined

  const rowActions = (row: (typeof store.table.rows)[number]) => readOnly ? undefined : <><OrderStockPanel key={`stock:${table.id}:${row.id}`} tableId={table.id} rowId={row.id} version={row.version ?? 0} business /><InventoryBalancePanel key={`balance:${table.id}:${row.id}`} tableId={table.id} rowId={row.id} version={row.version ?? 0} business /><OrderDeliveryPanel key={`${table.id}:${row.id}`} tableId={table.id} rowId={row.id} version={row.version ?? 0} business />{customerHistoryAvailable ? <CustomerHistoryPanel key={`history:${table.id}:${row.id}`} tableId={table.id} rowId={row.id} business /> : null}</>

  if (!activeView) {
    return (
      <main className="mx-auto w-full max-w-[1500px] px-5 py-6 sm:px-6">
        <p className="text-sm text-[var(--color-ink-muted)]">У таблицы нет ни одного представления.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      {returnToSetup ? <Link href={returnToSetup} className="mb-5 inline-block rounded text-sm font-medium text-sage-700 underline underline-offset-4">← Вернуться к подготовке приложения</Link> : null}
      <nav aria-label="Путь к таблице" className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-muted"><Link href="/tables" className="hover:text-ink">Таблицы</Link><span aria-hidden> / </span><Link href={`/tables/${table.id}`} className="hover:text-ink">{store.table.name}</Link><span aria-hidden> / </span><span>{readOnly ? 'Просмотр' : 'Редактирование'}</span></nav>
      <TableSwitcher
        tables={table.workspaceTables}
        activeTableId={table.id}
        onError={setError}
        compact
        canCreate={!readOnly && !recordDirty}
      />

      {!readOnly && table.templateId && table.sampleCount > 0 ? (
        <TemplateNotice tableId={table.id} sampleCount={table.sampleCount} />
      ) : null}

      <header className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{store.table.name}</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {mode === 'records' ? recordRows.length : shown.rows.length} из {store.table.rows.length} строк
            {pending ? ' · сохранение…' : ''}
          </p>
        </div>
        <details className="min-w-0 max-w-full"><summary className="cursor-pointer rounded-lg border border-sand-200 bg-white px-3 py-2.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-sage-400">Действия с таблицей</summary><div className="mt-3 flex flex-wrap gap-2">
          {!readOnly ? <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!await canLeaveRecord()) return
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
          </button> : null}
          <a
            href="/apps"
            className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)]"
          >
            Приложения
          </a>
          {!readOnly ? <a
            href="/import"
            className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)]"
          >
            Импорт
          </a> : null}
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
        </div></details>
      </header>

      <div data-guide="table-mode" className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div aria-label="Способ работы с таблицей" className="inline-flex rounded-xl border border-sand-200 bg-sand-50 p-1">
          {([['grid', 'Таблица'], ['records', 'По записям']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => changeMode(value)} className={`rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-sage-500 ${mode === value ? 'bg-white text-ink shadow-soft' : 'text-ink-muted hover:bg-white/70'}`}>{label}</button>)}
        </div>
        {readOnly ? <span className="text-sm text-ink-muted">Только просмотр{viewOnly && member.role !== 'viewer' ? <> · <Link href={`/t/${table.id}?mode=${mode}${selectedRowId ? `&r=${encodeURIComponent(selectedRowId)}` : ''}`} className="underline">Перейти к редактированию</Link></> : null}</span> : <span className="text-xs text-ink-muted">Одни данные, два способа редактирования</span>}
      </div>

      {mode === 'grid' ? <ViewBar
        readOnly={readOnly}
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
      /> : <label className="mb-4 flex max-w-md items-center gap-3 text-sm"><span>Поиск записей</span><input aria-label="Поиск записей" value={search} onChange={event => setSearch(event.target.value)} placeholder="Название или значение поля" className="min-w-0 flex-1 rounded-lg border border-sand-300 bg-white px-3 py-2 outline-none focus:border-sage-400" /></label>}

      {error ? (
        <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {mode === 'grid' && hiddenByFilter > 0 ? (
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

      {mode === 'records' ? <TableRecordsEditor rows={recordRows} allRows={store.table.rows} fields={store.table.fields} titleField={titleField} selectedRowId={selectedRowId} relatedTitles={table.relatedTitles} readOnly={readOnly} adding={addingRecord} onSelect={selectRecord} onAdd={() => { void addRecord() }} onSave={saveRecordCell} onDirtyChange={setRecordDirty} registerLeaveGuard={registerRecordGuard} actions={rowActions} /> : null}

      {mode === 'grid' && activeView.type === 'grid' ? (
        <div data-guide="table-data" className="min-w-0">
        {!readOnly ? <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={pending} onClick={() => addRow()} className="min-h-11 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">Добавить строку</button><p className="text-xs leading-5 text-ink-soft">Enter или двойной щелчок — изменить ячейку. Длинный текст целиком — в форме записи.</p></div> : null}
        <DataGrid
          autoEditRowId={newGridRowId}
          readOnly={readOnly}
          selectedRowId={selectedRowId}
          onSelectRow={id => { void selectRecord(id) }}
          fields={shownFields}
          groups={shown.groups}
          isGrouped={shown.isGrouped}
          onOpenRow={id => { void selectRecord(id); setOpenRowId(id) }}
          groupField={groupField}
          relatedTitles={table.relatedTitles}
          onEditField={readOnly ? undefined : (field) => setEditingField(field)}
          onAddField={readOnly ? undefined : () => setEditingField('new')}
          onSetCell={setCell}
          onAddRow={addRow}
          onDeleteRow={deleteRow}
          onRenameField={renameField}
        />
        </div>
      ) : null}

      {mode === 'grid' && activeView.type === 'kanban' ? (
        <KanbanView
          readOnly={readOnly}
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

      {mode === 'grid' && activeView.type === 'calendar' ? (
        <CalendarView
          readOnly={readOnly}
          view={activeView}
          fields={store.table.fields}
          rows={shown.rows}
          titleField={titleField}
          onConfigChange={changeConfig}
        />
      ) : null}

      {mode === 'grid' && activeView.type === 'gallery' ? (
        <GalleryView
          readOnly={readOnly}
          view={activeView}
          fields={store.table.fields}
          shownFields={shownFields}
          rows={shown.rows}
          titleField={titleField}
          onConfigChange={changeConfig}
          onAddRow={() => addRow()}
        />
      ) : null}

      {!readOnly && editingField ? (
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

      {mode === 'grid' && openRowId ? (() => {
        const index = shown.rows.findIndex((row) => row.id === openRowId)
        const row = shown.rows[index] ?? store.table.rows.find(row => row.id === openRowId)
        if (!row) return null
        return (
          <RowCard
            row={row}
            actions={rowActions(row)}
            fields={store.table.fields}
            relatedTitles={table.relatedTitles}
            relatedTables={Object.fromEntries(
              table.workspaceTables.map((item) => [item.id, { name: item.name, fields: item.fields }]),
            )}
            readOnly={readOnly}
            position={index >= 0 ? index + 1 : 1}
            total={index >= 0 ? shown.rows.length : 1}
            onSetCell={setCell}
            onPrev={index > 0 ? () => { const id = shown.rows[index - 1]!.id; setOpenRowId(id); void selectRecord(id) } : undefined}
            onNext={
              index >= 0 && index < shown.rows.length - 1 ? () => { const id = shown.rows[index + 1]!.id; setOpenRowId(id); void selectRecord(id) } : undefined
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
