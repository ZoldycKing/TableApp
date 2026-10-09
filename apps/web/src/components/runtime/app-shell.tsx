'use client'

import type { Action, Screen } from '@tableapp/schema'
import { visibleFields } from '@/lib/apply-view'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { signOutAppAction } from '@/app/auth-actions'
import { saveMovementAction, saveProductionAction } from '@/app/production-actions'
import { InventoryReceipt } from './inventory-receipt'
import { BookingForm } from './booking-form'
import { BookingSetup } from './booking-setup'
import { cancelBookingAction } from '@/app/booking-actions'
import { dateInstant, fieldTimeZone } from '@tableapp/schema'
import type { BookingData } from '@/lib/booking'
import { canCompleteBooking } from '@/lib/booking-lifecycle'
import { inventoryOperation } from '@/lib/inventory'
import { useLiveApp } from '@/lib/use-live-app'
import { appCreateRowAction, appDeleteRowAction, appUpdateRowAction } from '@/app/runtime-actions'
import type { RuntimeApp } from '@/lib/app-runtime'
import type { TableRow } from '@/lib/table-store'
import { resolveBindingValue, type Viewer } from './bindings'
import { formatCell } from '@/lib/format'
import { Icon, hasIcon } from './icons'
import { EmptyState } from './ui'
import { accentTones, Avatar, greeting, viewerName } from './ui'
import { ScreenView } from './screen-view'
import { useEnterMotion } from '@/components/motion/enter-motion'
import {
  EMPTY_LIST_STATE as EMPTY_LIST,
  navFromHistory,
  navFromSearch,
  navSearch,
  withNav,
  type ListState as ListStateType,
  type NavEntry as NavEntryType,
  type NavState,
} from './nav-history'
import { IntakeVerify } from './intake-verify'
import {
  ConsumptionPanel,
  describeMovement,
  describeSaved,
  movementInputFrom,
  runInputFrom,
  useConsumption,
  useRowId,
} from './production-form'

/** Показ на сайте: экраны настоящие, записи не идут. Ответ один на все действия. */
const DEMO_NOTE = 'Это демонстрация: изменения не сохраняются. В своём приложении кнопка сработает.'

/** Иконка по типу экрана: список, витрина и форма должны отличаться в меню. */
function iconByType(screen: Screen): string {
  if (screen.type === 'tiles') return 'grid'
  if (screen.type === 'form') return 'plus'
  if (screen.type === 'detail') return 'file'
  return 'list'
}

/**
 * Иконка вкладки.
 *
 * «list» — это умолчание конструктора, а не выбор человека: с ним все вкладки
 * в меню выглядели одинаково. Поэтому своей считаем только иконку, отличную
 * от умолчания, а иначе берём по типу экрана.
 */
function tabIcon(screen: Screen): string {
  const named = screen.tab?.icon ?? ''
  if (named && named !== 'list' && hasIcon(named)) return named
  return iconByType(screen)
}

/**
 * «Отправлено».
 *
 * Показывается там, где после отправки идти некуда: у гостя с одной формой
 * других экранов нет. Без этого он видит ту же пустую форму и не понимает,
 * сработало ли, — а заявка уже принята.
 */
function Sent({
  text,
  label,
  accent,
  onAgain,
}: {
  text: string
  label: string
  accent: { solid: string; text: string; soft: string; ring: string }
  onAgain: () => void
}) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-sand-200 bg-white p-8 text-center shadow-soft">
      <span
        className={`mx-auto flex size-12 items-center justify-center rounded-full ${accent.soft} ${accent.text}`}
      >
        <Icon name="check" className="size-6" />
      </span>
      <h2 className="mt-4 font-display text-xl font-bold tracking-tight">Отправлено</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{text}</p>
      <button
        type="button"
        onClick={onAgain}
        className="mt-5 rounded-xl border border-sand-300 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-sand-50"
      >
        {label}
      </button>
    </div>
  )
}

/*
 * Где человек находится и что выбрал в списках, живёт в `nav-history`:
 * это же состояние кладётся в историю браузера, и держать его описание
 * в двух местах значит однажды разойтись.
 *
 * Отбор списка живёт в оболочке, а не в самом списке, и это важно. Список
 * размонтируется каждый раз, когда открывают карточку, — со своим состоянием
 * внутри он терял бы отбор на каждом «назад», и человек, разбиравший заказы
 * «в работе», возвращался бы к полному списку после каждой записи.
 */
export type { NavEntry, ListState } from './nav-history'
export { EMPTY_LIST_STATE } from './nav-history'

export function AppShell({
  runtime,
  viewer,
  canSignIn = false,
  demo = false,
  initialScreenId,
  editing = false,
  browserHistory = false,
  demoBookingData,
}: {
  runtime: RuntimeApp
  viewer: Viewer
  /** Есть ли гостю смысл входить: закрытые для него экраны в приложении есть. */
  canSignIn?: boolean
  /**
   * Показ на сайте: экраны настоящие и данные настоящие, но записи не идут.
   * Иначе демонстрация на главной странице собирала бы чужие заявки
   * в рабочее пространство.
   */
  demo?: boolean
  /** Конструктору нужно открыть предпросмотр сразу на редактируемом экране. */
  initialScreenId?: string
  /** Предпросмотр в конструкторе: владельцу видно, какой блок нужно настроить. */
  editing?: boolean
  /**
   * Вести историю браузера: «Назад» ходит по экранам приложения.
   *
   * По умолчанию выключено, и это не осторожность ради осторожности.
   * Оболочка стоит ещё в двух местах — в показе на сайте и в предпросмотре
   * конструктора, — и там она живёт внутри чужой страницы. Записывать оттуда
   * в историю значит отнять «Назад» у самой страницы: человек, листавший
   * витрину продукта, нажал бы его и остался на месте.
   */
  browserHistory?: boolean
  /** Sanitized availability metadata for synthetic template previews only. */
  demoBookingData?: BookingData
}) {
  const { app } = runtime
  useLiveApp(app.slug, !demo && !editing)
  const screens = useMemo(() => new Map(app.screens.map((screen) => [screen.id, screen])), [app.screens])
  const tabs = app.screens.filter((screen) => screen.tab !== null)

  /*
   * Домашний экран может быть закрыт этой роли — тогда его в приложении нет,
   * и начинать надо с того, что ей доступно. Иначе гость, которому открыта
   * одна форма, упирался в «экран не найден».
   */
  const known = (id: string | null | undefined) =>
    id && app.screens.some((item) => item.id === id) ? id : null
  const home = known(initialScreenId) ?? known(app.homeScreenId) ?? tabs[0]?.id ?? app.screens[0]?.id ?? ''

  /*
   * Начинаем с домашнего экрана — и на сервере, и в браузере.
   *
   * Адрес разбирается **после** первого рендера, а не во время. Иначе сервер
   * рисует домашний экран (адреса он не знает), браузер сразу рисует тот,
   * что в адресе, разметка расходится, и React выбрасывает всё поддерево
   * и собирает заново. Один лишний кадр честнее сломанной гидрации.
   */
  const [stack, setStack] = useState<NavEntryType[]>([{ screenId: home, rowId: null }])
  /** Отбор по каждому списку отдельно: у заказов и у позиций он свой. */
  const [listStates, setListStates] = useState<Record<string, ListStateType>>({})
  const [error, setError] = useState<string | null>(null)
  /**
   * Подтверждение после отправки, когда идти некуда.
   *
   * Гость, оставивший заявку, других экранов не имеет: показать ему ту же
   * пустую форму — значит не ответить ничего. Человек решит, что не нажалось,
   * и отправит второй раз.
   */
  const [sent, setSent] = useState<string | null>(null)
  /**
   * Заявка не вошедшего, ждущая подтверждения почты.
   *
   * Записи пока нет: человек заполнил форму, и следующим шагом доказывает,
   * что почта его. Держим здесь, а не внутри формы, чтобы возврат к форме
   * не терял введённое.
   */
  const [intake, setIntake] = useState<{ screenId: string; values: Record<string, unknown> } | null>(
    null,
  )
  const [pending, startTransition] = useTransition()
  const [moreTabs, setMoreTabs] = useState(false)
  const [confirmCancellation, setConfirmCancellation] = useState(false)
  const [bookingDraft, setBookingDraft] = useState<Record<string, unknown> | null>(null)
  const [formDraft, setFormDraft] = useState<{ screenId: string; values: Record<string, unknown> } | null>(null)
  const [now, setNow] = useState(() => runtime.loadedAt ?? Date.now())
  const hasBooking = Boolean(app.booking)
  useEffect(() => {
    if (!hasBooking) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [hasBooking])
  const router = useRouter()

  const current = stack[stack.length - 1]!
  useEffect(() => { setMoreTabs(false); setConfirmCancellation(false) }, [current.screenId, current.rowId])
  const contentRef = useEnterMotion(`${current.screenId}:${current.rowId ?? ''}:${sent === null ? 'screen' : 'sent'}:${intake === null ? 'form' : 'verify'}`)
  const screen = screens.get(current.screenId)
  const accent = accentTones(app.theme.accent)

  /** Таблица экрана: у списка она берётся из представления, у остальных задана прямо. */
  const tableOf = (candidate: Screen | undefined): string | null => {
    if (!candidate) return null
    if (candidate.type === 'list' || candidate.type === 'tiles') {
      return runtime.views[candidate.source.viewId]?.tableId ?? null
    }
    // У сводки своей таблицы нет: каждый её блок сам знает, откуда берёт строки.
    if (candidate.type === 'dashboard') return null
    return candidate.tableId
  }

  const tableId = tableOf(screen)
  const table = tableId ? runtime.tables[tableId] : undefined
  const row = current.rowId ? (table?.rows.find((item) => item.id === current.rowId) ?? null) : null
  const bookingDateField = app.booking ? table?.fields.find(field => field.id === app.booking!.visit.start) : undefined

  /**
   * Переход: меняем состояние и тем же движением записываем его в историю.
   *
   * Одно место на все переходы намеренно. Пока запись в историю была бы
   * отдельным шагом, рано или поздно появился бы переход, который его забыл, —
   * и «Назад» уводил бы человека не туда, причём заметил бы это не он,
   * а тот, кому он не смог объяснить, куда делся его заказ.
   */
  const go = (next: NavState, mode: 'push' | 'replace') => {
    setStack(next.stack)
    setListStates(next.lists)
    if (!browserHistory || typeof window === 'undefined') return

    const entry = next.stack[next.stack.length - 1]!
    const url = `${window.location.pathname}${navSearch(entry, home)}`
    // Pass our own state: Next copies its metadata and synchronizes the canonical URL.
    // Reusing Next's marked state bypasses that synchronization and refresh resets navigation.
    const state = withNav(null, next)
    if (mode === 'push') window.history.pushState(state, '', url)
    else window.history.replaceState(state, '', url)
  }

  const navigate = (screenId: string, rowId: string | null = current.rowId) => {
    if (!screens.has(screenId)) return
    setSent(null)
    go({ stack: [...stack, { screenId, rowId }], lists: listStates }, 'push')
  }

  /**
   * Назад — это ровно то же самое, что кнопка браузера.
   *
   * Не «похоже на то же самое»: стрелка в шапке просит браузер вернуться,
   * а состояние восстанавливает обработчик `popstate`. Иначе у человека
   * было бы два разных «назад» с расходящейся памятью — стрелка возвращала бы
   * на экран, а кнопка браузера уводила бы с приложения.
   */
  const goBack = () => {
    setSent(null)
    if (stack.length <= 1) return
    if (browserHistory && typeof window !== 'undefined') {
      window.history.back()
      return
    }
    go({ stack: stack.slice(0, -1), lists: listStates }, 'push')
  }

  /**
   * Переход на экран верхнего уровня.
   *
   * `filter` приходит с доски статусов: нажатие на колонку должно открывать
   * список этой колонкой, а не сбрасывать человека в общий перечень.
   */
  const openTab = (screenId: string, filter?: Partial<ListStateType>) => {
    setError(null)
    setSent(null)
    const lists = filter
      ? { ...listStates, [screenId]: { ...EMPTY_LIST, ...filter } }
      : listStates
    go({ stack: [{ screenId, rowId: null }], lists }, 'push')
  }

  /**
   * Отбор списка меняем в текущей записи истории, а не добавляем новую.
   *
   * Иначе каждая буква в поиске становилась бы шагом назад, и человек,
   * набравший «ромашка», выбирался бы из приложения семью нажатиями.
   * А записать надо: «Назад» из карточки должен вернуть список таким,
   * каким человек его оставил.
   */
  const setListState = (screenId: string, next: ListStateType) => {
    go({ stack, lists: { ...listStates, [screenId]: next } }, 'replace')
  }

  /*
   * Открытая заново страница показывает тот же экран, а не начинается сначала.
   *
   * Под глубокой ссылкой оставляем домашний экран — и в памяти, и отдельной
   * записью истории: человек, которому прислали карточку заказа, должен иметь
   * куда вернуться. Иначе он видит одну запись и ни стрелки назад, ни способа
   * попасть в само приложение.
   *
   * Первая запись истории — наша всегда: без этого возврат на неё пришёл бы
   * с чужим состоянием и восстанавливать было бы нечего.
   */
  useEffect(() => {
    if (!browserHistory) return
    const path = window.location.pathname
    // Адрес читаем до первой записи в историю: она его же и перепишет.
    const search = window.location.search
    const start = { screenId: home, rowId: null }
    const prior = navFromHistory(window.history.state, (id) => screens.has(id))
    const entry = navFromSearch(search, (id) => screens.has(id))
    const last = prior?.stack.at(-1)
    if (prior && last?.screenId === (entry?.screenId ?? home) && last.rowId === (entry?.rowId ?? null)) {
      setStack(prior.stack); setListStates(prior.lists)
      return
    }
    const write = (entries: NavEntryType[], mode: 'push' | 'replace') => {
      const state = withNav(null, { stack: entries, lists: {} })
      const url = `${path}${navSearch(entries[entries.length - 1]!, home)}`
      if (mode === 'push') window.history.pushState(state, '', url)
      else window.history.replaceState(state, '', url)
    }

    write([start], 'replace')

    if (!entry || (entry.screenId === home && entry.rowId === null)) return

    const deep = [start, entry]
    setStack(deep)
    write(deep, 'push')
    // Только при появлении оболочки: дальше историю ведёт `go`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserHistory])

  useEffect(() => {
    if (!browserHistory) return
    const onPop = (event: PopStateEvent) => {
      const restored = navFromHistory(event.state, (id) => screens.has(id))
      // Чужая запись или состояние от прошлой версии приложения: не трогаем.
      // Человек останется там, где стоял, а не провалится на пустой экран.
      if (!restored) return
      setStack(restored.stack)
      setListStates(restored.lists)
      setSent(null)
      setIntake(null)
      setError(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [browserHistory, screens])

  const previousRuntime = useRef(runtime)
  useEffect(() => {
    if (previousRuntime.current === runtime) return
    previousRuntime.current = runtime
    if (!browserHistory) return
    const entry = navFromSearch(window.location.search, id => screens.has(id))
    if ((entry?.screenId ?? home) !== current.screenId || (entry?.rowId ?? null) !== current.rowId) return
    // Next refresh replaces custom history state. Restore navigation and the
    // saved confirmation from React state once the refreshed data commits.
    window.history.replaceState(withNav(null, { stack, lists: listStates }), '', `${window.location.pathname}${navSearch(current, home)}`)
  }, [runtime, browserHistory, screens, home, current, stack, listStates])

  const runMutation = (work: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null)
    if (demo || editing) {
      setError(DEMO_NOTE)
      return
    }
    startTransition(async () => {
      const result = await work()
      if (!result.ok) return setError(result.error ?? 'Не удалось выполнить действие')
      router.refresh()
      after?.()
    })
  }

  const handleAction = (action: Action) => {
    switch (action.type) {
      case 'open_screen': {
        const target = screens.get(action.screenId)
        if (target?.type === 'form' && target.mode === 'create') {
          const editable = new Set(target.components.flatMap(component => component.type === 'form_field' ? [component.fieldId] : []))
          setFormDraft({ screenId: target.id, values: Object.fromEntries(Object.entries(action.initialValues ?? {})
            .filter(([fieldId]) => editable.has(fieldId)).map(([fieldId, binding]) => [fieldId, resolveBindingValue(binding, row, viewer)])) })
          if (target.id === app.booking?.formScreenId) {
            setBookingDraft(screen?.type === 'detail' && screen.tableId === app.booking.tables.services && row
              ? { [app.booking.visit.service]: [row.id] } : null)
          }
          return navigate(action.screenId, action.initialValues || target.id === app.booking?.formScreenId ? null : current.rowId)
        }
        return navigate(action.screenId)
      }
      case 'go_back':
        return goBack()
      case 'open_url': {
        const url = String(resolveBindingValue(action.source, row, viewer) ?? '')
        if (url) window.open(url, '_blank', 'noopener,noreferrer')
        return
      }
      case 'call_phone': {
        const phone = String(resolveBindingValue(action.source, row, viewer) ?? '')
        if (phone) window.location.href = `tel:${phone.replace(/[^+\d]/g, '')}`
        return
      }
      case 'send_email': {
        const email = String(resolveBindingValue(action.source, row, viewer) ?? '')
        if (email) window.location.href = `mailto:${email}`
        return
      }
      case 'create_row': {
        const values = Object.fromEntries(
          Object.entries(action.values).map(([fieldId, binding]) => [
            fieldId,
            resolveBindingValue(binding, row, viewer),
          ]),
        )
        return runMutation(() => appCreateRowAction(app.slug, action.tableId, values), goBack)
      }
      case 'update_row': {
        if (!row || !tableId) return
        const values = Object.fromEntries(
          Object.entries(action.values).map(([fieldId, binding]) => [
            fieldId,
            resolveBindingValue(binding, row, viewer),
          ]),
        )
        return runMutation(() => appUpdateRowAction(app.slug, tableId, row.id, values, row.version))
      }
      case 'delete_row': {
        if (!row || !tableId) return
        if (action.confirm && !window.confirm('Удалить запись?')) return
        return runMutation(() => appDeleteRowAction(app.slug, tableId, row.id, row.version), goBack)
      }
    }
  }

  const collection = useMemo(() => {
    if (!screen || (screen.type !== 'list' && screen.type !== 'tiles') || !table) return null
    const view = runtime.views[screen.source.viewId]
    if (!view) return null

    /*
     * Отбор и порядок пришли с сервера готовыми — здесь их не пересчитывают.
     *
     * Так не только быстрее. Раньше правило отбора применялось тут, а значит
     * строки, которые владелец из списка убрал, всё равно лежали в памяти
     * страницы, и колонки, по которым шёл отбор, приходилось отдавать вместе
     * с ними. Теперь сервер присылает список идентификаторов, и решать
     * устройству нечего.
     */
    const byId = new Map(table.rows.map((row) => [row.id, row]))
    const rows = (runtime.screens[screen.id]?.rowIds ?? [])
      .map((id) => byId.get(id))
      .filter((row): row is TableRow => row !== undefined)

    return { rows, shownFields: visibleFields(table.fields, view.config) }
  }, [screen, table, runtime.views, runtime.screens])

  /*
   * Производственный учёт: форма выпуска и форма движения склада сохраняются
   * своими действиями, а не общим «создать строку». Общее записало бы выпуск
   * без списаний и приход без изменения остатка — и то и другое с виду
   * успешно, а замечают это через месяц, когда материал кончается раньше
   * срока.
   */
  const production = app.production
  const isRunForm = Boolean(production && screen?.id === production.formScreenId)
  const isMovementForm = Boolean(production && screen?.id === production.movementScreenId)
  /** Что сейчас в форме: по этому считается предпросмотр расхода. */
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const onFormValues = useCallback((values: Record<string, unknown>) => setFormValues(values), [])
  const { preview, loading: previewing } = useConsumption(
    app.slug,
    production,
    formValues,
    isRunForm && !demo,
  )
  /*
   * Идентификатор строки выпуска выдаётся на устройстве и живёт до успешного
   * сохранения. Он же защита от двойного нажатия: второй запрос приходит
   * с тем же идентификатором, и вторая строка не появляется. Без этого
   * двойное нажатие списало бы материалы дважды.
   */
  const runId = useRowId()
  const screenId = screen?.id
  useEffect(() => {
    setFormValues({})
  }, [screenId])

  const saveProduction = (values: Record<string, unknown>) => {
    if (!production) return
    setError(null)
    if (demo) return setError(DEMO_NOTE)
    startTransition(async () => {
      const result = await saveProductionAction(
        app.slug,
        runInputFrom(production, values, runId.get()),
      )
      if (!result.ok) return setError(result.error)
      // Строка создана: следующий выпуск — новая строка, новый идентификатор.
      runId.reset()
      router.refresh()
      setSent(describeSaved(result))
    })
  }

  const saveMovement = (values: Record<string, unknown>) => {
    if (!production) return
    setError(null)
    if (demo) return setError(DEMO_NOTE)
    startTransition(async () => {
      const result = await saveMovementAction(
        app.slug,
        movementInputFrom(production, values, runId.get()),
      )
      if (!result.ok) return setError(result.error)
      runId.reset()
      router.refresh()
      setSent(describeMovement(result))
    })
  }

  if (!screen) {
    return (
      <div className="flex h-full items-center justify-center bg-sand-50 p-6">
        <EmptyState
          icon="grid"
          title="Экран не найден"
          hint="Возможно, приложение опубликовано не полностью или этот экран удалили."
        />
      </div>
    )
  }

  const isHome = stack.length === 1 && stack[0]?.screenId === (app.homeScreenId ?? tabs[0]?.id)

  /*
   * Заголовок карточки — название самой записи, а не слово «Карточка».
   * Человек открыл конкретный заказ, и шапка должна говорить, какой именно:
   * иначе по ней не отличить один открытый заказ от другого.
   */
  const heading = (() => {
    if (screen.type !== 'detail' || !row || !table) return screen.name
    if (app.booking?.tables.visits === screen.tableId && app.screens.some(s => s.id === app.homeScreenId)) {
      const ids = row.data[app.booking.visit.service]
      const title = Array.isArray(ids) ? runtime.relatedTitles[app.booking.tables.services]?.find(item => item.id === ids[0])?.title : null
      if (title) return title
    }
    const titleField =
      table.fields.find((field) => field.id === table.primaryFieldId) ?? table.fields[0]
    const title = titleField ? formatCell(titleField, row.data[titleField.id]) : ''
    return title || screen.name
  })()

  const signIn = canSignIn ? (
    <a
      href="?login=1"
      className="inline-flex items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-ink/25 hover:text-ink"
    >
      Войти
    </a>
  ) : null

  const signOut = viewer ? (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await signOutAppAction()
          window.location.reload()
        })
      }
      className="rounded-lg px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-sand-100 hover:text-ink disabled:opacity-40"
    >
      Выйти
    </button>
  ) : null

  return (
    /*
     * Одно приложение — два вида. На телефоне это экран с нижними вкладками,
     * на компьютере — боковое меню и широкая рабочая область: те же экраны,
     * но телефонная раскладка на мониторе выглядит потерянной полосой
     * посередине, а десктопная на телефоне не помещается вовсе.
     */
    /*
     * Разметка зависит от ширины места, куда приложение вставили, а не от
     * ширины окна. Иначе в предпросмотре конструктора — коробке в 384 точки
     * на большом мониторе — включалось боковое меню и съедало почти всё,
     * оставляя списку полосу в две буквы.
     */
    <div className="@container flex h-full bg-sand-50">
      {tabs.length > 1 ? (
        <aside className="hidden w-64 shrink-0 flex-col border-r border-sand-200 bg-white @min-[860px]:flex">
          <div className="flex items-center gap-2.5 px-4 py-4">
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white ${accent.solid}`}
            >
              {app.name.trim().charAt(0).toUpperCase() || 'A'}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-sm font-bold tracking-tight">{app.name}</span>
              {viewer ? (
                <span className="block truncate text-[11px] text-ink-muted">{viewer.email}</span>
              ) : null}
            </span>
          </div>

          <nav className="flex-1 space-y-0.5 px-2 pb-2">
            {tabs.map((tab) => {
              const active = stack[0]?.screenId === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => openTab(tab.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                    active
                      ? `${accent.soft} font-medium ${accent.text}`
                      : 'text-ink-soft hover:bg-sand-50 hover:text-ink'
                  }`}
                >
                  <Icon name={tabIcon(tab)} className="size-5 shrink-0" />
                  <span className="truncate">{tab.tab?.label ?? tab.name}</span>
                </button>
              )
            })}
          </nav>

          {viewer ? (
            <div className="flex items-center gap-2 border-t border-sand-200 px-3 py-3">
              <Avatar name={viewer.name} email={viewer.email} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {viewerName(viewer.name, viewer.email)}
                </span>
                <span className="block truncate text-[11px] text-ink-muted">{viewer.email}</span>
              </span>
              {signOut}
            </div>
          ) : null}
          {signIn ? <div className="border-t border-sand-200 p-3">{signIn}</div> : null}
        </aside>
      ) : null}

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-sand-200 bg-white/90 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
            {stack.length > 1 ? (
              <button
                type="button"
                onClick={goBack}
                aria-label="Назад"
                className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-sand-100 hover:text-ink"
              >
                <Icon name="back" className="size-5" />
              </button>
            ) : null}

            <div className="min-w-0 flex-1">
              {/*
               * На домашнем экране здороваемся по имени: приложение открывают
               * каждый день, и первая строка не должна быть безличной.
               */}
              {isHome && viewer ? (
                <p className="truncate text-[11px] uppercase tracking-wide text-ink-muted">
                  {greeting()}, {viewerName(viewer.name, viewer.email)}
                </p>
              ) : null}
              {/*
                В самом приложении это главный заголовок страницы. В показе
                на сайте и в предпросмотре конструктора приложение встроено
                в чужую страницу, у которой свой единственный H1, — там
                заголовок становится подзаголовком.
              */}
              {demo || editing ? (
                <h2 className="truncate font-display text-lg font-bold tracking-tight">{heading}</h2>
              ) : (
                <h1 className="truncate font-display text-lg font-bold tracking-tight">{heading}</h1>
              )}
            </div>

            {pending ? (
              <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-sand-300 border-t-ink/60" />
            ) : null}
            {viewer ? (
              <span className="shrink-0 @min-[860px]:hidden">
                <Avatar name={viewer.name} email={viewer.email} size="s" />
              </span>
            ) : null}
            {signIn ? <span className="shrink-0 @min-[860px]:hidden">{signIn}</span> : null}
          </div>
        </header>

        {error ? (
          <p className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:px-6">
            {error}
          </p>
        ) : null}

        {/*
         * Прокрутка только вдоль: поперёк приложению разъезжаться нечем, и
         * полоса внизу означала бы, что вылезла карточка, а не что так задумано.
         */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div ref={contentRef} className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
            {sent !== null ? (
              <Sent
                text={sent}
                accent={accent}
                label="Заполнить ещё раз"
                onAgain={() => {
                  setSent(null)
                  setFormValues({})
                }}
              />
            ) : intake !== null ? (
              <IntakeVerify
                slug={app.slug}
                screenId={intake.screenId}
                values={intake.values}
                accent={accent}
                booking={Boolean(app.booking && intake.screenId === app.booking.formScreenId)}
                onCancel={() => { setIntake(null); router.refresh() }}
                onDone={() => {
                  setIntake(null)
                  setBookingDraft(null)
                  // Кабинет только что появился: приложение надо перечитать,
                  // иначе человек останется на витрине без своих заявок.
                  router.refresh()
                  setSent(
                    (screen.type === 'form' && screen.successText) ||
                      'Заявка принята. Она уже в вашем кабинете.',
                  )
                }}
              />
            ) : (
            app.booking && screen.id === app.booking.rescheduleScreenId && !row ? <EmptyState title="Запись недоступна" hint="Откройте предстоящую запись из своего списка и выберите «Перенести запись»." /> :
            app.booking && screen.id === app.booking.setupScreenId ? <BookingSetup runtime={runtime} demo={demo || editing} onSaved={() => router.refresh()} /> :
            app.booking && [app.booking.formScreenId, app.booking.rescheduleScreenId].includes(screen.id) ? <BookingForm key={`${screen.id}:${row?.id ?? ''}`} runtime={runtime}
              row={screen.id === app.booking.rescheduleScreenId ? row : null} demo={demo || editing} demoData={demo ? demoBookingData : undefined} pending={pending} initialValues={bookingDraft} onSubmit={values => {
                if (screen.id === app.booking!.rescheduleScreenId && row) {
                  runMutation(() => appUpdateRowAction(app.slug, app.booking!.tables.visits, row.id, values, row.version), goBack)
                } else if (viewer === null && !demo && !editing) { setBookingDraft(values); setError(null); setIntake({ screenId: screen.id, values }) }
                else runMutation(() => appCreateRowAction(app.slug, app.booking!.tables.visits, values), () => { setBookingDraft(null); openTab(home) })
              }} /> :
            app.inventory && inventoryOperation(app.inventory, screen.id) ? <InventoryReceipt key={`${screen.id}:${current.rowId}`} runtime={runtime}
              operation={inventoryOperation(app.inventory, screen.id)!} itemId={current.rowId} config={app.inventory} demo={demo || editing}
              confirmation={current.receipt} onSaved={receipt => go({ stack: [...stack.slice(0, -1), { ...current, receipt }], lists: listStates }, 'replace')}
              onBack={() => openTab(app.homeScreenId ?? home)} /> : <ScreenView
              screen={screen}
              table={table}
              row={row}
              collection={collection}
              viewer={viewer}
              accent={app.theme.accent}
              relatedTitles={runtime.relatedTitles}
              runtime={runtime}
              editing={editing}
              initialValues={formDraft?.screenId === screen.id ? formDraft.values : undefined}
              now={now}
              listState={listStates[screen.id] ?? EMPTY_LIST}
              onListState={(next) => setListState(screen.id, next)}
              /*
               * Кнопки выгрузки нет у не вошедшего: посторонний на витрине
               * ничего своего не забирает. Нет её и в показе на сайте
               * и в предпросмотре конструктора — там строки ненастоящие
               * или чужие, и файл с ними был бы обманом.
               */
              exportHref={
                demo || editing || !viewer
                  ? null
                  : `/a/${app.slug}/export?e=${encodeURIComponent(screen.id)}`
              }
              onOpenRow={(screenId, rowId) => navigate(screenId, rowId)}
              onOpenScreen={(screenId, filter) => openTab(screenId, filter)}
              onAction={handleAction}
              onValues={isRunForm ? onFormValues : undefined}
              formNotice={
                demo ? (
                  /*
                   * В показе на сайте форма обещает ответ на почту — он написан
                   * в самом приложении и там правдив. Здесь записи не создаются
                   * и писем не уходит, и сказать об этом нужно до отправки,
                   * а не после.
                   */
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
                    Это демонстрация. Поля можно заполнить и нажать кнопку, но заявка
                    не сохранится и письмо не придёт — текст ниже описывает, как форма
                    работает в вашем приложении.
                  </p>
                ) : null
              }
              formSlot={
                isRunForm ? <><p className="text-xs leading-relaxed text-ink-muted">В «Произведено» укажите только годные изделия. Брак записывается отдельно и не входит в это количество.</p><ConsumptionPanel preview={preview} loading={previewing} /></> : null
              }
              onSubmit={(values, mode, baseVersion) => {
                // Выпуск и движение склада пишутся своими действиями: одной
                // транзакцией на несколько таблиц, чего общий путь не умеет.
                if (mode === 'create' && isRunForm) return saveProduction(values)
                if (mode === 'create' && isMovementForm) return saveMovement(values)
                if (!tableId) return
                if (mode === 'create') {
                  /*
                   * Не вошедший не пишет напрямую: сначала он подтверждает
                   * почту, и только после этого заявка ложится строкой — уже
                   * от его имени, в его кабинет. В показе на сайте этого шага
                   * нет, потому что там и записи нет.
                   */
                  if (viewer === null && !demo) {
                    setError(null)
                    setIntake({ screenId: screen.id, values })
                    return
                  }
                  runMutation(() => appCreateRowAction(app.slug, tableId, values), () => {
                    if (screen.type === 'form' && screen.successScreenId) {
                      openTab(screen.successScreenId)
                    } else if (stack.length > 1) {
                      goBack()
                    } else {
                      // Некуда возвращаться и некуда вести: отвечаем словами.
                      setSent(
                        (screen.type === 'form' && screen.successText) ||
                          'Спасибо! Мы получили вашу запись.',
                      )
                    }
                  })
                } else if (row) {
                  runMutation(() => appUpdateRowAction(app.slug, tableId, row.id, values, baseVersion), goBack)
                }
              }}
            />
            )}
            {sent === null && intake === null && app.booking && screen.type === 'detail' && screen.tableId === app.booking.tables.visits && row &&
              app.screens.some(candidate => candidate.type === 'form' && candidate.mode === 'edit' && candidate.tableId === app.booking!.tables.visits &&
                candidate.components.some(component => component.type === 'form_field' && component.fieldId === app.booking!.visit.status)) &&
              bookingDateField && canCompleteBooking(app.booking, row, fieldTimeZone(bookingDateField), now) ?
              <div className="mx-auto mt-5 max-w-xl rounded-2xl border border-sand-200 bg-white p-4">
                <button type="button" disabled={pending} onClick={() => runMutation(() => appUpdateRowAction(app.slug, app.booking!.tables.visits, row.id,
                  { [app.booking!.visit.status]: app.booking!.statuses.completed }, row.version), goBack)}
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 ${accent.solid}`}>Услуга оказана</button>
                <p className="mt-2 text-xs leading-relaxed text-ink-muted">Посещение получит статус «Завершено» в истории клиента.</p>
              </div> : null}
            {sent === null && intake === null && app.booking && screen.type === 'detail' && screen.tableId === app.booking.tables.visits && row &&
              row.data[app.booking.visit.status] === app.booking.statuses.booked && (dateInstant(row.data[app.booking.visit.start]) ?? 0) > now ?
              <div className="mx-auto mt-5 flex max-w-xl flex-wrap items-center gap-3 rounded-2xl border border-sand-200 bg-white p-4">
                {app.screens.some(s => s.id === app.booking!.rescheduleScreenId) ? <button type="button" disabled={pending} onClick={() => navigate(app.booking!.rescheduleScreenId, row.id)} className="rounded-xl border border-sand-200 px-4 py-2.5 text-sm font-medium">Перенести запись</button> : null}
                {confirmCancellation ? <><p className="w-full text-sm text-ink-muted">Отменить запись? Это время станет доступно другим клиентам.</p>
                  <button type="button" disabled={pending} onClick={() => runMutation(() => cancelBookingAction(app.slug, row.id, row.version ?? 0), () => { setConfirmCancellation(false); openTab(home) })} className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">Да, отменить запись</button>
                  <button type="button" onClick={() => setConfirmCancellation(false)} className="px-3 py-2.5 text-sm">Оставить запись</button></> :
                  <button type="button" disabled={pending} onClick={() => setConfirmCancellation(true)} className="rounded-xl px-4 py-2.5 text-sm text-red-700">Отменить запись</button>}
              </div> : null}
          </div>
        </div>

        {/* Нижние вкладки — только на телефоне: на компьютере есть боковое меню. */}
        {tabs.length > 1 ? (
          <nav className="relative flex border-t border-sand-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur @min-[860px]:hidden">
            {tabs.slice(0, tabs.length > 5 ? 4 : 5).map((tab) => {
              const active = stack[0]?.screenId === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => openTab(tab.id)}
                  className={`flex flex-1 flex-col items-center gap-1 px-1 py-2.5 transition-colors ${
                    active ? accent.text : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <Icon name={tabIcon(tab)} className="size-5" />
                  <span className={`truncate text-[11px] ${active ? 'font-semibold' : ''}`}>
                    {tab.tab?.label ?? tab.name}
                  </span>
                </button>
              )
            })}
            {tabs.length > 5 ? <><button type="button" aria-expanded={moreTabs} onClick={() => setMoreTabs(!moreTabs)} className="flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-ink-muted"><Icon name="grid" className="size-5" /><span className="text-[11px]">Ещё</span></button>
              {moreTabs ? <div className="absolute inset-x-3 bottom-full mb-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-sand-200 bg-white p-2 shadow-soft">{tabs.slice(4).map(tab => <button type="button" key={tab.id} onClick={() => { setMoreTabs(false); openTab(tab.id) }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-sand-50"><Icon name={tabIcon(tab)} className="size-5" />{tab.tab?.label ?? tab.name}</button>)}</div> : null}</> : null}
          </nav>
        ) : null}
      </div>
    </div>
  )
}
