'use client'
import {configureBuilderV2Enter,configureBuilderV2EnterWorkflow} from '@/lib/builder-v2-enter-action'
import {configureBuilderV2BoardMove} from '@/lib/builder-v2-board-policy'
import {configureBuilderV2ItemAction,configureBuilderV2ItemWorkflow} from '@/lib/builder-v2-item-action'
import {builderV2ButtonContext} from '@/lib/builder-v2-working-scope'
import {addBuilderLearningForm,builderLearningFormTarget} from '@/lib/builder-learning-form'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { appV2Schema, appV2ComponentPresets, validateAppV2, type AppV2, type AppV2Actor, type AppV2Node } from '@tableapp/schema/app-v2'
import { reloadBuilderV2DraftAction, saveBuilderV2DraftAction } from '@/app/builder-v2-actions'
import { readBuilderV2DataAction } from '@/app/builder-v2-data-actions'
import { uploadBuilderV2LogoAction } from '@/app/builder-v2-logo-actions'
import type { BuilderBusinessApp } from '@/lib/builder-v2-business-types'
import { createDraftSaveQueue } from '@/lib/draft-save-queue'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { Logo } from '@/components/marketing/logo'
import { PrototypeDialog } from '../prototype/dialog'
import { BuilderThemeContext } from '../prototype/theme-context'
import { ProtoIcon } from '../prototype/icons'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'
import scroll from './scroll-overflow.module.css'
import { useScrollOverflow } from './scroll-overflow'
import frame from './app-frame.module.css'
import { BuilderV2Inspector } from './inspector'
import { addNode, createCollectionCard, setCollectionCard, duplicateNode, editorCatalog, moveNode, newScreen, NODE_KINDS, nodeDescendants, nodeContext, placeNode, removeNode, removeScreen, replaceNode, updateNodeSource, v2Id } from './model'
import { builderV2HistoryData, useBuilderV2Navigation } from './use-navigation'
import { useBuilderV2Record } from './use-record'
import { BuilderV2RecordContent } from './record-content'
import { BUILDER_V2_FORM_TYPES, builderV2FormInputs } from '@/lib/builder-v2-form-types'
import { AppV2Renderer } from './view'
import {BuilderV2Account,BuilderV2AppFrame,BuilderV2Theme} from './app-frame'
import {BuilderV2AppearanceSettings} from './appearance-settings'
import { configureBuilderV2FormSave, configureBuilderV2FormWorkflow } from '@/lib/builder-v2-form-action'
import { configureBuilderV2Delete } from '@/lib/builder-v2-delete-action'
import { configureBuilderV2Button, configureBuilderV2ButtonWorkflow } from '@/lib/builder-v2-button-action'
import {BuilderV2WorkflowHistory} from './workflow-history'
import {BuilderV2PublishDialog} from './publish-dialog'
import {BuilderV2AccessDialog} from './access-dialog'
import { useBuilderLearning } from './use-learning'
import { BuilderLearningBar, BuilderLearningDialog } from './learning'
import { builderLearningStep, builderLearningTarget, type BuilderLearningProgress, type BuilderLearningStep } from '@/lib/builder-learning-types'
import { builderV2CatalogCollection, builderV2CatalogDefaults, builderV2StarterCatalog } from '@/lib/builder-v2-catalog'
import { builderV2PreviewRecordParent, collectionCardScreen } from './collection-navigation'
import { BuilderV2OrderWorkbench } from './order-workbench'
import { builderV2HeaderProfile } from './record-presentation'

type History = { past: AppV2[]; app: AppV2; future: AppV2[] }
type Modal = { type: 'fields'; parentId: string } | { type: 'library'; parentId: string | null } | { type: 'source'; parentId: string | null; nodeType: 'collection' | 'metric' | 'chart' | 'form'; history?: boolean } | { type: 'page' } | { type: 'delete-page' } | { type: 'reload' } | { type: 'leave' } | {type:'runs'} | {type:'publish'} | {type:'access'} | null
type Panel = 'screens' | 'canvas' | 'properties'

function NameForm({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState('')
  return <form className={styles.newPageForm} onSubmit={event => { event.preventDefault(); if (name.trim()) onCreate(name.trim()) }}><label>Название экрана<input required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Например, Мои проекты" /></label><button type="submit" className={styles.primary} disabled={!name.trim()}>Создать экран<ProtoIcon name="arrow" /></button></form>
}
function SourceForm({ tables, onChoose }: { tables: readonly BuilderV2Table[]; onChoose: (id: string) => void }) {
  const [tableId, setTableId] = useState(tables[0]?.id ?? '')
  return <form className={styles.newPageForm} onSubmit={event => { event.preventDefault(); if (tableId) onChoose(tableId) }}>{tables.length ? <><label>Таблица<select value={tableId} onChange={event => setTableId(event.target.value)}>{tables.map(table => <option key={table.id} value={table.id}>{table.name}</option>)}</select></label><button type="submit" className={styles.primary}>Добавить элемент</button></> : <p className={ui.hint}>Подходящих таблиц пока нет. Создайте таблицу с полями в разделе «Таблицы», затем обновите редактор.</p>}</form>
}
export function AppV2Editor({ initialApp, initialRevision, initialPublishedRevision = null, tables: initialTables, businessApps = [], canEdit, actor, initialScreen, initialRecordId, fromImport = false, initialLearning = null }: { initialApp: AppV2; initialRevision: string; initialPublishedRevision?: string | null; tables: readonly BuilderV2Table[]; businessApps?: readonly BuilderBusinessApp[]; canEdit: boolean; actor: AppV2Actor; initialScreen?: string; initialRecordId?: string; fromImport?: boolean; initialLearning?: BuilderLearningProgress | null }) {
  const router = useRouter(), revision = useRef(initialRevision), conflictRef = useRef(false)
  const [history, setHistory] = useState<History>({ past: [], app: initialApp, future: [] }), app = history.app
  const [tables, setTables] = useState(initialTables)
  const [publishedRevision, setPublishedRevision] = useState(initialPublishedRevision)
  const navigation = useBuilderV2Navigation(app, initialScreen, initialRecordId), screenId = navigation.screenId
  const record = useBuilderV2Record(app, screenId, navigation.recordId)
  const learning = useBuilderLearning(app.id, initialLearning, fromImport, canEdit)
  const [learningHelp, setLearningHelp] = useState<'overview' | BuilderLearningStep | null>(null)
  const [openingExample, setOpeningExample] = useState(false)
  useEffect(() => { if (record.learning) learning.apply(record.learning); if (record.learningError) learning.setError(record.learningError) }, [record.learning, record.learningError, learning.apply, learning.setError])
  useEffect(() => { if (fromImport && learning.progress) { const url = new URL(window.location.href); url.searchParams.delete('start'); window.history.replaceState(builderV2HistoryData(), '', url) } }, [fromImport, learning.progress])
  const [appearance,setAppearance]=useState(false), [logoUploading, setLogoUploading] = useState(false), [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [tab, setTab] = useState<'screens' | 'data' | 'appearance'>('screens'), [inspectScreen, setInspectScreen] = useState(false)
  const headerMenuRef = useRef<HTMLDivElement>(null), panelTabsRef = useRef<HTMLElement>(null)
  const openAppearance=()=>{setTab('appearance');setAppearance(true);setEditing(true);setSelectedId(null);setInspectScreen(false);setPanel('properties')}
  const openScreens=()=>{setTab('screens');setAppearance(false);setEditing(true);setPanel('canvas')}
  const openData=()=>{setTab('data');setAppearance(false);setSelectedId(null);setInspectScreen(false);setEditing(true);setPanel('canvas')}
  const [selectedId, setSelectedId] = useState<string | null>(null), [panel, setPanel] = useState<Panel>('canvas'), [editing, setEditing] = useState(!(fromImport || initialLearning && !initialLearning.paused && builderLearningStep(initialLearning))), [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const showProperties = appearance || Boolean(selectedId) || inspectScreen
  useScrollOverflow(panelTabsRef, [editing, panel, appearance])
  const [modal, setModal] = useState<Modal>(null), [search, setSearch] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [status, setStatus] = useState('Сохранено'), [saving, setSaving] = useState(false), [conflict, setConflict] = useState(false)
  const [reloadError, setReloadError] = useState('')
  const page = app.screens.find(screen => screen.id === screenId) ?? app.screens[0]
  const recordParent = builderV2PreviewRecordParent(app, screenId, actor)
  const connectedTableIds = new Set([...app.sources.map(source => source.tableId), ...app.nodes.flatMap(node => node.type === 'form' ? [node.tableId] : [])])
  const connectedTables = tables.filter(table => connectedTableIds.has(table.id))
  const selected = app.nodes.find(node => node.id === selectedId)
  const queueRef = useRef<ReturnType<typeof createDraftSaveQueue<AppV2>> | null>(null)
  if (!queueRef.current) queueRef.current = createDraftSaveQueue(initialApp, async snapshot => {
    const result = await saveBuilderV2DraftAction(initialApp.id, snapshot, revision.current)
    if (result.ok) { revision.current = result.revision; learning.apply(result.learning) }
    else if (result.conflict) { conflictRef.current = true; setConflict(true) }
    return result
  })
  const flush = useCallback(async () => {
    if (!canEdit) return queueRef.current!.dirty() ? { ok: false as const, error: 'Для сохранения изменений нужны права редактора' } : { ok: true as const }
    if (conflictRef.current) return { ok: false as const, error: 'Сначала выберите, какую версию продолжить' }
    setSaving(true); setStatus('Сохраняем…')
    const result = await queueRef.current!.flush()
    setSaving(false)
    if (result.ok) { setStatus('Сохранено'); setError('') }
    else { setStatus('Не сохранено'); setError(result.error) }
    return result
  }, [canEdit])
  useEffect(() => {
    if (!canEdit || !queueRef.current!.dirty() || conflictRef.current) return
    const timer = setTimeout(() => { void flush() }, 800)
    return () => clearTimeout(timer)
  }, [app, canEdit, flush])
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => { if (queueRef.current!.dirty()) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', before)
    return () => window.removeEventListener('beforeunload', before)
  }, [])
  const adoptDraft = useCallback((app: AppV2, tables: readonly BuilderV2Table[], nextRevision: string) => {
    revision.current = nextRevision
    queueRef.current!.reset(app)
    setHistory({ past: [], app, future: [] })
    setTables(tables)
    setSelectedId(id => app.nodes.some(node => node.id === id) ? id : null)
    setStatus('Сохранено')
  }, [])
  useEffect(() => {
    if (modal || logoUploading) return
    const queue = queueRef.current!
    let active = true, pending = false
    const refresh = async () => {
      if (document.visibilityState === 'hidden' || pending || queue.dirty() || conflictRef.current) return
      const known = revision.current, snapshot = queue.current()
      pending = true
      try {
        const result = await reloadBuilderV2DraftAction(app.id, known)
        if (!active || !result?.ok || queue.dirty() || conflictRef.current || revision.current !== known || queue.current() !== snapshot) return
        setPublishedRevision(result.publishedRevision)
        if (!result.unchanged) adoptDraft(result.app, result.tables, result.revision)
      } catch { /* Keep the current draft available when offline. */ }
      finally { pending = false }
    }
    const restore = (event: PageTransitionEvent) => { if (event.persisted) void refresh() }
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', restore)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      active = false
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', restore)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [app.id, adoptDraft, logoUploading, modal])
  useEffect(() => { document.title = `${app.name || 'Приложение'} · Конструктор · Scatta` }, [app.name])
  const commit = (next: AppV2) => {
    if (!canEdit) return false
    if (next.nodes.length > 2000 || next.screens.length > 100 || next.sources.length > 200 || next.workflows.length > 100) { setError('Достигнут предел количества экранов или элементов'); return false }
    const issues = validateAppV2(next, editorCatalog(next, tables))
    if (issues.length) { setError(issues[0]!.message); return false }
    setHistory(current => ({ past: [...current.past.slice(-39), current.app], app: next, future: [] }))
    queueRef.current!.set(next); setStatus('Есть правки'); setNotice(''); if (!conflictRef.current) setError('')
    return true
  }
  const undo = () => { const previous = history.past.at(-1); if (!canEdit || !previous) return; setHistory({ past: history.past.slice(0, -1), app: previous, future: [app, ...history.future] }); queueRef.current!.set(previous); setStatus(saving ? 'Сохраняем…' : queueRef.current!.dirty() ? 'Есть правки' : 'Сохранено') }
  const redo = () => { const next = history.future[0]; if (!canEdit || !next) return; setHistory({ past: [...history.past, app], app: next, future: history.future.slice(1) }); queueRef.current!.set(next); setStatus(saving ? 'Сохраняем…' : queueRef.current!.dirty() ? 'Есть правки' : 'Сохранено') }
  const keyboard = useRef({ undo, redo }); keyboard.current = { undo, redo }
  useEffect(() => {
    const listener = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !(event.target instanceof HTMLElement && event.target.closest('input,textarea,select,dialog,[contenteditable=true]'))) { event.preventDefault(); if (event.shiftKey) keyboard.current.redo(); else keyboard.current.undo() } }
    window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener)
  }, [])
  const attempt = (work: () => void) => { try { work() } catch (error) { setError(error instanceof Error ? error.message : 'Не удалось изменить элемент') } }
  const chooseScreen = (id: string) => { setTab('screens'); setAppearance(false); navigation.navigate(id); setSelectedId(null); setInspectScreen(true); setPanel(window.innerWidth < 1100 ? 'properties' : 'canvas'); setNotice('') }
  const chooseNode = (id: string) => { setTab('screens'); setAppearance(false); setSelectedId(id); setInspectScreen(false); if (window.innerWidth < 1100) setPanel('properties') }
  const customizeFirstList = () => {
    const target = builderLearningTarget(app, learning.progress?.target?.nodeId)
    if (!target) { setModal({ type: 'source', parentId: null, nodeType: 'collection' }); return }
    navigation.navigate(target.screenId); setSelectedId(target.nodeId); setEditing(true); setPanel('properties')
  }
  const learningForm=builderLearningFormTarget(app,actor)
  const learningScreen = app.screens.find(screen => screen.id === learning.progress?.target?.screenId)
  const learningTable = tables.find(table => table.id === learning.progress?.target?.tableId)
  const listScreen = learningScreen && learningTable ? { screenName: learningScreen.name, tableName: learningTable.name } : undefined
  const learningAction = async () => {
    const step=learning.progress&&builderLearningStep(learning.progress)
    if(step==='save'){
      const target=builderLearningFormTarget(app,actor)
      if(!target){attempt(()=>{const next=addBuilderLearningForm(app,tables);if(commit(next.app)){chooseScreen(next.screenId);setSelectedId(next.id);setEditing(true);setPanel('properties')}});return}
      if(!target.configured){navigation.navigate(target.screenId);setSelectedId(target.formId);setEditing(true);setPanel('properties');setNotice('В свойствах формы выберите сохранение после отправки и разрешённую роль.');return}
      const rowId=page?.id===target.screenId?navigation.recordId:null
      if(target.contextTableId&&!rowId){const list=builderLearningTarget(app);if(list){navigation.navigate(list.screenId);setEditing(false);setPanel('canvas');setNotice('Откройте запись из списка, затем вернитесь к этому шагу.')}else learning.setError('Откройте запись в карточке или добавьте форму на обычный экран.');return}
      if((await flush()).ok)router.push(`/apps/${encodeURIComponent(app.id)}/forms/${encodeURIComponent(target.formId)}?screen=${encodeURIComponent(target.screenId)}${rowId?`&row=${encodeURIComponent(rowId)}`:''}&learn=1`)
      return
    }
    if(step==='access'){setModal({type:'access'});return}
    if(step==='publish'){if(!logoUploading && (await flush()).ok)setModal({type:'publish'});return}
    if (!learning.progress?.target) {
      if (!builderLearningTarget(app)) { setModal({ type: 'source', parentId: null, nodeType: 'collection' }); return }
      if ((await flush()).ok) await learning.perform('resume')
      return
    }
    if (builderLearningStep(learning.progress) === 'list') { customizeFirstList(); return }
    const target = builderLearningTarget(app, learning.progress.target.nodeId)
    if (!target?.cardScreenId) { customizeFirstList(); learning.setError('К этому разделу ещё не подключена карточка. Выберите её в настройке «При нажатии».'); return }
    if (openingExample) return
    setOpeningExample(true)
    learning.setError('')
    try {
      if (!(await flush()).ok) return
      const result = await readBuilderV2DataAction(app.id, app, { screenId: target.screenId, nodeId: target.nodeId })
      if (!result.ok) { learning.setError(result.error); return }
      const row = result.page.rows[0] ?? result.page.board?.columns.find(column => column.rows.length)?.rows[0]
      if (!row) { learning.setError(`В разделе «${learningScreen?.name ?? 'Данные'}» пока пусто. Добавьте данные в таблицу или пропустите этот шаг.`); return }
      if (navigation.screenId === target.cardScreenId && navigation.recordId === row.id) record.retry()
      else {
        navigation.navigate(target.screenId)
        navigation.navigate(target.cardScreenId, row.id)
      }
      setSelectedId(null); setEditing(false); setPanel('canvas')
    } catch {
      learning.setError('Не удалось открыть карточку. Попробуйте ещё раз.')
    } finally {
      setOpeningExample(false)
    }
  }
  const library = (parentId: string | null) => { if (canEdit && page) { setSearch(''); setModal(parentId && app.nodes.find(node => node.id === parentId)?.type === 'form' ? { type: 'fields', parentId } : { type: 'library', parentId }) } }
  const insert = (type: AppV2Node['type'], parentId: string | null, tableId = '', inputFieldId?: string) => attempt(() => {
    if (!page) return
    const next = addNode(app, page.id, type, tables, parentId, tableId, inputFieldId, { editCurrentRecord: true, history: modal?.type === 'source' && modal.history })
    const table = !parentId && !page.contextTableId && type === 'collection' && tables.find(table => table.id === tableId)
    const catalog = table && !(modal?.type === 'source' && modal.history) && builderV2StarterCatalog(table)
    let draft = next.app
    const collection = draft.nodes.find(node => node.id === next.id)
    if (table && catalog && collection?.type === 'collection') {
      draft = replaceNode(draft, builderV2CatalogCollection({ ...collection, name: table.name.slice(0, 120) }, catalog))
      draft = { ...draft, sources: draft.sources.map(source => source.id === collection.sourceId ? { ...source, searchFieldIds: [...new Set([catalog.titleFieldId, ...source.searchFieldIds])] } : source) }
      draft = createCollectionCard(draft, collection.id, tables, catalog).app
    }
    if (!commit(draft)) return
    setSelectedId(next.id); setModal(null); if (window.innerWidth < 1100) setPanel('properties')
  })
  const updatePage = (patch: Partial<AppV2['screens'][number]>) => {
    if (!page) return
    const base=Object.hasOwn(patch,'contextTableId')&&patch.contextTableId!==page.contextTableId?configureBuilderV2Enter(app,page.id,null):app
    const next = { ...base, screens: base.screens.map(screen => screen.id === page.id ? { ...screen, ...patch } : screen) }
    if (patch.contextTableId && app.homeScreenId === page.id) next.homeScreenId = app.screens.find(screen => screen.id !== page.id && !screen.contextTableId)?.id ?? null
    commit(next)
  }
  const collectionTable = (node: Extract<AppV2Node, { type: 'collection' }>) => {
    const tableId = app.sources.find(source => source.id === node.sourceId)?.tableId
    return tables.find(table => table.id === tableId)
  }
  const catalogFor = (node: AppV2Node) => {
    const table = node.type === 'collection' && node.layout === 'catalog' && collectionTable(node)
    return table ? builderV2CatalogDefaults(table) : undefined
  }
  const updateNode = (node: AppV2Node) => attempt(() => {
    let next = replaceNode(app, node)
    if (node.type === 'collection' && node.layout === 'catalog' && selected?.type === 'collection' && selected.layout !== 'catalog') {
      const catalog = catalogFor(node)
      if (catalog) {
        const cardId = collectionCardScreen(next, node)
        const source = next.sources.find(source => source.id === node.sourceId)
        if (source?.searchFieldIds.length) next = { ...next, sources: next.sources.map(item => item.id === source.id ? { ...item, searchFieldIds: [...new Set([catalog.titleFieldId, ...source.searchFieldIds])].slice(0, 50) } : item) }
        if (!node.events.itemPress) next = createCollectionCard(next, node.id, tables, catalog).app
        else if (cardId) next = { ...next, screens: next.screens.map(screen => screen.id === cardId && !screen.catalog ? { ...screen, catalog } : screen) }
      }
    }
    commit(next)
  })
  const source = (tableId: string) => attempt(() => {
    if (!selected || !('sourceId' in selected)) return
    const table = tables.find(table => table.id === tableId)
    if (!table?.fields.length) throw new Error('Выберите таблицу с полями')
    const existing = { id: v2Id(), tableId, viewId: null, filter: null, sorts: [], searchFieldIds: [table.primaryFieldId ?? table.fields[0]!.id], pageSize: 30 }
    const chartGroup=selected.type==='chart'?(table.fields.find(field=>field.type==='single_select')??table.fields.find(field=>['date','datetime'].includes(field.type))??table.fields.find(field=>['text','long_text','checkbox'].includes(field.type))):undefined
    if(selected.type==='chart'&&!chartGroup)throw new Error('Для диаграммы нужно поле с текстом, статусом или датой')
    const next = replaceNode({ ...app, sources: app.sources.some(source => source.id === existing!.id) ? app.sources : [...app.sources, existing] }, selected.type === 'collection' ? { ...selected, sourceId: existing.id, titleFieldId: table.primaryFieldId ?? table.fields[0]!.id, subtitleFieldId: null,cardImageFieldId:undefined,cardDetailFieldId:undefined,listGroupFieldId:undefined,recordGroup:undefined,dateFieldId:undefined,groupFieldId:undefined,statusFieldId:undefined,historyNoteFieldId:undefined,kanbanMoveRoleIds:undefined,layout: selected.layout==='calendar'||selected.layout==='kanban'||selected.layout==='timeline'||selected.layout==='history'?'list':selected.layout, itemIds: selected.itemIds } : selected.type==='chart'?{...selected,sourceId:existing.id,groupFieldId:chartGroup!.id,chartType:'bar',dateGrouping:'month',operation:'count',fieldId:null}:{ ...selected, sourceId: existing.id, operation: 'count', fieldId: null })
    commit(next)
  })
  const reload = async () => {
    setSaving(true); setReloadError('')
    try {
      const result = await reloadBuilderV2DraftAction(app.id)
      if (!result.ok) { setReloadError(result.error); return }
      if (result.unchanged) return
      adoptDraft(result.app, result.tables, result.revision)
      setPublishedRevision(result.publishedRevision)
      conflictRef.current = false
      navigation.navigate(result.app.homeScreenId ?? result.app.screens[0]?.id ?? '')
      setSelectedId(null); setConflict(false); setError(''); setModal(null)
    }
    catch { setReloadError('Не удалось загрузить версию. Ваши правки остаются здесь.') }
    finally { setSaving(false) }
  }
  const leave = async () => { const result = await flush(); if (result.ok) router.push('/apps'); else setModal({ type: 'leave' }) }
  const previewPage = async () => { const result = await flush(); if (result.ok) router.push(`/apps/${app.id}/preview?screen=${encodeURIComponent(page?.id ?? '')}&device=${device}${navigation.recordId ? `&row=${encodeURIComponent(navigation.recordId)}` : ''}`) }
  const draftDiffers = Boolean(publishedRevision && (publishedRevision !== revision.current || queueRef.current.dirty()))
  const publicationLabel = !publishedRevision ? 'Черновик' : draftDiffers ? 'Есть правки к публикации' : 'Опубликовано'
  const publicationShort = !publishedRevision ? 'Черновик' : draftDiffers ? 'Правки' : 'Опубликовано'
  const saveLabel = canEdit ? status : 'Только просмотр'
  const saveState = !canEdit ? 'view' : status === 'Сохраняем…' ? 'saving' : status === 'Не сохранено' ? 'error' : status === 'Есть правки' ? 'dirty' : 'saved'
  useEffect(() => {
    if (!headerMenuOpen) return
    const close = (event: PointerEvent) => { if (!headerMenuRef.current?.contains(event.target as Node)) setHeaderMenuOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setHeaderMenuOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', onKey) }
  }, [headerMenuOpen])
  useEffect(() => {
    const nav = panelTabsRef.current
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !current || nav.scrollWidth <= nav.clientWidth + 1) return
    nav.scrollTo?.({ left: Math.max(0, current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2) })
  }, [panel, appearance, editing])

  return <BuilderThemeContext.Provider value={{ className: frame.editorPalette ?? '', scheme: 'light', style: {} }}><div className={`${styles.editor} ${frame.editorPalette}`}><a className={styles.skip} href="#builder-main">Перейти к рабочей области</a>
    {modal?.type==='access'&&<BuilderV2AccessDialog app={app} tables={tables} onClose={()=>setModal(null)} onSave={candidate=>{const parsed=appV2Schema.safeParse(candidate);if(!parsed.success)return 'Проверьте роли, почты и настройки доступа';const issues=validateAppV2(parsed.data,editorCatalog(parsed.data,tables));if(issues.length)return issues[0]!.message;if(!commit(parsed.data))return 'Не удалось сохранить доступ';if(learning.progress)void flush().then(result=>{if(result.ok)void learning.confirmAccess(revision.current)});return null}}/>}
    {modal?.type==='runs'&&<BuilderV2WorkflowHistory appId={app.id} onClose={()=>setModal(null)} initialSource="published"/>}
    {modal?.type==='publish'&&<BuilderV2PublishDialog app={app} revision={revision.current} onClose={()=>setModal(null)} onPublished={progress=>{setPublishedRevision(revision.current);learning.apply(progress)}}/>}
    <header className={styles.header}>
      <div className={styles.brandArea}>
        <Link href="/apps" prefetch={false} className={styles.brand} aria-label="Все приложения" onClick={event => { event.preventDefault(); void leave() }}><Logo reversed={app.theme.scheme === 'dark'} /></Link>
        <span className={styles.headerDivider} />
        <input aria-label="Название приложения" value={app.name} maxLength={200} disabled={!canEdit} onChange={event => commit({ ...app, name: event.target.value })} />
        <span className={styles.prototypeLabel} title={publicationLabel}><span className={styles.publicationFull}>{publicationLabel}</span>{publicationShort !== publicationLabel && <span className={styles.publicationShort}>{publicationShort}</span>}</span>
        <span className={styles.saveState} role="status" data-ok={saveState === 'saved' ? 'true' : undefined} data-state={saveState} title={saveLabel}>{saveLabel}</span>
      </div>
      <nav className={styles.modeSeg} aria-label="Конструктор">
        <button type="button" aria-current={tab === 'data' ? 'page' : undefined} onClick={openData}><ProtoIcon name="table" size={16} /><span>Данные</span></button>
        <button type="button" aria-current={tab === 'screens' && !appearance ? 'page' : undefined} onClick={openScreens}><ProtoIcon name="apps" size={16} /><span>Экраны</span></button>
        <button type="button" aria-current={appearance ? 'page' : undefined} onClick={openAppearance}><ProtoIcon name="palette" size={16} /><span>Оформление</span></button>
        {canEdit && <button type="button" onClick={() => setLearningHelp('overview')}>Первые шаги</button>}
      </nav>
      <div className={`${styles.headerActions} ${ui.headerActions}`}>
        <div className={`${styles.undoGroup} ${styles.desktopOnly}`}>
          {canEdit && <button type="button" className={styles.iconButton} aria-label="История действий" title="История действий" onClick={() => setModal({ type: 'runs' })}><ProtoIcon name="history" /></button>}
          <button type="button" className={styles.iconButton} aria-label="Отменить изменение" disabled={!canEdit || !history.past.length} onClick={undo}><ProtoIcon name="undo" /></button>
          <button type="button" className={styles.iconButton} aria-label="Повторить изменение" disabled={!canEdit || !history.future.length} onClick={redo}><ProtoIcon name="redo" /></button>
        </div>
        <div className={styles.deviceToggle} role="group" aria-label="Размер приложения">
          <button type="button" aria-label="Компьютер" title="Компьютер" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><ProtoIcon name="desktop" size={16} /></button>
          <button type="button" aria-label="Телефон" title="Телефон" aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}><ProtoIcon name="phone" size={16} /></button>
        </div>
        {canEdit && <button type="button" className={`${styles.outlineButton} ${styles.desktopOnly}`} onClick={() => setModal({ type: 'access' })}>Доступ</button>}
        <button type="button" className={editing ? styles.outlineButton : styles.secondary} onClick={() => { setEditing(!editing); setTab('screens'); setAppearance(false); setPanel('canvas') }}><ProtoIcon name={editing ? 'eye' : 'back'} size={16} /><span className={ui.widePreview}>{editing ? 'Предпросмотр' : 'К редактору'}</span><span className={ui.compactPreview}>{editing ? 'Просмотр' : 'Редактор'}</span></button>
        {canEdit && <button type="button" className={`${styles.publishButton} ${styles.desktopOnly}`} disabled={saving || conflict || logoUploading} onClick={() => void flush().then(result => { if (result.ok) setModal({ type: 'publish' }) })}>Опубликовать</button>}
        {canEdit && <div className={styles.headerMenu} ref={headerMenuRef}><button type="button" className={styles.iconButton} aria-label="Ещё действия" aria-haspopup="menu" aria-expanded={headerMenuOpen} aria-controls="builder-header-menu" onClick={() => setHeaderMenuOpen(open => !open)}><ProtoIcon name="more" /></button>{headerMenuOpen && <div className={styles.headerMenuPanel}><p className={styles.menuPublication}><span className={styles.prototypeLabel} title={publicationLabel}>{publicationShort === publicationLabel ? publicationLabel : publicationShort}</span></p><div id="builder-header-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setHeaderMenuOpen(false); setModal({ type: 'access' }) }}>Доступ</button><button type="button" role="menuitem" disabled={saving || conflict || logoUploading} onClick={() => { setHeaderMenuOpen(false); void flush().then(result => { if (result.ok) setModal({ type: 'publish' }) }) }}>Опубликовать</button><button type="button" role="menuitem" onClick={() => { setHeaderMenuOpen(false); setModal({ type: 'runs' }) }}>История</button><button type="button" role="menuitem" disabled={!history.past.length} onClick={() => { setHeaderMenuOpen(false); undo() }}>Отменить</button><button type="button" role="menuitem" disabled={!history.future.length} onClick={() => { setHeaderMenuOpen(false); redo() }}>Повторить</button></div></div>}</div>}
      </div>
    </header>
    {canEdit && <BuilderLearningBar listScreen={listScreen} progress={learning.progress} loading={learning.loading} saveAction={learningForm?learningForm.configured?'Открыть форму':'Настроить сохранение':'Добавить форму'} saveDescription={learningForm?learningForm.configured?undefined:'Выберите действие после отправки и роль, которой разрешено сохранять данные.':'Добавьте в приложение форму, через которую будете сохранять данные.'} busy={learning.busy || openingExample} error={learningHelp ? '' : learning.error} onAction={() => void learningAction()} onPause={() => void learning.perform('pause')} onSkip={() => { const step = learning.progress && builderLearningStep(learning.progress); if (step) void learning.perform(`skip_${step}`) }} onHelp={setLearningHelp} onRetry={() => { if (record.learningError) record.retry(); else void learning.retry() }} />}
    {!editing && (!learning.progress || learning.progress.paused) && !learning.loading && <div className={ui.context}>Вы видите данные по своим правам в пространстве. Можно открывать записи из списков. Формы можно проверить без сохранения в таблицы.</div>}
    {(error || notice) && <div className={error ? styles.errorBanner : styles.noticeBanner} role={error ? 'alert' : 'status'}><span>{error || notice}</span>{error && canEdit && !conflict && <button type="button" className={styles.textButton} disabled={saving} onClick={() => void flush()}>Повторить сохранение</button>}{conflict && <button type="button" className={styles.textButton} onClick={() => { setReloadError(''); setModal({ type: 'reload' }) }}>Загрузить серверную версию</button>}{!conflict && <button type="button" className={styles.iconButton} aria-label="Закрыть сообщение" onClick={() => { if (!conflict) setError(''); setNotice('') }}><ProtoIcon name="close" /></button>}</div>}
    {tab === 'data' ? <div className={styles.dataWorkspace}>
      <aside className={styles.sidebar}><div className={styles.panelHeading}><h2>Таблицы</h2></div>
        {connectedTables.length ? connectedTables.map(table => <Link key={table.id} href={`/t/${encodeURIComponent(table.id)}`} target="_blank" rel="noopener" prefetch={false} className={styles.treePage}><ProtoIcon name="table" /><span>{table.name}</span><small>{table.fields.length}</small></Link>) : <p className={styles.help}>Пока нет подключённых таблиц. Добавьте список или форму на экран.</p>}
      </aside>
      <main id="builder-main" className={styles.dataMain}><header className={styles.dataHeading}><div><span className={styles.overline}>Данные приложения</span><h1>Таблицы и поля</h1></div><span>Отсюда смотрите, какие поля есть у записей</span></header>
        {connectedTables.length ? <div className={styles.fieldRows}>{connectedTables.map(table => <div key={table.id} style={{ display: 'grid', gap: 8, marginBottom: 20 }}><div className={styles.entityCard}><span className={styles.entityMark}><ProtoIcon name="table" size={16} /></span><span><strong>{table.name}</strong><small>{table.fields.length} полей</small></span></div>
          {table.fields.slice(0, 12).map(field => <div key={field.id} className={styles.fieldRow}><span className={styles.fieldIcon}><ProtoIcon name="text" size={14} /></span><span>{field.name}</span><small>{field.type}</small></div>)}
          <Link href={`/t/${encodeURIComponent(table.id)}`} target="_blank" rel="noopener" prefetch={false} className={styles.addField}>Открыть таблицу</Link>
        </div>)}</div> : <div className={styles.historyEmpty}><span className={styles.elementMark}><ProtoIcon name="table" size={24} /></span><h2>Сначала добавьте блок со списком</h2><p>На вкладке «Экраны» нажмите «+ Добавить блок» и выберите список или форму — таблица появится здесь.</p></div>}
      </main>
    </div> : <>
    {editing && <nav ref={panelTabsRef} className={`${styles.mobilePanels} ${ui.mobilePanelTabs} ${scroll.row}`} aria-label="Панели редактора">{([['screens', 'Экраны'], ['canvas', 'Приложение'], ['properties', 'Свойства']] as const).map(([id, title]) => <button type="button" key={id} aria-current={!appearance&&panel === id ? 'page' : undefined} onClick={() => {setAppearance(false);setTab('screens');setPanel(id)}}>{title}</button>)}<button type="button" aria-current={appearance&&panel==='properties'?'page':undefined} onClick={openAppearance}>Оформление</button>{canEdit && <button type="button" aria-label="Первые шаги" onClick={() => setLearningHelp('overview')}>Помощь</button>}</nav>}
    <div className={`${styles.workspace} ${ui.editorWorkspace}`} data-editing={editing} data-panel={panel} data-props={showProperties ? 'true' : 'false'}>
      {editing && <aside className={styles.sidebar} data-area="screens">
        <div className={styles.panelHeading}><h2>Экраны</h2>{canEdit && <button className={styles.iconButton} aria-label="Добавить экран" type="button" onClick={() => setModal({ type: 'page' })}><ProtoIcon name="plus" /></button>}</div>
        <div className={styles.pageList}>{app.screens.map(screen => <button type="button" className={styles.treePage} key={screen.id} aria-current={page?.id === screen.id ? 'true' : undefined} onClick={() => chooseScreen(screen.id)}><ProtoIcon name={screen.icon} /><span>{screen.name}</span>{app.homeScreenId === screen.id && <span title="Стартовый экран" className={styles.homeMark}><ProtoIcon name="home" size={12} /></span>}</button>)}</div>
        {canEdit && page && <button type="button" className={styles.addBlock} onClick={() => library(null)}><ProtoIcon name="plus" />+ Добавить блок</button>}
        <p className={styles.help}>Блок — часть экрана: заголовок, список, форма или кнопка. Нажмите блок в превью, чтобы настроить.</p>
      </aside>}
      <main className={styles.canvasMain} id="builder-main" data-area="canvas"><div className={`${styles.previewToolbar} ${ui.canvasToolbar}`}><span className={`${styles.modeCaption} ${ui.canvasCaption}`}>{editing ? canEdit ? 'Редактирование' : 'Просмотр настроек' : 'Предпросмотр'}</span>{!editing && <button type="button" className={styles.textButton} disabled={saving} onClick={() => void previewPage()}>Открыть отдельно<ProtoIcon name="arrow" /></button>}</div><div className={styles.previewStage} data-device={device} data-frame-scroll><BuilderV2Theme app={app}><BuilderV2AppFrame draftLogo scrollKey={navigation.recordId ?? ''} app={app} screenId={page?.id??''} sectionId={recordParent?.screenId} profile={builderV2HeaderProfile(app, screenId, tables, record.record)} back={page?.contextTableId ? () => { navigation.back(recordParent?.screenId); setSelectedId(null) } : undefined} title={record.title??page?.name??'Новый экран'} phone={device==='mobile'} deviceMode={device === 'mobile' ? 'phone' : 'desktop'} headerAction={<BuilderV2Account email={actor.email} authenticated={actor.authenticated} slug={app.slug} preview />} onNavigate={id=>{navigation.navigate(id);setSelectedId(null);setInspectScreen(false)}}>{page ? <BuilderV2OrderWorkbench app={app} parent={recordParent} tables={tables} recordId={navigation.recordId} record={record.record} onOpen={id => { navigation.navigate(screenId, id, true); setSelectedId(null); setInspectScreen(false) }}>
                <BuilderV2RecordContent contextual={Boolean(page.contextTableId)} recordId={navigation.recordId} data={record} editing={editing}>
                  <AppV2Renderer live app={app} tables={tables} businessApps={businessApps} actor={actor} screenId={page.id} editing={editing && canEdit} selectedId={selectedId} onSelect={chooseNode} onAdd={library} record={record.record} onNavigate={(screenId, rowId) => { navigation.navigate(screenId, rowId); setSelectedId(null); setInspectScreen(false) }} />
                </BuilderV2RecordContent>
              </BuilderV2OrderWorkbench> : <button type="button" className={styles.emptyCanvas} disabled={!canEdit} onClick={() => setModal({ type: 'page' })}><ProtoIcon name="plus" /><strong>Добавьте первый экран</strong><span>С него начнётся ваше приложение</span></button>}</BuilderV2AppFrame></BuilderV2Theme></div></main>
      {editing && showProperties && <aside className={styles.properties} data-area="properties"><div className={styles.panelHeading}><h2>{appearance?'Оформление':selected?'Блок':'Экран'}</h2><button type="button" className={styles.mobileBack} onClick={() => {setAppearance(false);setTab('screens');setPanel('canvas')}}><ProtoIcon name="back" size={16} />К приложению</button></div><fieldset className={ui.readOnlyFieldset} disabled={!canEdit}>{appearance?<BuilderV2AppearanceSettings app={app} onChange={commit} onUploadLogo={form => uploadBuilderV2LogoAction(app.id, form)} onLogoPending={setLogoUploading} onScreens={()=>{setAppearance(false);setTab('screens');setSelectedId(null);setInspectScreen(true);setPanel('properties')}}/>:page && <BuilderV2Inspector key={selected?.id ?? page.id} app={app} tables={tables} businessApps={businessApps} screenId={page.id} selected={selected} onNode={updateNode} onScreen={updatePage} onEnterConfigure={roles=>attempt(()=>{if(page)commit(configureBuilderV2Enter(app,page.id,roles))})} onEnterWorkflow={flow=>{if(!page)return 'Выберите экран';try{const next=configureBuilderV2EnterWorkflow(app,page.id,flow),parsed=appV2Schema.safeParse(next);if(!parsed.success)return 'Проверьте шаги действия';const issues=validateAppV2(parsed.data,editorCatalog(parsed.data,tables));if(issues.length)return issues[0]!.message;return commit(parsed.data)?null:'Не удалось сохранить шаги'}catch(error){return error instanceof Error?error.message:'Не удалось сохранить шаги'}}} canOpenEnter={!page.contextTableId||Boolean(navigation.recordId)} onOpenEnter={()=>{void flush().then(result=>{if(result.ok)router.push(`/apps/${encodeURIComponent(app.id)}/events/${encodeURIComponent(page.id)}${navigation.recordId?`?row=${encodeURIComponent(navigation.recordId)}`:''}`)})}} onHome={() => commit({ ...app, homeScreenId: page.id })} onMove={delta => { if (selected) commit(moveNode(app, selected.id, delta)) }} onDuplicate={() => attempt(() => { if (selected) { const result = duplicateNode(app, page.id, selected.id); if (commit(result.app)) setSelectedId(result.id) } })} onDelete={() => { if (selected) { if (commit(removeNode(app, selected.id))) setSelectedId(null) } }} onPlace={id => attempt(() => { if (selected) commit(placeNode(app, page.id, selected.id, id)) })} onSource={source} onSourceSettings={patch => { if (selected) commit(updateNodeSource(app, selected.id, patch)) }} onCard={id => attempt(() => { if (!selected) return; if (id === 'create') { const result = createCollectionCard(app, selected.id, tables, catalogFor(selected)); if (commit(result.app)) chooseScreen(result.screenId) } else commit(setCollectionCard(app, selected.id, id)) })} onMoveScreen={delta => { const screens = [...app.screens], index = screens.findIndex(screen => screen.id === page.id); if (index + delta >= 0 && index + delta < screens.length) { [screens[index], screens[index + delta]] = [screens[index + delta]!, screens[index]!]; commit({ ...app, screens }) } }} onDeleteScreen={() => setModal({ type: 'delete-page' })} onBoardMove={roles=>attempt(()=>{if(selected?.type==='collection')commit(configureBuilderV2BoardMove(app,selected.id,roles))})} onItemAction={roles=>attempt(()=>{if(selected?.type==='collection')commit(configureBuilderV2ItemAction(app,selected.id,roles))})} onOpenItemAction={()=>{void flush().then(result=>{if(result.ok){setEditing(false);setPanel('canvas');setNotice('Нажмите на нужную строку списка. Откроется рабочее действие.')}})}} onItemWorkflow={flow=>{if(selected?.type!=='collection')return 'Выберите список';try{const next=configureBuilderV2ItemWorkflow(app,selected.id,flow),parsed=appV2Schema.safeParse(next);if(!parsed.success)return 'Проверьте шаги действия';const issues=validateAppV2(parsed.data,editorCatalog(parsed.data,tables));if(issues.length)return issues[0]!.message;return commit(parsed.data)?null:'Не удалось сохранить шаги'}catch(error){return error instanceof Error?error.message:'Не удалось сохранить шаги'}}} onFormWorkflow={flow => { if (selected?.type !== 'form') return 'Выберите форму'; try { const next = configureBuilderV2FormWorkflow(app, selected.id, flow), parsed = appV2Schema.safeParse(next); if (!parsed.success) return 'Проверьте поля и сообщения в шагах действия'; const issues = validateAppV2(parsed.data, editorCatalog(parsed.data, tables)); if (issues.length) return issues[0]!.message; return commit(parsed.data) ? null : 'Не удалось сохранить шаги' } catch (error) { return error instanceof Error ? error.message : 'Не удалось сохранить шаги' } }} onFormMode={mode => attempt(() => { if (selected?.type !== 'form') return; const next = configureBuilderV2FormSave(app, selected.id, null), form = next.nodes.find(node => node.id === selected.id); if (form?.type === 'form') commit(replaceNode(next, { ...form, mode, name: form.name === 'Новая запись' && mode === 'edit' ? 'Изменить запись' : form.name })) })} onButtonAction={roles => attempt(() => { if(selected?.type==='button') commit(configureBuilderV2Button(app,selected.id,roles)) })} onButtonWorkflow={flow => { if(selected?.type!=='button') return 'Выберите кнопку'; try { const next=configureBuilderV2ButtonWorkflow(app,selected.id,flow),parsed=appV2Schema.safeParse(next); if(!parsed.success) return 'Проверьте поля и сообщения в шагах действия'; const issues=validateAppV2(parsed.data,editorCatalog(parsed.data,tables)); if(issues.length) return issues[0]!.message; return commit(parsed.data)?null:'Не удалось сохранить шаги' } catch(error) { return error instanceof Error?error.message:'Не удалось сохранить шаги' } }} onDeleteAction={roles => attempt(() => { if (selected?.type === 'button') commit(configureBuilderV2Delete(app, selected.id, roles)) })} onOpenAction={() => { if (selected?.type !== 'button' || !page) return; if(builderV2ButtonContext(app,page.id,selected.id)?.collection){void flush().then(result=>{if(result.ok){setEditing(false);setPanel('canvas');setNotice('Нажмите кнопку в нужной строке списка. Откроется рабочее действие.')}});return} if (page.contextTableId && !navigation.recordId) { setError('Сначала откройте запись из списка'); return } void flush().then(result => { if (result.ok) router.push(`/apps/${encodeURIComponent(app.id)}/actions/${encodeURIComponent(selected.id)}?screen=${encodeURIComponent(page.id)}${navigation.recordId ? `&row=${encodeURIComponent(navigation.recordId)}` : ''}`) }) }} onFormAction={roles => attempt(() => { if (selected?.type === 'form') commit(configureBuilderV2FormSave(app, selected.id, roles)) })} onOpenForm={() => { if (selected?.type !== 'form' || !page) return; if (selected.mode === 'edit' && !navigation.recordId) { setError('Сначала откройте запись из списка'); return } void flush().then(result => { if (result.ok) router.push(`/apps/${encodeURIComponent(app.id)}/forms/${encodeURIComponent(selected.id)}?screen=${encodeURIComponent(page.id)}${navigation.recordId ? `&row=${encodeURIComponent(navigation.recordId)}` : ''}`) }) }} />}</fieldset></aside>}
    </div>
    </>}
{learningHelp && <BuilderLearningDialog mode={learningHelp} listScreen={listScreen} onOpenFields={() => { setLearningHelp(null); customizeFirstList() }} progress={learning.progress} busy={learning.busy} error={learning.error} onClose={() => setLearningHelp(null)} onContinue={() => { void (async () => { if (!(await flush()).ok) return; const intent = !learning.progress ? 'start' : builderLearningStep(learning.progress) ? 'resume' : 'pause'; if (await learning.perform(intent)) setLearningHelp(null) })() }} onRetryStep={step => { void learning.perform(`retry_${step}`).then(ok => { if (ok) setLearningHelp(null) }) }} />}
    {modal?.type === 'fields' && <PrototypeDialog title="Добавить поле" onClose={() => setModal(null)}><div className={styles.library}>{(() => { const form = app.nodes.find(node => node.id === modal.parentId); if (form?.type !== 'form') return null; const used = new Set(builderV2FormInputs(app, form).map(input => input.fieldId)), fields = tables.find(table => table.id === form.tableId)?.fields.filter(field => BUILDER_V2_FORM_TYPES.includes(field.type) && !used.has(field.id)) ?? []; return fields.length ? fields.map(field => <button type="button" key={field.id} onClick={() => insert('input', form.id, '', field.id)}><span className={styles.elementMark}><ProtoIcon name="plus" size={22} /></span><span><strong>{field.name}</strong><small>Поле формы</small></span></button>) : <p className={ui.hint}>Все доступные поля уже добавлены.</p> })()}</div></PrototypeDialog>}
    {modal?.type === 'page' && <PrototypeDialog title="Новый экран" onClose={() => setModal(null)}><NameForm onCreate={name => { const next = newScreen(app, name); if (commit(next)) { chooseScreen(next.screens.at(-1)!.id); setModal(null) } }} /></PrototypeDialog>}
    {modal?.type === 'source' && <PrototypeDialog title="Выберите таблицу" onClose={() => setModal(null)}><SourceForm tables={tables.filter(table => (!modal.history || table.fields.some(field=>['date','datetime'].includes(field.type)))&&table.fields.length&&(modal.nodeType!=='chart'||table.fields.some(field=>['text','long_text','single_select','checkbox','date','datetime'].includes(field.type))))} onChoose={id => insert(modal.nodeType, modal.parentId, id)} /></PrototypeDialog>}
    {modal?.type === 'library' && <PrototypeDialog title="Добавить блок" onClose={() => setModal(null)}><input className={styles.librarySearch} aria-label="Найти блок" placeholder="Например, список или форма" value={search} onChange={event => setSearch(event.target.value)} /><div className={styles.library}>{(appV2ComponentPresets.history.name+' '+appV2ComponentPresets.history.description).toLowerCase().includes(search.toLowerCase()) && <button type="button" onClick={() => setModal({ type: 'source', parentId: modal.parentId, nodeType: 'collection', history: true })}><span className={styles.elementMark}><ProtoIcon name={appV2ComponentPresets.history.icon} size={22}/></span><span><strong>{appV2ComponentPresets.history.name}</strong><small>{appV2ComponentPresets.history.description}</small></span><ProtoIcon name="plus" size={16}/></button>}{Object.entries(NODE_KINDS).filter(([type, value]) => `${value[0]} ${value[1]}`.toLowerCase().includes(search.toLowerCase()) && (!['chart','business','team_calendar'].includes(type)||!modal.parentId||!app.nodes.some(node=>node.type==='collection'&&nodeDescendants(app,node.id).has(modal.parentId!))) && (!['business','team_calendar'].includes(type)||!nodeContext(app,page?.id??'',modal.parentId).formId) && (type!=='team_calendar'||!nodeContext(app,page?.id??'',modal.parentId).rowTableId) && (type !== 'input' || nodeContext(app, page?.id ?? '', modal.parentId).formId) && (type !== 'field' || nodeContext(app, page?.id ?? '', modal.parentId).rowTableId)).map(([type, [title, hint, icon]]) => <button key={type} type="button" onClick={() => ['collection', 'metric', 'chart', 'form'].includes(type) ? setModal({ type: 'source', parentId: modal.parentId, nodeType: type as 'collection' | 'metric' | 'chart' | 'form' }) : insert(type as AppV2Node['type'], modal.parentId)}><span className={styles.elementMark}><ProtoIcon name={icon} size={22} /></span><span><strong>{title}</strong><small>{hint}</small></span><ProtoIcon name="plus" size={16} /></button>)}</div></PrototypeDialog>}
    {modal?.type === 'delete-page' && <PrototypeDialog title={`Удалить экран «${page?.name}»?`} onClose={() => setModal(null)}><p className={styles.deleteCopy}>Элементы экрана и связанные переходы будут удалены. Таблицы и записи сохранятся.</p><div className={styles.confirmButtons}><button type="button" className={styles.secondary} onClick={() => setModal(null)}>Оставить</button><button type="button" className={styles.danger} onClick={() => attempt(() => { if (page) { const next = removeScreen(app, page.id); if (commit(next)) { chooseScreen(next.homeScreenId ?? next.screens[0]!.id); setModal(null) } } })}>Удалить экран</button></div></PrototypeDialog>}
    {modal?.type === 'reload' && <PrototypeDialog title="Открыть серверную версию?" closeDisabled={saving} onClose={() => { if (!saving) setModal(null) }}><p className={styles.deleteCopy}>Несохранённые правки этой вкладки будут заменены сохранённой версией. Можно остаться и продолжить редактирование здесь.</p>{reloadError && <p className={styles.errorBanner} role="alert">{reloadError}</p>}<div className={styles.confirmButtons}><button type="button" className={styles.secondary} disabled={saving} onClick={() => setModal(null)}>Остаться</button><button type="button" className={styles.primary} disabled={saving} onClick={() => void reload()}>Открыть серверную версию</button></div></PrototypeDialog>}
    {modal?.type === 'leave' && <PrototypeDialog title="Покинуть без сохранения?" onClose={() => setModal(null)}><p className={styles.deleteCopy}>Последние правки не удалось сохранить. При выходе они будут потеряны.</p><div className={styles.confirmButtons}><button type="button" className={styles.primary} onClick={() => setModal(null)}>Остаться</button><button type="button" className={styles.secondary} onClick={() => { queueRef.current!.reset(app); router.push('/apps') }}>Покинуть без сохранения</button></div></PrototypeDialog>}
  </div></BuilderThemeContext.Provider>
}
