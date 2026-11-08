'use client'

import type { App, Device, RoleId, Component, Screen, ScreenType, View } from '@tableapp/schema'
import { byPosition, DEVICES, newId, positionBetween, positionSequence } from '@tableapp/schema'
import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import { publishAppAction, updateAppDraftAction } from '@/app/app-actions'
import { enableInventoryAction, enableStockOperationsAction } from '@/app/inventory-setup-actions'
import { enableDispatchAction } from '@/app/dispatch-setup-actions'
import { enableRepeatRequestsAction } from '@/app/portal-setup-actions'
import { hasDispatchPreset } from '@/lib/templates/dispatch-app'
import { useRouter } from 'next/navigation'
import { useUnsaved } from '@/lib/unsaved'
import { createDraftSaveQueue } from '@/lib/draft-save-queue'
import {
  ANONYMOUS,
  ANONYMOUS_NAME,
  asRole,
  roleName,
  visibleScreensFor,
  type Visitor,
} from '@/lib/app-roles'
import type { RuntimeTable } from '@/lib/app-runtime'
import type { EditorPreview } from '@/lib/editor-preview'
import { editorPreviewAction } from '@/app/editor-preview-actions'
import { bookingPreviewData, defaultPreviewRole, previewCheckout, previewRuntime } from '@/lib/preview-runtime'
import type { RelatedTitles, TableSummary } from '@/lib/queries'
import { AppShell } from '@/components/runtime/app-shell'
import { COMPONENT_LABELS, ComponentSettings, describeComponent, makeComponent } from './component-settings'
import { ComponentAccess } from './component-access'
import { DashboardEditor } from './dashboard-editor'
import { ScreenSettings } from './screen-settings'
import { GuidedEditor } from './guided-editor'
import { ShellIcon } from '@/components/shell/icons'

const SAVE_DELAY_MS = 700

/**
 * Что происходит с черновиком прямо сейчас.
 *
 * Автосохранение без внятного состояния — худший вид автосохранения: человек
 * закрывает вкладку, не зная, успела ли уйти последняя правка. Поэтому состояний
 * пять и каждое названо словами.
 */
type SaveState =
  | { kind: 'idle' }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'note'; text: string }
  | { kind: 'error'; text: string }

const SAVE_WORDS: Record<SaveState['kind'], string> = {
  idle: '',
  dirty: 'Есть несохранённые правки',
  saving: 'Сохраняем…',
  saved: 'Черновик сохранён',
  note: '',
  error: '',
}

/**
 * Ширина места для предпросмотра, в точках.
 *
 * Показать широкий экран в колонке конструктора можно только уменьшив
 * изображение: иначе «Компьютер» и «Телефон» выглядели бы одинаково, потому
 * что колонка узкая, — переключатель, который ничего не меняет, хуже, чем
 * его отсутствие.
 */
const DEVICE_WIDTHS: Record<Device, number> = {
  desktop: 1024,
  tablet: 768,
  mobile: 390,
}

/** Высота рамки предпросмотра в точках: та же, что и в разметке. */
const FRAME_HEIGHT = 576

const DEVICE_WORDS: Record<Device, string> = {
  desktop: 'Компьютер',
  tablet: 'Планшет',
  mobile: 'Телефон',
}

/** Ширина словами: числительное согласуется по-разному, а вариантов всего три. */
const DEVICE_WIDTH_WORDS: Record<Device, string> = {
  desktop: '1024 точки',
  tablet: '768 точек',
  mobile: '390 точек',
}

const SCREEN_TYPE_LABELS: Record<ScreenType, string> = {
  dashboard: 'Сводка',
  list: 'Список',
  tiles: 'Плитка',
  detail: 'Карточка',
  form: 'Форма',
}

const ADDABLE: Component['type'][] = [
  'heading', 'text', 'field', 'button', 'divider', 'image', 'gallery', 'related_list', 'card', 'form_field',
]

type Props = {
  advanced?: boolean
  initialSection?: 'content' | 'access'
  previewInstruction?: string
  helpLinks?: Record<'content' | 'appearance' | 'access', string>
  canEdit?: boolean
  business?: import('@tableapp/schema').BusinessProfile | null
  portalUpgradeTableId?: string | null
  inventoryUpgradeTableId?: string | null
  dispatchUpgradeTableId?: string | null
  initialApp: App
  tables: TableSummary[]
  views: View[]
  runtimeTables: Record<string, RuntimeTable>
  remotePreview?: boolean
  relatedTitles: RelatedTitles
  publishedAt: string | null
}

function PreviewChip({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`min-h-11 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-sage-400 ${
        active
          ? 'bg-ink text-sand-50'
          : 'border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-muted)]'
      }`}
    >
      {children}
    </button>
  )
}

export function AppEditor({ initialApp, tables, views, runtimeTables, relatedTitles, remotePreview = false, publishedAt, inventoryUpgradeTableId, dispatchUpgradeTableId, portalUpgradeTableId, business, canEdit = true, advanced = false, initialSection = 'content', previewInstruction, helpLinks }: Props) {
  const router = useRouter()
  const [app, setApp] = useState<App>(initialApp)
  const [screenId, setScreenId] = useState(initialApp.homeScreenId ?? initialApp.screens[0]?.id ?? '')
  const [componentId, setComponentId] = useState<string | null>(null)
  const [builderPanel, setBuilderPanel] = useState<'screens' | 'settings' | 'preview'>('screens')
  const builderId = useId()
  const settingsHeading = useRef<HTMLHeadingElement>(null)
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  const [draftQueue] = useState(() => createDraftSaveQueue(initialApp, (next: App) => updateAppDraftAction(next.id, next)))
  const [publishing, setPublishing] = useState(false)
  const publicationLock = useRef(false)
  const [publicationVersion, setPublicationVersion] = useState(0)
  useUnsaved(`app-editor:${initialApp.id}`, save.kind === 'dirty' || save.kind === 'saving' || save.kind === 'error')
  const [pending, startTransition] = useTransition()

  const screens = useMemo(() => [...app.screens].sort(byPosition), [app.screens])
  const screen = screens.find((candidate) => candidate.id === screenId) ?? screens[0]

  /** Черновик сохраняется с задержкой: набор текста не должен слать запрос на букву. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  // Revalidation must not remount the editor or replace edits newer than its response.
  const incoming = JSON.stringify(initialApp)
  const previousIncoming = useRef(incoming)
  useEffect(() => {
    if (previousIncoming.current === incoming) return
    previousIncoming.current = incoming
    if (draftQueue.dirty()) return
    draftQueue.reset(initialApp)
    setApp(initialApp)
  }, [incoming, initialApp, draftQueue])

  const resetSavedApp = (next: App) => { draftQueue.reset(next); setApp(next) }
  const saveDraft = async () => {
    setSave({ kind: 'saving' })
    const result = await draftQueue.flush()
    setSave(result.ok ? { kind: 'saved' } : { kind: 'error', text: result.error })
    return result
  }

  const update = (next: App) => {
    if (!canEdit || publishing) return
    setApp(next)
    draftQueue.set(next)
    setSave({ kind: 'dirty' })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      startTransition(async () => { await saveDraft() })
    }, SAVE_DELAY_MS)
  }

  /*
   * Правка, которая ещё не ушла на сервер, живёт только во вкладке. Закрыть
   * её молча нельзя: человек потеряет работу и не узнает об этом.
   */
  useEffect(() => {
    if (save.kind !== 'dirty' && save.kind !== 'saving' && save.kind !== 'error') return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [save.kind])

  // Flush a pending autosave before leaving through any internal link. A failed
  // save keeps the editor and its input visible instead of discarding the draft.
  useEffect(() => {
    let navigating = false
    const leave = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !draftQueue.dirty()) return
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return
      event.preventDefault(); event.stopPropagation()
      if (navigating) return
      navigating = true
      if (timer.current) { clearTimeout(timer.current); timer.current = null }
      startTransition(async () => {
        setSave({ kind: 'saving' })
        const result = await draftQueue.flush()
        if (result.ok) { setSave({ kind: 'saved' }); router.push(`${url.pathname}${url.search}${url.hash}`) }
        else setSave({ kind: 'error', text: result.error })
        navigating = false
      })
    }
    document.addEventListener('click', leave, true)
    return () => document.removeEventListener('click', leave, true)
  }, [draftQueue, router])

  const replaceScreen = (next: Screen) =>
    update({ ...app, screens: app.screens.map((item) => (item.id === next.id ? next : item)) })

  const tableOfScreen = (candidate: Screen | undefined): string | null => {
    if (!candidate) return null
    if (candidate.type === 'list' || candidate.type === 'tiles') {
      return views.find((view) => view.id === candidate.source.viewId)?.tableId ?? null
    }
    // У сводки своей таблицы нет: блок сам знает, из какого представления берёт.
    if (candidate.type === 'dashboard') return null
    return candidate.tableId
  }

  const tableId = tableOfScreen(screen)
  const fields = tableId ? (tables.find((table) => table.id === tableId)?.fields ?? []) : []
  const ownerFieldId = tableId
    ? (app.rowAccessRules.find((rule) => rule.tableId === tableId)?.fieldId ?? null)
    : null

  const addScreen = (type: ScreenType) => {
    const last = screens[screens.length - 1]?.position ?? null
    const firstView = views[0]
    const base = {
      id: newId('screen'),
      appId: app.id,
      name: SCREEN_TYPE_LABELS[type],
      position: positionBetween(last, null),
      tab: null,
      // Новый экран закрыт для гостя: открывают его осознанно, в настройках.
      // Остальные роли берём из приложения, а не из списка в коде: их задаёт
      // владелец, и «staff» у него вполне может не быть вовсе.
      access: { public: false, publicFields: [], roles: app.roles.map((role) => role.id) as RoleId[], allowDelete: false },
      components: [],
    }
    const created =
      type === 'dashboard'
        ? ({ ...base, type, blocks: [] } as Screen)
        : type === 'list' || type === 'tiles'
        ? ({
            ...base,
            type,
            source: { viewId: firstView?.id ?? '', extraFilter: null, searchFieldIds: [] },
            titleFieldId: null,
            subtitleFieldId: null,
            imageFieldId: null,
            metaFieldId: null,
            statusFieldId: null,
            onTapScreenId: null,
            ...(type === 'tiles' ? { columns: 2 } : {}),
          } as Screen)
        : type === 'detail'
          ? ({ ...base, type, tableId: tables[0]?.id ?? '' } as Screen)
          : ({
              ...base,
              type,
              tableId: tables[0]?.id ?? '',
              mode: 'create',
              submitLabel: 'Сохранить',
              successScreenId: null,
              successText: '',
            } as Screen)

    update({ ...app, screens: [...app.screens, created] })
    setScreenId(created.id)
    setComponentId(null)
  }

  const removeScreen = (id: string) => {
    if (app.screens.length <= 1) return setSave({ kind: 'error', text: 'Нельзя удалить единственный экран' })
    const remaining = app.screens.filter((item) => item.id !== id)
    update({
      ...app,
      screens: remaining,
      homeScreenId: app.homeScreenId === id ? (remaining[0]?.id ?? null) : app.homeScreenId,
    })
    setScreenId(remaining[0]?.id ?? '')
  }

  const components = screen ? [...screenComponents(screen)].sort(byPosition) : []
  const selected = components.find((item) => item.id === componentId) ?? null

  const addComponent = (type: Component['type']) => {
    if (!screen) return
    const last = components[components.length - 1]?.position ?? null
    const created = makeComponent(type, positionBetween(last, null), fields, screens)
    replaceScreen({ ...screen, components: [...screenComponents(screen), created] } as Screen)
    setComponentId(created.id)
  }

  const moveComponent = (index: number, delta: number) => {
    if (!screen) return
    const target = index + delta
    if (target < 0 || target >= components.length) return
    // Позиции пересчитываются целиком: для десятка компонентов это проще
    // и надёжнее, чем вычислять дробный индекс между соседями.
    const reordered = [...components]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved!)
    const positions = positionSequence(reordered.length)
    replaceScreen({
      ...screen,
      components: reordered.map((item, i) => ({ ...item, position: positions[i]! })),
    } as Screen)
  }

  const removeComponent = (id: string) => {
    if (!screen) return
    replaceScreen({ ...screen, components: screenComponents(screen).filter((item) => item.id !== id) } as Screen)
    if (componentId === id) setComponentId(null)
  }

  /*
   * Предпросмотр глазами роли.
   *
   * Владелец настраивает доступ на каждом экране по отдельности и до сих пор
   * мог проверить результат единственным способом: выйти из аккаунта и открыть
   * ссылку. Здесь же он переключает роль и сразу видит, что открыл лишнего.
   * Отбор идёт той же функцией, что и на сервере, — иначе предпросмотр врал бы.
   */
  /*
   * Кого показывает предпросмотр.
   *
   * Три разных состояния, а не список ролей: «как автор» — всё без отбора,
   * «без входа» — посторонний по ссылке, и роли приложения. «Без входа» стоит
   * отдельно потому, что это не роль: у человека нет ни имени, ни почты,
   * и поставить её ему в списке доступа нельзя.
   */
  const [previewAs, setPreviewAs] = useState<'editor' | 'anonymous' | RoleId>(() => advanced ? 'editor' : defaultPreviewRole(initialApp))
  const [previewEmail, setPreviewEmail] = useState('')
  const [previewCompany, setPreviewCompany] = useState('')
  const [checkoutPreview, setCheckoutPreview] = useState<ReturnType<typeof previewCheckout>>(null)
  const [remoteData, setRemoteData] = useState<EditorPreview | null>(null)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [remoteKey, setRemoteKey] = useState('')
  const [previewRetry, setPreviewRetry] = useState(0)
  const previewRequest = JSON.stringify([app, previewAs, previewEmail, previewCompany, previewRetry])
  const previewBusy = remotePreview && remoteKey !== previewRequest
  useEffect(() => {
    if (!remotePreview) return
    let active = true
    setRemoteError(null)
    const timer = setTimeout(() => {
      void editorPreviewAction(app.id, app, previewAs, previewEmail, previewCompany).then(result => {
        if (!active) return
        if (result.ok) { setRemoteData(result.preview); setRemoteKey(previewRequest) }
        else setRemoteError(result.error)
      }).catch(() => { if (active) setRemoteError('Не удалось обновить предпросмотр. Повторите попытку.') })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
    // The serialized request includes every draft and identity setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remotePreview, previewRequest])
  const bookingData = useMemo(() => remotePreview ? remoteData?.bookingData : bookingPreviewData(app, runtimeTables), [app, runtimeTables, remotePreview, remoteData])

  const previewVisitor: Visitor | null =
    previewAs === 'editor' ? null : previewAs === 'anonymous' ? ANONYMOUS : asRole(previewAs, previewEmail.trim() || null, previewCompany.trim(), previewAs === 'client')

  /*
   * Размер места отдельно от роли: «как это увидит клиент с телефона» —
   * два независимых вопроса, и сваливать их в один переключатель нельзя.
   * Разметка приложения зависит от ширины контейнера, поэтому достаточно
   * сузить рамку — никаких отдельных раскладок под телефон нет.
   */
  const [device, setDevice] = useState<Device>('mobile')

  /*
   * Ширину рамки меряем, а не предполагаем: колонка конструктора зависит
   * от окна, и коэффициент уменьшения должен считаться от того, что есть.
   */
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  const [frameWidth, setFrameWidth] = useState(0)
  useEffect(() => {
    const node = frame
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setFrameWidth(entry?.contentRect.width ?? 0))
    observer.observe(node)
    return () => observer.disconnect()
  }, [frame])

  const deviceWidth = device === 'mobile' && frameWidth > 0 ? Math.min(DEVICE_WIDTHS.mobile, frameWidth) : DEVICE_WIDTHS[device]
  const scale = device === 'mobile' ? 1 : frameWidth > 0 ? Math.min(1, frameWidth / deviceWidth) : 1

  const shown = useMemo(
    () => (previewVisitor === null ? app.screens : visibleScreensFor(app, previewVisitor)),
    [app, previewVisitor],
  )

  /*
   * Итоги блоков для предпросмотра считает та же функция, что и сервер, —
   * иначе предпросмотр показывал бы не то, что увидит человек. Ограничения
   * по полям тоже настоящие: владелец сразу узнает, что клиенту не посчитается
   * сумма по колонке, которой он не видит.
   */
  const preview = useMemo(() => ({ ...(remotePreview && remoteData ? remoteData.runtime : previewRuntime({ ...app, screens: shown }, views, runtimeTables, relatedTitles, previewVisitor)), business: app.purpose === 'personal' ? null : business ?? null }),
    [app, shown, views, runtimeTables, relatedTitles, previewVisitor, business, remotePreview, remoteData])
  const previewNotice = remotePreview ? <div className="mb-3 text-sm leading-6 text-ink-soft" role="status">{remoteError ? <><p>{remoteError}</p><button type="button" className="mt-2 min-h-11 rounded-lg border border-sand-200 px-3 py-2" onClick={() => setPreviewRetry(value => value + 1)}>Повторить предпросмотр</button></> : previewBusy ? 'Обновляем предпросмотр…' : remoteData?.truncated ? 'В списках — до 100 строк. Итоги рассчитаны по всем данным.' : null}</div> : null

  // Открытый в редакторе экран может быть закрыт выбранной роли: тогда
  // предпросмотр начинается с того, что ей доступно, а не с ошибки.
  const previewScreenId = shown.some((item) => item.id === screen?.id) ? screen?.id : shown[0]?.id
  // A newly added screen is absent from the previous server preview. Mounting
  // it against that stale app makes AppShell keep the old fallback screen.
  const previewScreenReady = !remotePreview || Boolean(remoteData && (!previewScreenId || remoteData.runtime.app.screens.some(item => item.id === previewScreenId)))

  const publish = () => {
    if (!canEdit || publicationLock.current) return
    publicationLock.current = true
    setPublishing(true)
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    startTransition(async () => {
      try {
        const saved = await saveDraft()
        if (!saved.ok) return
        const result = await publishAppAction(app.id, draftQueue.current())
        setSave(result.ok ? { kind: 'note', text: 'Опубликовано. Рабочая ссылка доступна пользователям с настроенными правами.' } : { kind: 'error', text: result.error })
        if (result.ok) { setPublicationVersion(value => value + 1); router.refresh() }
      } catch { setSave({ kind: 'error', text: 'Не удалось подтвердить публикацию. Проверьте соединение и повторите публикацию.' }) }
      finally { publicationLock.current = false; setPublishing(false) }
    })
  }

  if (!advanced) return <GuidedEditor
    initialSection={initialSection}
    previewInstruction={previewInstruction}
    helpLinks={helpLinks}
    app={app} tables={tables} views={views} screens={shown} screen={shown.find(item => item.id === screenId) ?? shown.find(item => item.tab) ?? shown[0]}
    onSectionUpdate={(next, id) => { update(next); setScreenId(id); const target = next.screens.find(screen => screen.id === id); if (target && previewAs !== 'editor' && !target.access.roles.includes(previewAs)) setPreviewAs(target.access.roles[0] ?? 'anonymous') }}
    fields={(() => { const current = shown.find(item => item.id === screenId) ?? shown.find(item => item.tab) ?? shown[0]; return tables.find(table => table.id === tableOfScreen(current))?.fields ?? [] })()}
    canEdit={canEdit} publishing={publishing} pending={pending} published={Boolean(publishedAt) || publicationVersion > 0} publicationVersion={publicationVersion}
    status={save.kind === 'error' || save.kind === 'note' ? save.text : SAVE_WORDS[save.kind]} error={save.kind === 'error'}
    onScreen={setScreenId} onUpdate={update} onSave={() => startTransition(async () => { try { await saveDraft() } catch { setSave({ kind: 'error', text: 'Не удалось сохранить черновик. Повторите сохранение.' }) } })} onPublish={publish}
    roleControls={<div className="space-y-3">
      <label className="block max-w-sm text-sm text-ink-soft">Смотреть как<select aria-label="Роль в предпросмотре" value={previewAs} onChange={event => setPreviewAs(event.target.value as typeof previewAs)} className="mt-1 min-h-11 w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-base">{app.screens.some(item => item.access.public) ? <option value="anonymous">Посетитель</option> : null}{app.roles.filter(role => visibleScreensFor(app, asRole(role.id)).length > 0).map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
      {previewAs !== 'anonymous' && previewAs !== 'editor' && app.rowAccessRules.some(rule => rule.appliesTo.includes(previewAs) && rule.match === 'email') ? <label className="block max-w-sm text-sm text-ink-soft">Почта для проверки личных записей<input type="email" value={previewEmail} onChange={event => setPreviewEmail(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-sand-300 px-3 py-2 text-base" /></label> : null}
      {previewAs !== 'anonymous' && previewAs !== 'editor' && app.rowAccessRules.some(rule => rule.appliesTo.includes(previewAs) && rule.match === 'company') ? <label className="block max-w-sm text-sm text-ink-soft">Организация пользователя<input value={previewCompany} onChange={event => setPreviewCompany(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-sand-300 px-3 py-2 text-base" /></label> : null}
    </div>}
    deviceControls={<div className="flex flex-wrap gap-1">{DEVICES.filter(item => item !== 'tablet').map(item => <PreviewChip key={item} label={DEVICE_WORDS[item]} active={device === item} onClick={() => setDevice(item)}><span className="flex items-center lg:hidden"><ShellIcon name={item === 'mobile' ? 'phone' : 'desktop'} /></span><span className="hidden lg:inline">{DEVICE_WORDS[item]}</span></PreviewChip>)}</div>}
    preview={<div>{previewNotice}<div ref={setFrame} inert={previewBusy || Boolean(remoteError)} aria-busy={previewBusy} className={`mx-auto h-[36rem] w-full max-w-full overflow-hidden rounded-2xl border border-sand-300 bg-white ${previewBusy ? 'opacity-60' : ''}`} style={{ maxWidth: DEVICE_WIDTHS[device] }}>
      {remotePreview && !previewScreenReady ? <p className="p-6 text-sm text-ink-soft">Загружаем предпросмотр…</p> : shown.length ? <div className="origin-top-left overflow-hidden" style={{ width: deviceWidth, height: FRAME_HEIGHT / scale, transform: `scale(${scale})` }}><AppShell key={`${previewAs}-${previewScreenId}-${device}`} runtime={preview} viewer={null} initialScreenId={previewScreenId} editing demoBookingData={bookingData} initialFormValues={checkoutPreview && checkoutPreview.screenId === previewScreenId ? checkoutPreview.values : undefined} onPreviewCheckout={(id, rowId) => { const checkout = previewCheckout(app, id, rowId); if (checkout) { setCheckoutPreview(checkout); setPreviewAs(checkout.roleId); setScreenId(id) } }} /></div> : <p className="p-6 text-sm leading-6 text-ink-soft">Этой роли не открыт ни один экран. Выберите другую роль или настройте доступ.</p>}
    </div></div>}
  />

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[14rem_minmax(0,1fr)_24rem]">
      <div role="group" aria-label="Разделы полного конструктора" className="grid grid-cols-3 gap-1 rounded-full bg-sand-100 p-1 xl:hidden">{([['screens', 'Экраны'], ['settings', 'Настройки'], ['preview', 'Просмотр']] as const).map(([id, name]) => <button key={id} type="button" aria-pressed={builderPanel === id} aria-controls={`${builderId}-${id}`} onClick={() => setBuilderPanel(id)} className={`min-h-11 min-w-0 rounded-full px-2 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-500 ${builderPanel === id ? 'bg-white text-sage-700 shadow-soft' : 'text-ink-soft hover:bg-white/70'}`}>{name}</button>)}</div>
      <aside id={`${builderId}-screens`} aria-label="Экраны приложения" className={`${builderPanel === 'screens' ? 'block' : 'hidden'} min-w-0 space-y-2 xl:block`}>
        <h2 className="text-xs font-medium text-[var(--color-ink-muted)]">Экраны</h2>
        <div className="space-y-1">
          {screens.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setScreenId(item.id); setComponentId(null); setBuilderPanel('settings'); if (window.matchMedia?.('(max-width: 1279px)').matches) requestAnimationFrame(() => settingsHeading.current?.focus()) }}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${
                item.id === screen?.id ? 'bg-[var(--color-surface-muted)] font-medium' : 'hover:bg-[var(--color-surface-muted)]'
              }`}
            >
              <span className="truncate">{item.name}</span>
              <span className="shrink-0 text-xs text-[var(--color-ink-muted)]">
                {SCREEN_TYPE_LABELS[item.type]}
              </span>
            </button>
          ))}
        </div>

        <fieldset disabled={!canEdit || publishing} className="flex flex-wrap gap-1 pt-1">
          {(Object.keys(SCREEN_TYPE_LABELS) as ScreenType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => { addScreen(type); setBuilderPanel('settings') }}
              className="rounded border border-[var(--color-border-subtle)] px-2 py-1 text-xs hover:bg-[var(--color-surface-muted)]"
            >
              + {SCREEN_TYPE_LABELS[type]}
            </button>
          ))}
        </fieldset>

        {screen ? (
          <fieldset disabled={!canEdit || publishing} className="space-y-1 pt-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={app.homeScreenId === screen.id}
                onChange={(event) =>
                  update({ ...app, homeScreenId: event.target.checked ? screen.id : app.homeScreenId })
                }
              />
              Стартовый экран
            </label>
            <button
              type="button"
              onClick={() => removeScreen(screen.id)}
              className="w-full rounded px-2 py-1 text-left text-xs text-red-600 hover:bg-red-50"
            >
              Удалить экран
            </button>
          </fieldset>
        ) : null}
      </aside>

      <fieldset id={`${builderId}-settings`} disabled={!canEdit || publishing} aria-label="Настройки выбранного экрана" className={`${builderPanel === 'settings' ? 'block' : 'hidden'} min-w-0 space-y-4 xl:block`}>
        <div className="flex items-center justify-between gap-3"><h2 ref={settingsHeading} tabIndex={-1} className="rounded text-base font-semibold focus-visible:outline-2 focus-visible:outline-sage-400">{screen?.name ?? 'Настройки экрана'}</h2><button type="button" className="min-h-11 rounded-lg px-3 py-2 text-sm text-sage-700 underline underline-offset-4 xl:hidden" onClick={() => setBuilderPanel('screens')}>К экранам</button></div>
        {screen ? (
          <>
            <div className="rounded-xl border border-[var(--color-border-subtle)] p-3">
              <h2 className="mb-2 text-xs font-medium text-[var(--color-ink-muted)]">Настройки экрана</h2>
              <ScreenSettings
                app={app}
                screen={screen}
                screens={screens}
                tables={tables}
                views={views}
                fields={fields}
                onChange={replaceScreen}
              />
            </div>

            {screen.type === 'dashboard' ? (
              <div className="rounded-xl border border-[var(--color-border-subtle)] p-3">
                <h2 className="mb-2 text-xs font-medium text-[var(--color-ink-muted)]">Блоки сводки</h2>
                <DashboardEditor
                  metadataOnly={remotePreview}
                  app={app}
                  screen={screen}
                  views={views}
                  runtimeTables={runtimeTables}
                  onChange={replaceScreen}
                />
              </div>
            ) : (
            <div className="rounded-xl border border-[var(--color-border-subtle)] p-3">
              <h2 className="mb-2 text-xs font-medium text-[var(--color-ink-muted)]">
                Компоненты
                {screen.type === 'list' || screen.type === 'tiles'
                  ? ' — на списке не отображаются, вид строки задаётся выше'
                  : ''}
              </h2>

              <div className="space-y-1">
                {components.map((item, index) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 ${
                      item.id === componentId
                        ? 'border-sage-200 bg-sage-50'
                        : 'border-[var(--color-border-subtle)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setComponentId(item.id === componentId ? null : item.id)}
                      className="flex min-w-0 flex-1 items-baseline gap-2 text-left text-sm"
                    >
                      <span className="shrink-0">{COMPONENT_LABELS[item.type]}</span>
                      <span className="truncate text-xs text-[var(--color-ink-muted)]">
                        {describeComponent(item, fields)}
                      </span>
                    </button>
                    <button type="button" onClick={() => moveComponent(index, -1)} className="rounded px-1 text-xs hover:bg-black/5">↑</button>
                    <button type="button" onClick={() => moveComponent(index, 1)} className="rounded px-1 text-xs hover:bg-black/5">↓</button>
                    <button type="button" onClick={() => removeComponent(item.id)} className="rounded px-1 text-xs text-red-600 hover:bg-red-50">×</button>
                  </div>
                ))}
                {components.length === 0 ? (
                  <p className="py-2 text-sm text-[var(--color-ink-muted)]">Компонентов нет.</p>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {ADDABLE.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => addComponent(type)}
                    className="rounded border border-[var(--color-border-subtle)] px-2 py-1 text-xs hover:bg-[var(--color-surface-muted)]"
                  >
                    + {COMPONENT_LABELS[type]}
                  </button>
                ))}
              </div>

              {selected ? (
                <div className="mt-3 border-t border-[var(--color-border-subtle)] pt-3">
                  <h3 className="mb-2 text-xs font-medium text-[var(--color-ink-muted)]">
                    {COMPONENT_LABELS[selected.type]}
                  </h3>
                  <ComponentSettings
                    component={selected}
                    fields={fields}
                    screens={screens}
                    tableId={tableId ?? ''}
                    ownerFieldId={ownerFieldId}
                    onChange={(next) =>
                      replaceScreen({
                        ...screen,
                        components: screenComponents(screen).map((item) => (item.id === next.id ? next : item)),
                      } as Screen)
                    }
                  />

                  {/*
                    Кому положен компонент — рядом с его настройками: отсюда же
                    берётся право читать и писать поле, и разносить это
                    по разным местам нельзя.
                  */}
                  <div className="mt-2">
                    <ComponentAccess
                      app={app}
                      screen={screen}
                      component={selected}
                      onChange={(next) =>
                        replaceScreen({
                          ...screen,
                          components: screenComponents(screen).map((item) =>
                            item.id === next.id ? next : item,
                          ),
                        } as Screen)
                      }
                    />
                  </div>
                </div>
              ) : null}
            </div>
            )}
          </>
        ) : null}
      </fieldset>

      <aside id={`${builderId}-preview`} aria-label="Предпросмотр приложения" className={`${builderPanel === 'preview' ? 'block' : 'hidden'} min-w-0 space-y-2 xl:block`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-medium text-[var(--color-ink-muted)]">Предпросмотр</h2>
          <span
            className={`text-xs ${save.kind === 'error' ? 'text-red-600' : 'text-[var(--color-ink-muted)]'}`}
          >
            {save.kind === 'error' || save.kind === 'note' ? save.text : SAVE_WORDS[save.kind]}
          </span>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs text-[var(--color-ink-muted)]">Смотреть от имени</span>
          <div className="flex flex-wrap items-center gap-1">
            <PreviewChip active={previewAs === 'editor'} onClick={() => setPreviewAs('editor')}>
              Как автор
            </PreviewChip>
            <PreviewChip active={previewAs === 'anonymous'} onClick={() => setPreviewAs('anonymous')}>
              {ANONYMOUS_NAME}
            </PreviewChip>

            {/* Роли отделены чертой: «без входа» — не одна из них. */}
            <span aria-hidden className="mx-1 h-4 w-px bg-[var(--color-border-subtle)]" />

            {app.roles.map((role) => (
              <PreviewChip
                key={role.id}
                active={previewAs === role.id}
                onClick={() => setPreviewAs(role.id)}
              >
                {role.name}
              </PreviewChip>
            ))}
          </div>
        </div>

        {previewAs === 'anonymous' ? (
          <p className="text-xs text-[var(--color-ink-muted)]">
            Так приложение выглядит для того, кто открыл ссылку и не входил: только экраны
            с пометкой «Видно без входа» и только выбранные в них поля.
          </p>
        ) : previewAs !== 'editor' ? (
          <div className="space-y-2">
            <p className="text-xs text-[var(--color-ink-muted)]">Экраны роли «{roleName(app, previewAs)}». Для проверки своих записей укажите почту и, если правило использует её, организацию. Без почты ограниченные записи не показываются.</p>
            <label className="block text-xs text-[var(--color-ink-muted)]">Почта для проверки
              <input type="email" value={previewEmail} onChange={event => setPreviewEmail(event.target.value)} list="preview-people"
                className="mt-1 w-full rounded-lg border border-[var(--color-border-subtle)] px-2 py-1.5 text-sm" placeholder="client@example.ru" />
            </label>
            <datalist id="preview-people">{app.allowlist.filter(entry => entry.roleId === previewAs).map(entry => <option key={entry.email} value={entry.email} />)}</datalist>
            <label className="block text-xs text-[var(--color-ink-muted)]">Организация для проверки
              <input value={previewCompany} onChange={event => setPreviewCompany(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--color-border-subtle)] px-2 py-1.5 text-sm" />
            </label>
          </div>
        ) : null}

        <div role="group" aria-label="Устройство предпросмотра" className="flex flex-wrap gap-1">
          {DEVICES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={device === item}
              onClick={() => setDevice(item)}
              className={`min-h-11 rounded-lg px-3 py-2 text-sm transition-colors ${
                device === item
                  ? 'bg-[var(--color-surface-muted)] font-medium'
                  : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]'
              }`}
            >
              {DEVICE_WORDS[item]}
            </button>
          ))}
        </div>

        <div
          ref={setFrame}
          inert={previewBusy || Boolean(remoteError)}
          aria-busy={previewBusy}
          className="mx-auto h-[36rem] w-full overflow-hidden rounded-2xl border border-[var(--color-border-subtle)]"
          style={{ maxWidth: device === 'mobile' ? DEVICE_WIDTHS.mobile : undefined }}
        >
          {remotePreview && !previewScreenReady ? <p className="p-6 text-sm text-ink-soft">Загружаем предпросмотр…</p> : shown.length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-ink-muted)]">
              Этой роли не открыт ни один экран — в приложение она не попадёт.
            </p>
          ) : (
            <div
              className="origin-top-left overflow-hidden"
              style={{
                width: deviceWidth,
                height: FRAME_HEIGHT / scale,
                transform: `scale(${scale})`,
              }}
            >
              <AppShell
                key={`${previewAs}-${previewScreenId}-${device}`}
                runtime={preview}
                viewer={null}
                initialScreenId={previewScreenId}
                editing
                demoBookingData={bookingData}
              />
            </div>
          )}
        </div>
        {previewNotice}
        <p className="text-xs text-[var(--color-ink-muted)]">
          {device === 'mobile' ? 'Телефон: по ширине предпросмотра.' : `${DEVICE_WORDS[device]}: ширина ${DEVICE_WIDTH_WORDS[device]}${scale < 1 ? `, уменьшено до ${Math.round(scale * 100)}%` : ''}.`}
        </p>

        {portalUpgradeTableId && app.screens.some(screen => screen.type === 'form' && screen.mode === 'create' && screen.tableId === portalUpgradeTableId && screen.access.public && screen.access.roles.length === 0) && <div className="space-y-2 rounded-xl border border-sand-200 p-3">
          <p className="text-xs leading-relaxed text-ink-soft">Клиент сможет оставлять повторные заявки после входа. Почта подтверждается один раз, новые заявки получают статус «Принят». Изменения появятся после публикации черновика.</p>
          <button type="button" disabled={!canEdit || pending || save.kind === 'dirty' || save.kind === 'saving' || save.kind === 'error'}
            onClick={() => startTransition(async () => {
              const result = await enableRepeatRequestsAction(app.id, portalUpgradeTableId, app)
              if (!result.ok) { setSave({ kind: 'error', text: result.error }); return }
              resetSavedApp(result.app); setSave({ kind: 'note', text: 'Форма клиента обновлена. Проверьте предпросмотр и опубликуйте черновик.' }); router.refresh()
            })} className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm font-medium hover:bg-sand-100 disabled:opacity-40">Обновить форму клиента</button>
        </div>}
        {dispatchUpgradeTableId && <div className="space-y-2 rounded-xl border border-sand-200 p-3">
          {hasDispatchPreset(app, dispatchUpgradeTableId) ? <p className="text-xs leading-relaxed text-ink-soft">Мастер видит заявки, где «Почта мастера» совпадает с почтой входа. Добавьте мастеров и диспетчеров в список доступа. В старых заявках заполните почту вручную; в примерах замените адреса настоящими. Проверьте роли в предпросмотре перед публикацией.</p> : <>
            <p className="text-xs leading-relaxed text-ink-soft">Диспетчер увидит все заявки, мастер — только назначенные ему по почте. Мастер сможет менять статус, фото и комментарий. Настройка добавит два поля и разделит права в черновике. Старые заявки нужно назначить вручную; опубликованная версия продолжит работать до публикации.</p>
            <button type="button" disabled={!canEdit || pending || save.kind === 'dirty' || save.kind === 'saving' || save.kind === 'error'}
              onClick={() => startTransition(async () => {
                const result = await enableDispatchAction(app.id, dispatchUpgradeTableId, app)
                if (!result.ok) { setSave({ kind: 'error', text: result.error }); return }
                resetSavedApp(result.app); setSave({ kind: 'note', text: 'Роли настроены в черновике. Заполните почту мастеров и проверьте предпросмотр перед публикацией.' }); router.refresh()
              })}
              className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm font-medium hover:bg-sand-100 disabled:opacity-40">Настроить роли заявок</button>
          </>}
        </div>}
        {inventoryUpgradeTableId && !app.inventory && <div className="space-y-2 rounded-xl border border-sand-200 p-3">
          <p className="text-xs leading-relaxed text-ink-soft">Подключите приёмку, выдачу, списания, возвраты и инвентаризацию. Текущие остатки сохранятся как начальные. После настройки проверьте роли и опубликуйте черновик.</p>
          <button type="button" disabled={!canEdit || pending || save.kind === 'dirty' || save.kind === 'saving' || save.kind === 'error'}
            onClick={() => startTransition(async () => {
              const result = await enableInventoryAction(app.id, inventoryUpgradeTableId)
              if (!result.ok) { setSave({ kind: 'error', text: result.error }); return }
              resetSavedApp(result.app); setSave({ kind: 'note', text: 'Складской учёт настроен. Проверьте предпросмотр и опубликуйте черновик.' }); router.refresh()
            })}
            className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm font-medium hover:bg-sand-100 disabled:opacity-40">Подключить складской учёт</button>
        </div>}
        {app.inventory && !app.inventory.operations && <div className="space-y-2 rounded-xl border border-sand-200 p-3">
          <p className="text-xs leading-relaxed text-ink-soft">Добавьте выдачу, списания, возвраты и инвентаризацию. Остатки и приёмки сохранятся. Новые действия появятся после публикации черновика.</p>
          <button type="button" disabled={!canEdit || pending || save.kind === 'dirty' || save.kind === 'saving' || save.kind === 'error'}
            onClick={() => startTransition(async () => {
              const result = await enableStockOperationsAction(app.id, app)
              if (!result.ok) { setSave({ kind: 'error', text: result.error }); return }
              resetSavedApp(result.app); setSave({ kind: 'note', text: 'Операции добавлены в черновик. Проверьте роли и опубликуйте его.' }); router.refresh()
            })} className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm font-medium hover:bg-sand-100 disabled:opacity-40">Подключить складские операции</button>
        </div>}
        <button
          type="button"
          disabled={!canEdit || pending}
          onClick={() =>
            startTransition(async () => {
              setPublishing(true)
              if (timer.current) { clearTimeout(timer.current); timer.current = null }
              try {
                const saved = await saveDraft()
                if (!saved.ok) return
                const result = await publishAppAction(app.id, draftQueue.current())
                setSave(result.ok ? { kind: 'note', text: 'Опубликовано' } : { kind: 'error', text: result.error })
              } catch { setSave({ kind: 'error', text: 'Не удалось подтвердить публикацию. Проверьте соединение и повторите публикацию.' }) }
              finally { setPublishing(false) }
            })
          }
          className="w-full rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-40"
        >
          {publishing ? 'Сохраняем и публикуем…' : publishedAt ? 'Опубликовать заново' : 'Опубликовать'}
        </button>
        {canEdit && save.kind === 'error' ? <button type="button" disabled={pending} onClick={() => startTransition(async () => { await saveDraft() })} className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm disabled:opacity-40">Повторить сохранение черновика</button> : null}
        <p className="text-xs text-[var(--color-ink-muted)]">
          Предпросмотр показывает черновик. Пользователи увидят изменения после публикации.
        </p>
      </aside>
    </div>
  )
}

/** Компоненты экрана: у сводки их нет, у остальных — свои. */
function screenComponents(screen: Screen | undefined): Component[] {
  if (!screen || screen.type === 'dashboard') return []
  return screen.components
}
