'use client'

import type { Field, View, ViewType } from '@tableapp/schema'
import { defaultViewConfig, isComputed, newId, positionBetween } from '@tableapp/schema'
import Link from 'next/link'
import { TableActionsMenu } from './table-actions-menu'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  deleteRowAction,
  renameFieldAction,
  setCellAction,
  type ActionResult,
} from '@/app/actions'
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
import { NO_RECORD_PANELS, type TableRecordPanels } from '@/lib/table-record-panels'
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
import { TableFieldsDialog } from './table-fields-dialog'
import { ownerPrimary, ownerSecondary } from './owner-ui'
import { loadTablePageAction, saveTableRowsAction } from '@/app/table-editor-actions'
import { groupEditorCells, parseEditorValue, type EditorCell, type EditorLeaveGuard, type EditorResult, type GridBookmark } from '@/lib/table-editor-values'
import { useUnsaved } from '@/lib/unsaved'
import type { TableRow } from '@/lib/table-store'
import { rememberTableEditorMode, rememberedTableEditorMode, tableEditorMode } from '@/lib/table-editor-mode'

const SAVE_DELAY_MS = 600
const loadedEditorRows = (table: LoadedTable) => table.editorPinnedRow && !table.rows.some(row => row.id === table.editorPinnedRow!.id) ? [...table.rows, table.editorPinnedRow] : table.rows

export function TableScreen({ table: initialTable, member, initialRowId = null, initialMode = 'records', viewOnly = false, recordPanels = NO_RECORD_PANELS,limitedAccess=false }: { table: LoadedTable; member: { role: string }; initialRowId?: string | null; initialMode?: 'grid' | 'records'; viewOnly?: boolean; recordPanels?: TableRecordPanels;limitedAccess?:boolean }) {
  const [table, setTable] = useState(initialTable)
  const [pageOffset, setPageOffset] = useState(initialTable.editorPage?.offset ?? 0)
  const [pageLoading, setPageLoading] = useState(false)
  const [pageFailure, setPageFailure] = useState(false)
  const [pageRetry, setPageRetry] = useState(0)
  const readOnly = member.role === 'viewer' || viewOnly

  const store = useTable({
    id: table.id,
    name: table.name,
    fields: table.fields,
    rows: loadedEditorRows(table).map((row) => ({ id: row.id, position: row.position, data: row.data, version: row.version })),
  })

  const [views, setViews] = useState<View[]>(table.views)
  const [activeViewId, setActiveViewId] = useState(table.editorPage?.viewId ?? table.views[0]?.id ?? '')
  const [search, setSearch] = useState(table.editorPage?.search ?? '')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [keepVisible, setKeepVisible] = useState<string[]>([])
  const [openRowId, setOpenRowId] = useState<string | null>(null)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(initialRowId)
  const [mode, setMode] = useState(initialMode)
  const [recordDirty, setRecordDirty] = useState(false)
  const recordDirtyRef = useRef(false)
  recordDirtyRef.current = recordDirty
  const recordLeaveGuard = useRef<(() => Promise<boolean>) | null>(null)
  const registerRecordGuard = useCallback((guard: (() => Promise<boolean>) | null) => { recordLeaveGuard.current = guard }, [])
  const [error, setError] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<Field | null | 'new'>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const query = useSearchParams().toString()
  const setupReturn = new URLSearchParams(query).get('setup')
  const returnToSetup = setupReturn?.startsWith('/setup?') ? setupReturn : null
  const [newGridRowId, setNewGridRowId] = useState<string | null>(null)
  const [draftRow,setDraftRow] = useState<TableRow|null>(null)
  const draftRowRef=useRef(draftRow);draftRowRef.current=draftRow
  const [draftEdits,setDraftEdits]=useState<EditorCell[]>([])
  const draftEditsRef=useRef<EditorCell[]>([])
  const [draftError,setDraftError]=useState<Exclude<EditorResult,{ok:true}>|null>(null)
  const draftFailure=useRef<string|null>(null)
  const [savingDraft,setSavingDraft]=useState(false)
  const draftSavingRef=useRef(false)
  const [fieldsOpen,setFieldsOpen]=useState(false)
  const [gridDirty,setGridDirty]=useState(false)
  const gridDirtyRef=useRef(false);gridDirtyRef.current=gridDirty
  const [editorSaving,setEditorSaving]=useState(false)
  const editorSavingRef=useRef(false);editorSavingRef.current=editorSaving
  const gridGuard=useRef<EditorLeaveGuard|null>(null)
  const registerGridGuard=useCallback((guard:EditorLeaveGuard|null)=>{gridGuard.current=guard},[])
  const bookmark=useRef<GridBookmark|undefined>(undefined)
  const rememberGrid=useCallback((value:GridBookmark)=>{bookmark.current=value},[])
  const [resetVersion,setResetVersion]=useState(0)
  const leaveDialog=useRef<HTMLDialogElement>(null)
  const [leaveOpen,setLeaveOpen]=useState(false)
  const [leaveSaving,setLeaveSaving]=useState(false)
  const leaveRequest=useRef<{promise:Promise<boolean>;resolve:(allowed:boolean)=>void}|null>(null)
  const hasDraft=!!draftRow
  useUnsaved(`new-table-row:${table.id}`,hasDraft||savingDraft)
  useEffect(()=>{if(leaveOpen)leaveDialog.current?.showModal();else leaveDialog.current?.close()},[leaveOpen])

  useEffect(() => {
    if (!recordDirty && !gridDirty && !hasDraft) return
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
  }, [recordDirty,gridDirty,hasDraft])

  const canLeaveRecord = async () => {
    if(editorSavingRef.current||draftSavingRef.current){setError('Дождитесь окончания сохранения.');return false}
    if (!recordDirtyRef.current && !gridDirtyRef.current && !draftRowRef.current) return true
    if(leaveRequest.current)return leaveRequest.current.promise
    let resolve!:(allowed:boolean)=>void
    const promise=new Promise<boolean>(done=>{resolve=done})
    leaveRequest.current={promise,resolve};setLeaveOpen(true)
    return promise
  }
  const writeEditorQuery = (nextMode: 'grid' | 'records', id: string | null) => {
    const params = new URLSearchParams(window.location.search)
    params.set('mode', nextMode)
    if (table.editorPage) {
      params.set('p', String(Math.floor(pageOffset / table.editorPage.limit) + 1))
      params.set('view', activeViewId)
      if (search) params.set('q', search); else params.delete('q')
    }
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
    rememberTableEditorMode(next)
    writeEditorQuery(next, selectedRowId)
  }

  // Search-only navigation and browser history can reuse this Client Component.
  // Read the URL too, rather than treating initial props as permanent state.
  useEffect(() => {
    const params = new URLSearchParams(query)
    const nextMode = tableEditorMode(params.get('mode'), rememberedTableEditorMode(document.cookie) ?? initialMode)
    const requested = params.get('r')
    const nextRow = requested && (requested === selectedRowId || draftRowRef.current?.id === requested || store.table.rows.some(row => row.id === requested)) ? requested : null
    const nextSearch = table.editorPage ? (params.get('q') ?? '').slice(0, 500) : search
    const nextOffset = table.editorPage ? params.has('p') ? Math.floor(Math.max(1, Math.min(100_000, Number(params.get('p')) || 1)) - 1) * table.editorPage.limit : initialTable.editorPage?.offset ?? 0 : pageOffset
    const nextView = table.editorPage ? params.get('view') ?? initialTable.editorPage?.viewId ?? activeViewId : activeViewId
    if (nextMode === mode && nextRow === selectedRowId && nextSearch === search && nextOffset === pageOffset && nextView === activeViewId) return
    let live = true
    void canLeaveRecord().then(allowed => {
      if (!live) return
      if (!allowed) { writeEditorQuery(mode, selectedRowId); return }
      setMode(nextMode); setSelectedRowId(nextRow); setOpenRowId(null)
      setSearch(nextSearch); setPageOffset(nextOffset); setActiveViewId(nextView)
    })
    return () => { live = false }
    // Local changes write the URL in the same event; only a changed URL should replay navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const activeView = views.find((view) => view.id === activeViewId) ?? views[0]
  const dataKey = JSON.stringify([mode, activeView?.id, activeView?.config, search, pageOffset])
  const loadedKey = useRef(dataKey)
  const lastRetry = useRef(0)
  const requestGeneration = useRef(0)
  useEffect(() => {
    setTable(initialTable)
    if (initialTable.editorPage) {
      const page = initialTable.editorPage
      setPageOffset(page.offset); setSearch(page.search); setActiveViewId(page.viewId)
      const view = initialTable.views.find(view => view.id === page.viewId)
      loadedKey.current = JSON.stringify([page.mode, view?.id, view?.config, page.search, page.offset])
    }
  }, [initialTable])
  useEffect(() => {
    if (!table.editorPage || loadedKey.current === dataKey && lastRetry.current === pageRetry) { setPageLoading(false); return }
    lastRetry.current = pageRetry
    const generation = ++requestGeneration.current
    setPageLoading(true); setPageFailure(false)
    const timer = setTimeout(() => {
      void loadTablePageAction(table.id, { mode, viewId: activeView?.id, config: activeView?.config, search, offset: pageOffset,
        ...(table.editorPage?.mode !== mode && selectedRowId ? { rowId: selectedRowId } : {}) }).then(result => {
        if (generation !== requestGeneration.current) return
        if (!result.ok) { setError(result.error); setPageFailure(true); return }
        const page = result.table.editorPage!
        loadedKey.current = JSON.stringify([mode, activeView?.id, activeView?.config, search, page.offset])
        setTable(result.table); setPageOffset(page.offset); setKeepVisible([]); bookmark.current = undefined
        setResetVersion(version => version + 1)
        setSelectedRowId(current => loadedEditorRows(result.table).some(row => row.id === current) ? current : null)
        setOpenRowId(null); setError(null)
        const params = new URLSearchParams(window.location.search)
        params.set('mode', mode); params.set('p', String(page.offset / page.limit + 1)); params.set('view', page.viewId)
        if (search) params.set('q', search); else params.delete('q')
        if (!loadedEditorRows(result.table).some(row => row.id === params.get('r'))) params.delete('r')
        window.history.replaceState(null, '', `/t/${encodeURIComponent(table.id)}?${params}`)
      }).catch(() => { if (generation === requestGeneration.current) { setPageFailure(true); setError('Не удалось загрузить строки. Повторите попытку.') } })
        .finally(() => { if (generation === requestGeneration.current) setPageLoading(false) })
    }, 250)
    return () => { clearTimeout(timer); requestGeneration.current++ }
    // Selection does not load a page; it is only retained when switching modes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, pageRetry])
  const changeSearch = (value: string) => { void canLeaveRecord().then(allowed => { if (allowed) { setSearch(value.slice(0, 500)); setPageOffset(0) } }) }
  const changePage = (offset: number) => { void canLeaveRecord().then(allowed => { if (allowed) { setPageOffset(offset); setSelectedRowId(null) } }) }

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
      rows: loadedEditorRows(table).map((row) => ({ id: row.id, position: row.position, data: row.data, version: row.version })),
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

  const changeConfig = (config: View['config']) => { void canLeaveRecord().then(allowed => { if (allowed) applyConfig(config) }) }
  const applyConfig = (config: View['config']) => {
    if (!activeView) return
    setPageOffset(0)
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
  const stageCells=(cells:EditorCell[])=>{
    const next=new Map(draftEditsRef.current.map(cell=>[`${cell.rowId}:${cell.fieldId}`,cell]))
    for(const cell of cells){const key=`${cell.rowId}:${cell.fieldId}`;const previous=next.get(key);next.set(key,{...cell,base:previous?previous.base:cell.base})}
    draftEditsRef.current=[...next.values()];setDraftEdits(draftEditsRef.current)
  }
  const setCell = async (rowId: string, fieldId: string, value: unknown, base?: unknown):Promise<EditorResult> => {
    if (readOnly) return {ok:false,error:'Таблица открыта только для просмотра.'}
    const field=store.table.fields.find(field=>field.id===fieldId)
    if(!field)return {ok:false,error:'Поле не найдено.'}
    let parsed:unknown
    try{parsed=parseEditorValue(field,value)}catch(cause){return {ok:false,error:cause instanceof Error?cause.message:'Проверьте значение.'}}
    if(draftRowRef.current){
      if(rowId===draftRowRef.current.id){const next={...draftRowRef.current,data:{...draftRowRef.current.data,[fieldId]:parsed}};draftRowRef.current=next;setDraftRow(next);setDraftError(null)}
      else stageCells([{rowId,fieldId,value:parsed,base:base!==undefined?base:store.table.rows.find(row=>row.id===rowId)?.data[fieldId]??null}])
      return {ok:true}
    }
    const result=await saveTableRowsAction(table.id,[{id:rowId,data:{[fieldId]:parsed},base:{[fieldId]:base!==undefined?base:store.table.rows.find(row=>row.id===rowId)?.data[fieldId]??null}}]).catch(()=>({ok:false as const,error:'Не удалось сохранить ячейку. Повторите попытку.'}))
    if(result.ok){store.setCell(rowId,fieldId,parsed);setError(null)}else if(mode!=='grid'||activeView?.type!=='grid')setError(result.error)
    return result
  }
  const setRange=async(cells:EditorCell[]):Promise<EditorResult>=>{
    if(readOnly)return {ok:false,error:'Таблица открыта только для просмотра.'}
    if(draftRowRef.current){
      const draft=draftRowRef.current
      const own=cells.filter(cell=>cell.rowId===draft.id)
      stageCells(cells.filter(cell=>cell.rowId!==draft.id))
      if(own.length){const next={...draft,data:{...draft.data,...Object.fromEntries(own.map(cell=>[cell.fieldId,cell.value]))}};draftRowRef.current=next;setDraftRow(next)}
      setDraftError(null);return {ok:true}
    }
    const result=await saveTableRowsAction(table.id,groupEditorCells(cells))
    if(result.ok){for(const cell of cells)store.setCell(cell.rowId,cell.fieldId,cell.value);setError(null);router.refresh()}
    return result
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
  const addRow = async (_afterRowId?: string) => {
    if (readOnly || draftRowRef.current || !await canLeaveRecord()) return
    if(mode==='grid'&&activeView?.type!=='grid'){
      const grid=views.find(view=>view.type==='grid')
      if(grid)setActiveViewId(grid.id)
      else setMode('records')
    }
    const rowId = newId('row')
    const row:TableRow={id:rowId,position:positionBetween(table.editorPage?.lastPosition??store.table.rows.at(-1)?.position??null,null),data:Object.fromEntries(store.table.fields.filter(field=>field.type==='checkbox').map(field=>[field.id,false]))}
    draftRowRef.current=row;setDraftRow(row);setDraftError(null)
    setNewGridRowId(rowId)
    setSelectedRowId(rowId);writeEditorQuery(mode,rowId)
  }

  const addRecord = async () => {
    await addRow()
  }

  const discardDraft=()=>{
    const previous=draftRowRef.current
    gridGuard.current?.discard();draftRowRef.current=null;setDraftRow(null);draftEditsRef.current=[];setDraftEdits([]);setDraftError(null);setError(null);setNewGridRowId(null)
    if(previous&&selectedRowId===previous.id){const next=store.table.rows[0]?.id??null;setSelectedRowId(next);writeEditorQuery(mode,next)}
  }
  const saveDraft=async(override?:Record<string,unknown>):Promise<boolean>=>{
    const draft=draftRowRef.current
    if(readOnly||!draft||draftSavingRef.current)return false
    draftSavingRef.current=true;setSavingDraft(true);setDraftError(null);draftFailure.current=null
    const data={...draft.data,...override}
    const writable=Object.fromEntries(Object.entries(data).filter(([id])=>{const field=store.table.fields.find(field=>field.id===id);return field&&!isComputed(field.type)}))
    try{
      const result=await saveTableRowsAction(table.id,[...groupEditorCells(draftEditsRef.current),{id:draft.id,create:true,data:writable}])
      if(!result.ok){setDraftError({...result,rowId:result.rowId??draft.id});draftFailure.current=result.error;return false}
      for(const cell of draftEditsRef.current)store.setCell(cell.rowId,cell.fieldId,cell.value)
      store.addRow(undefined,draft.id);for(const [id,value]of Object.entries(writable))store.setCell(draft.id,id,value)
      draftRowRef.current=null;setDraftRow(null);draftEditsRef.current=[];setDraftEdits([]);setNewGridRowId(null);setError(null);setKeepVisible(current=>[...current,draft.id]);router.refresh();return true
    }catch{draftFailure.current='Не удалось сохранить строку. Введённое осталось на экране.';setDraftError({ok:false,error:draftFailure.current,rowId:draft.id});return false}
    finally{draftSavingRef.current=false;setSavingDraft(false)}
  }
  const saveRecordRow=async(rowId:string,data:Record<string,unknown>,base:Record<string,unknown>):Promise<ActionResult>=>{
    if(draftRowRef.current?.id===rowId){const ok=await saveDraft(data);return ok?{ok:true}:{ok:false,error:draftFailure.current??'Строка не сохранена. Проверьте поля и повторите попытку.'}}
    if(readOnly)return {ok:false,error:'Таблица открыта только для просмотра.'}
    const result=await saveTableRowsAction(table.id,[{id:rowId,data,base}])
    if(result.ok){for(const [id,value]of Object.entries(data))store.setCell(rowId,id,value);setError(null);router.refresh()}
    return result
  }
  const saveGridDraft=async()=>{if(gridGuard.current&&!await gridGuard.current.save())return false;return saveDraft()}
  const finishLeave=(allowed:boolean)=>{leaveRequest.current?.resolve(allowed);leaveRequest.current=null;setLeaveOpen(false)}
  const saveAndLeave=async()=>{
    setLeaveSaving(true)
    try{
      if(mode==='grid'&&gridGuard.current&&!await gridGuard.current.save()){finishLeave(false);return}
      if(mode==='records'&&recordLeaveGuard.current&&!await recordLeaveGuard.current()){finishLeave(false);return}
      if(draftRowRef.current&&!await saveDraft()){finishLeave(false);return}
      finishLeave(true)
    }finally{setLeaveSaving(false)}
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
    const all=[...store.table.rows,...(draftRow?[draftRow]:[])]
    if (!query) return all
    return all.filter(row => row.id===draftRow?.id || store.table.fields.some(field =>
      cellText(field, row.data[field.id], table.relatedTitles).toLocaleLowerCase('ru-RU').includes(query),
    ))
  }, [search, store.table.rows, store.table.fields, table.relatedTitles,draftRow])
  const gridGroups=useMemo(()=>shown.groups.map(group=>({...group,rows:group.rows.map(row=>{
    const edits=draftEdits.filter(cell=>cell.rowId===row.id)
    return edits.length?{...row,data:{...row.data,...Object.fromEntries(edits.map(cell=>[cell.fieldId,cell.value]))}}:row
  })})),[shown.groups,draftEdits])
  const selectGridRow=(id:string)=>{setSelectedRowId(id);writeEditorQuery('grid',id)}
  const rowTools=<>
    {!readOnly?(draftRow?<><button type="button" className={ownerPrimary} disabled={savingDraft} onClick={()=>void saveGridDraft()}>{savingDraft?'Сохраняем…':'Сохранить строку'}</button><button type="button" className={ownerSecondary} disabled={savingDraft} onClick={discardDraft}>Отменить</button></>:<button type="button" className={ownerPrimary} disabled={pending||pageLoading||pageFailure} onClick={()=>void addRow()}>{mode==='records'?'Добавить запись':'Добавить строку'}</button>):null}
    <button type="button" aria-label="Поля таблицы" className={ownerSecondary} onClick={()=>setFieldsOpen(true)}>Поля</button>
  </>

  const groupField = activeView?.config.groupBy[0]
    ? store.fieldIndex.get(activeView.config.groupBy[0].fieldId)
    : undefined

  const rowActions = (row: (typeof store.table.rows)[number]) => readOnly || limitedAccess ? undefined : <>
    {recordPanels.orderStock ? <OrderStockPanel key={`stock:${table.id}:${row.id}`} tableId={table.id} rowId={row.id} version={row.version ?? 0} business /> : null}
    {recordPanels.inventoryBalance ? <InventoryBalancePanel key={`balance:${table.id}:${row.id}`} tableId={table.id} rowId={row.id} version={row.version ?? 0} business /> : null}
    {recordPanels.delivery ? <OrderDeliveryPanel key={`${table.id}:${row.id}`} tableId={table.id} rowId={row.id} version={row.version ?? 0} business /> : null}
    {recordPanels.customerHistory ? <CustomerHistoryPanel key={`history:${table.id}:${row.id}`} tableId={table.id} rowId={row.id} business /> : null}
  </>

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
      <Link href="/tables" className="mb-5 inline-flex min-h-8 items-center rounded text-sm text-ink-soft underline underline-offset-4">← Все таблицы</Link>

      {!readOnly&&!limitedAccess && table.templateId && table.sampleCount > 0 ? (
        <TemplateNotice tableId={table.id} sampleCount={table.sampleCount} />
      ) : null}

      <header className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{store.table.name}</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {table.editorPage ? `${table.editorPage.matched} из ${table.editorPage.total} строк` : `${mode === 'records' ? recordRows.length : shown.rows.length} из ${store.table.rows.length} строк`}
            {pending ? ' · сохранение…' : ''}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div data-guide="table-mode" aria-label="Способ работы с таблицей" className="inline-flex rounded-full bg-sand-100 p-1">
            {([['grid','Таблицей'],['records','По записям']] as const).map(([value,label])=><button key={value} type="button" disabled={editorSaving||savingDraft} aria-pressed={mode===value} onClick={()=>void changeMode(value)} className={`min-h-10 rounded-full px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-sage-500 disabled:opacity-50 ${mode===value?'bg-white text-sage-700 shadow-soft':'text-ink-muted hover:bg-white/70'}`}>{label}</button>)}
          </div>
        <TableActionsMenu>
          <Link href={`/tables/${table.id}`} className={ownerSecondary}>Сведения и связи</Link>
          <TableSwitcher tables={table.workspaceTables} activeTableId={table.id} onError={setError} compact canCreate={!readOnly&&!recordDirty&&!gridDirty&&!hasDraft}/>
          {!readOnly&&!limitedAccess ? <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!await canLeaveRecord()) return
                router.push(`/apps/new?table=${encodeURIComponent(table.id)}`)
              })
            }
            className="rounded-xl bg-ink px-3.5 py-2 text-sm font-medium text-sand-50 transition-all hover:-translate-y-px hover:bg-ink/90 disabled:translate-y-0 disabled:opacity-40"
          >
            Создать приложение
          </button> : null}
          {!limitedAccess?<a
            href="/apps"
            className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)]"
          >
            Приложения
          </a>:null}
          {!readOnly&&!limitedAccess ? <a
            href={`/import?table=${encodeURIComponent(table.id)}`}
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
        </TableActionsMenu>
        </div>
      </header>

      {readOnly ? <p className="mb-4 text-sm text-ink-muted">Только просмотр{viewOnly && member.role !== 'viewer' ? <> · <Link href={`/t/${table.id}?mode=${mode}${selectedRowId ? `&r=${encodeURIComponent(selectedRowId)}` : ''}`} className="underline">Перейти к редактированию</Link></> : null}</p> : null}

      {table.editorPage && (table.editorPage.total > table.editorPage.limit || pageLoading || pageFailure) ? <nav aria-label="Страницы таблицы" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sand-200 bg-white px-4 py-3">
        <p role="status" className="text-sm text-ink-soft">{pageLoading ? 'Загружаем строки…' : pageFailure ? 'Строки не загружены' : table.editorPage.matched ? `${table.editorPage.offset + 1}–${Math.min(table.editorPage.offset + table.rows.length, table.editorPage.matched)} из ${table.editorPage.matched}` : 'Ничего не найдено'}{mode === 'grid' && applied.isGrouped ? <span className="mt-1 block text-xs">Группы в пределах этой страницы.</span> : null}</p>
        <div className="flex items-center gap-2">{pageFailure ? <button type="button" className={ownerSecondary} onClick={() => setPageRetry(value => value + 1)}>Повторить загрузку</button> : <><button type="button" className={ownerSecondary} disabled={pageLoading || table.editorPage.offset === 0} onClick={() => changePage(Math.max(0, table.editorPage!.offset - table.editorPage!.limit))}>Назад</button><button type="button" className={ownerSecondary} disabled={pageLoading || table.editorPage.offset + table.editorPage.limit >= table.editorPage.matched} onClick={() => changePage(table.editorPage!.offset + table.editorPage!.limit)}>Далее</button></>}</div>
      </nav> : null}

      {mode === 'grid' ? <ViewBar
        leading={rowTools}
        readOnly={readOnly}
        views={views}
        activeView={activeView}
        fields={store.table.fields}
        search={search}
        hiddenCount={applied.hiddenCount}
        onSelectView={id=>{void canLeaveRecord().then(allowed=>{if(allowed){setActiveViewId(id);setPageOffset(0)}})}}
        onCreateView={createView}
        onRenameView={renameView}
        onDeleteView={removeView}
        onConfigChange={changeConfig}
        onSearch={changeSearch}
      /> : <div className="mb-4 flex min-w-0 flex-wrap items-center gap-2">{!readOnly&&!draftRow?<button type="button" className={ownerPrimary} disabled={pageLoading||pageFailure} onClick={()=>void addRecord()}>Добавить запись</button>:null}<button type="button" className={ownerSecondary} onClick={()=>setFieldsOpen(true)}>Поля таблицы</button><label className="ml-auto flex min-w-0 basis-48 items-center gap-3 text-sm"><span className="sr-only">Поиск записей</span><input aria-label="Поиск записей" value={search} onChange={event => changeSearch(event.target.value)} placeholder="Поиск по всей таблице" className="min-h-11 w-full min-w-0 rounded-full border border-sand-200 bg-white px-4 py-2 outline-none focus:border-sage-400" /></label></div>}

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

      <div inert={pageLoading || pageFailure} aria-busy={pageLoading} className={pageLoading || pageFailure ? 'pointer-events-none opacity-60' : undefined}>
      {mode === 'records' ? <TableRecordsEditor recordSummary={table.recordSummary} key={`records:${resetVersion}`} rows={recordRows} allRows={[...store.table.rows,...(draftRow?[draftRow]:[])]} fields={store.table.fields} titleField={titleField} selectedRowId={selectedRowId} relatedTitles={table.relatedTitles} readOnly={readOnly} adding={savingDraft} hideAdd newRowId={draftRow?.id} onCancelNew={discardDraft} onSelect={selectRecord} onAdd={() => { void addRecord() }} onSave={saveRecordCell} onSaveRow={saveRecordRow} onDirtyChange={setRecordDirty} onSavingChange={setEditorSaving} registerLeaveGuard={registerRecordGuard} actions={rowActions} /> : null}

      {mode === 'grid' && activeView.type === 'grid' ? (
        <div data-guide="table-data" className="min-w-0">
        <DataGrid
          key={`grid:${resetVersion}`}
          autoEditRowId={newGridRowId}
          rowOffset={table.editorPage?.offset ?? 0}
          readOnly={readOnly}
          selectedRowId={selectedRowId}
          onSelectRow={selectGridRow}
          fields={shownFields}
          groups={gridGroups}
          draftRow={draftRow}
          stagedCellCount={draftEdits.length}
          draftError={draftError}
          savingDraft={savingDraft}
          onSaveDraft={saveDraft}
          onCancelDraft={discardDraft}
          onBatchChange={setRange}
          bookmark={bookmark.current}
          onBookmarkChange={rememberGrid}
          onDirtyChange={setGridDirty}
          onSavingChange={setEditorSaving}
          registerLeaveGuard={registerGridGuard}
          isGrouped={shown.isGrouped}
          onOpenRow={id => { void canLeaveRecord().then(allowed=>{if(allowed){selectGridRow(id);setOpenRowId(id)}}) }}
          groupField={groupField}
          relatedTitles={table.relatedTitles}
          onEditField={readOnly||limitedAccess ? undefined : (field) => setEditingField(field)}
          onAddField={readOnly||limitedAccess ? undefined : () => setEditingField('new')}
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

      </div>
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
      <TableFieldsDialog open={fieldsOpen} fields={store.table.fields} readOnly={readOnly||limitedAccess} onClose={()=>setFieldsOpen(false)} onEdit={setEditingField} onAdd={()=>setEditingField('new')}/>
      <dialog ref={leaveDialog} aria-labelledby="table-leave-title" onCancel={event=>{event.preventDefault();if(!leaveSaving)finishLeave(false)}} className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-sand-200 bg-white p-6 text-ink shadow-lift backdrop:bg-ink/30">
        <h2 id="table-leave-title" className="text-xl font-semibold">Сохранить изменения?</h2><p className="mt-3 text-sm leading-6 text-ink-soft">На экране остались несохранённые данные.</p><div className="mt-6 flex flex-wrap gap-2"><button type="button" className={ownerPrimary} disabled={leaveSaving} onClick={()=>void saveAndLeave()}>{leaveSaving?'Сохраняем…':'Сохранить и продолжить'}</button><button type="button" className={ownerSecondary} disabled={leaveSaving} onClick={()=>{gridGuard.current?.discard();discardDraft();setResetVersion(value=>value+1);setRecordDirty(false);setGridDirty(false);finishLeave(true)}}>Не сохранять</button><button type="button" className={ownerSecondary} disabled={leaveSaving} onClick={()=>finishLeave(false)}>Остаться</button></div>
      </dialog>
    </main>
  )
}
