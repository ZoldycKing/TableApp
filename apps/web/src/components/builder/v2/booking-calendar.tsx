'use client'
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties } from 'react'
import { instantToWallClock } from '@tableapp/schema'
import type { AppV2 } from '@tableapp/schema/app-v2'
import type { BookingCalendarRequest, BookingCalendarResult } from '@/lib/builder-v2-booking-calendar'
import {
  calendarDays,
  calendarShift,
  calendarClock,
  calendarEventLanes,
  calendarGridBounds,
  calendarBlockFrame,
  calendarMoveIssue,
  calendarPeriodAmount,
  type TeamCalendarSnapshot,
} from '@/lib/team-calendar-core'
import type { CalendarSlot } from '@/lib/team-calendar-prefill'
import { usePublishedV2 } from './published-context'
import { AppFrameDeviceContext } from './app-frame'
import { ListScreenShell } from './layout-shell'
import { ProtoIcon } from '../prototype/icons'
import styles from '../prototype/prototype.module.css'
import css from './booking-calendar.module.css'
import {
  BookingWeekOverview,
  BookingDayAgenda,
  HoursEdit,
  bookingCalendarDateLabel as dateLabel,
  bookingCalendarStatusNames as statusNames,
  bookingCountLabel,
} from './booking-calendar-views'
import { BookingAvatar } from './booking-avatar'
import { RuDateInput, ruDateText } from './ru-fields'
import { useBookingJourney } from './booking-journey'

export const BookingCalendarDemoContext = createContext<((request: BookingCalendarRequest) => BookingCalendarResult) | null>(null)
const money = (value: number) => `${value.toLocaleString('ru-RU')} ₽`

type CalendarLoader = (request: BookingCalendarRequest) => Promise<BookingCalendarResult> | BookingCalendarResult

function useCalendar(app: AppV2, request: BookingCalendarRequest, loader?: CalendarLoader, loaderKey?: string) {
  const demo = useContext(BookingCalendarDemoContext)
  const published = usePublishedV2()
  const [retry, setRetry] = useState(0)
  const key = JSON.stringify([loader && loaderKey ? loaderKey : app, request, published?.revision, published?.dataVersion, retry])
  const [state, setState] = useState<{ key: string; result: BookingCalendarResult }>()
  useEffect(() => {
    let cancelled = false
    const read = async () => {
      if (loader) return loader(request)
      if (demo) return demo(request)
      const actions = await import('@/app/builder-v2-booking-actions')
      return published
        ? actions.readPublishedV2BookingCalendarAction(published.slug, { ...request, revision: published.revision })
        : actions.readBuilderV2BookingCalendarAction(app.id, app, request)
    }
    void read().then(result => {
      if (!cancelled) setState({ key, result })
    }).catch(() => {
      if (!cancelled) setState({ key, result: { ok: false, error: 'Не удалось загрузить календарь. Попробуйте ещё раз.' } })
    })
    return () => { cancelled = true }
  }, [key])
  return { result: state?.key === key ? state.result : undefined, retry: () => setRetry(value => value + 1) }
}

function useDismiss(open: boolean, root: { current: HTMLElement | null }, close: () => void) {
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) close() }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open, root, close])
}

function DateMenu({ value, onValue, label }: { value: string; onValue: (value: string) => void; label: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)
  useDismiss(open, root, close)
  const [yearText, monthText] = value.split('-')
  const year = Number(yearText) || new Date().getFullYear()
  const month = Number(monthText) || 1
  const [cursor, setCursor] = useState({ year, month })
  useEffect(() => { setCursor({ year, month }) }, [year, month])
  const first = new Date(cursor.year, cursor.month - 1, 1)
  const pad = (first.getDay() + 6) % 7
  const count = new Date(cursor.year, cursor.month, 0).getDate()
  const title = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(first)
  const shift = (amount: number) => {
    const next = new Date(cursor.year, cursor.month - 1 + amount, 1)
    setCursor({ year: next.getFullYear(), month: next.getMonth() + 1 })
  }
  const pick = (day: number) => {
    onValue(`${cursor.year}-${String(cursor.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
    setOpen(false)
  }
  return <div className={css.picker} ref={root}>
    <button type="button" className={css.pickerButton} aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(current => !current)}>
      <ProtoIcon name="calendar" size={16} /><span>{ruDateText(value) || 'дд.мм.гггг'}</span>
    </button>
    {open ? <div className={css.pickerPanel} role="dialog" aria-label={label}>
      <div className={css.pickerHead}>
        <button type="button" aria-label="Предыдущий месяц" onClick={() => shift(-1)}><ProtoIcon name="back" size={16} /></button>
        <strong>{title}</strong>
        <button type="button" aria-label="Следующий месяц" onClick={() => shift(1)}><ProtoIcon name="arrow" size={16} /></button>
      </div>
      <div className={css.pickerWeek}>{['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(name => <span key={name}>{name}</span>)}</div>
      <div className={css.pickerDays}>
        {Array.from({ length: pad }, (_, index) => <span key={`pad-${index}`} />)}
        {Array.from({ length: count }, (_, index) => {
          const day = index + 1
          const iso = `${cursor.year}-${String(cursor.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          return <button type="button" key={day} aria-pressed={iso === value} onClick={() => pick(day)}>{day}</button>
        })}
      </div>
    </div> : null}
  </div>
}

function ResourceMenu({ label, allLabel, value, options, onChange }: { label: string; allLabel: string; value: string; options: { id: string; name: string }[]; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)
  useDismiss(open, root, close)
  const current = options.find(item => item.id === value)?.name ?? allLabel
  return <div className={`${css.picker} ${css.master}`} ref={root}>
    <button type="button" className={css.pickerButton} aria-label={label} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(currentOpen => !currentOpen)}>
      <span>{current}</span><ProtoIcon name="down" size={14} />
    </button>
    {open ? <ul className={css.menuList} role="listbox" aria-label={label}>
      <li role="option" aria-selected={!value}><button type="button" onClick={() => { onChange(''); setOpen(false) }}>{allLabel}</button></li>
      {options.map(item => <li key={item.id} role="option" aria-selected={item.id === value}><button type="button" onClick={() => { onChange(item.id); setOpen(false) }}>{item.name}</button></li>)}
    </ul> : null}
  </div>
}

export type CalendarMoveResult = { ok: true; unchanged?: boolean } | { ok: false; error: string }
export function TeamCalendarView({
  app, screenId, timeZone, working = false, onOpenVisit, onOpenPeriod, onAdd, onCreate, onConfigure, onMove,
  editing = false, loader, loaderKey, title = 'Расписание', resourceLabel = 'Мастер', resourcesLabel = 'Мастера',
  showMetrics = true, showWorkingHours = true, showAmounts = true, showNoShows = true, showOmissions = false,
  calendarKey, leadMinutes = 60, stepMinutes = 15, horizonDays = 60, bufferMinutes = 0, defaultView = 'day', hourPixels = 56,
  plainControls = false, visitForms, compactWeek = false, onAssignDrop, dropPreview = null, meta,
}: {
  app: AppV2
  screenId: string
  timeZone: string
  working?: boolean
  editing?: boolean
  onOpenVisit: (id: string) => void
  onOpenPeriod?: (id: string) => void
  onAdd?: () => void
  onConfigure?: () => void
  onCreate?: (intent: CalendarSlot) => void
  onMove?: (eventId: string, slot: { resourceId: string; day: string; time: string }) => Promise<CalendarMoveResult>
  loader?: CalendarLoader
  loaderKey?: string
  title?: string
  resourceLabel?: string
  resourcesLabel?: string
  showMetrics?: boolean
  showWorkingHours?: boolean
  showAmounts?: boolean
  showNoShows?: boolean
  showOmissions?: boolean
  calendarKey?: string
  leadMinutes?: number
  stepMinutes?: number
  horizonDays?: number
  bufferMinutes?: number
  defaultView?: 'list' | 'day' | 'week'
  /** Pixels per hour on the day grid. Salon stays at 56. */
  hourPixels?: number
  /** Styled date and resource menus instead of the native date input and select. */
  plainControls?: boolean
  /** Nouns for the period counter. Salon keeps «запись». */
  visitForms?: readonly [string, string, string]
  /** Compact chips and day counts for the field-service week. */
  compactWeek?: boolean
  /** Drop an unassigned job onto a technician and time. */
  onAssignDrop?: (slot: { jobId: string; resourceId: string; day: string; time: string }) => void
  /** Paint a drop target without a live drag, for the day-board preview. */
  dropPreview?: { resourceId: string; day: string; time: string; label: string } | null
  meta?: string
}) {
  const journey = useBookingJourney()
  const saved = journey && journey.calendar?.key === calendarKey ? journey.calendar : null
  const [day, setDay] = useState(saved?.day ?? instantToWallClock(new Date(), timeZone)!.date)
  const [view, setView] = useState<'list' | 'day' | 'week'>(saved?.view ?? (saved?.week ? 'week' : defaultView))
  const [resource, setResource] = useState(saved?.masterId ?? '')
  const [focusId, setFocusId] = useState('')
  const [moveNotice, setMoveNotice] = useState<{ text: string; error: boolean } | null>(null)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const frameDevice = useContext(AppFrameDeviceContext)
  const [narrow, setNarrow] = useState(false)
  const week = view === 'week'
  const compact = frameDevice === 'phone' || (frameDevice === 'auto' && narrow)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    journey?.setCalendar({ day, masterId: resource, week, view, ...(calendarKey ? { key: calendarKey } : {}) })
  }, [day, resource, week, view, calendarKey])
  const { result, retry } = useCalendar(app, { screenId, day, week }, loader, loaderKey)
  useEffect(() => {
    const element = root.current
    if (!element) return
    const observer = new ResizeObserver(entries => setNarrow((entries[0]?.contentRect.width ?? 0) < 760))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const data = result?.ok ? result.data : undefined
  const zone = data?.timeZone ?? timeZone
  const today = instantToWallClock(new Date(), zone)!.date
  const selected = data?.resources.some(item => item.id === resource) ? resource : ''
  const visibleEvents = data?.events.filter(event => !selected || event.resourceId === selected) ?? []
  const shiftDate = (direction: number) => {
    const next = new Date(`${day}T12:00:00Z`)
    next.setUTCDate(next.getUTCDate() + direction * (week ? 7 : 1))
    setDay(next.toISOString().slice(0, 10))
  }
  const range = week ? calendarDays(day, true) : [day]
  const periodEvents = visibleEvents.filter(event => event.status !== 'cancelled' && (week || event.day === day))
  const metricEvents = [...new Map(periodEvents.map(event => [event.id, event])).values()]
  const periodCount = metricEvents.length
  const periodLabel = week
    ? `${ruDateText(range[0]!)} — ${ruDateText(range[6]!)}`
    : dateLabel(day, { weekday: 'long', day: 'numeric', month: 'long' })
  const periodLine = `${periodLabel} · ${bookingCountLabel(periodCount, visitForms)}`
  const phonePeople = data?.resources.filter(item => !selected || item.id === selected) ?? []
  const phoneId = phonePeople.some(item => item.id === focusId) ? focusId : (selected || phonePeople[0]?.id || '')
  const zoneLabel = new Intl.DateTimeFormat('ru-RU', { timeZone: zone, timeZoneName: 'shortOffset' })
    .formatToParts(new Date())
    .find(part => part.type === 'timeZoneName')
    ?.value.replace('GMT', 'UTC')
  const create = (slot: CalendarSlot) => {
    if (editing) return
    const resourceName = slot.resourceName ?? data?.resources.find(item => item.id === slot.resourceId)?.name
    onCreate?.({ ...slot, ...(resourceName ? { resourceName } : {}) })
  }
  const moveMaster = (direction: number) => {
    const index = phonePeople.findIndex(person => person.id === phoneId)
    const next = phonePeople[index + direction]
    if (next) setFocusId(next.id)
  }
  useEffect(() => {
    const selectedTab = root.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    selectedTab?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })
  }, [phoneId, compact])
  return (
    <div ref={root} className={css.root} data-booking-calendar data-working={working || undefined} data-compact={compact || undefined}>
      <ListScreenShell
        title={title}
        meta={meta ?? (showWorkingHours ? 'Записи и рабочие часы команды' : 'Записи команды')}
        actions={(
          <div className={css.actions}>
            {onConfigure && <button type="button" className={styles.textButton} disabled={editing} onClick={onConfigure}>Настроить часы</button>}
            {onAdd && (
              <button type="button" className={styles.primary} disabled={editing} onClick={() => (onCreate ? create({ day, ...(selected ? { resourceId: selected } : {}) }) : onAdd())}>
                <ProtoIcon name="plus" />Записать
              </button>
            )}
          </div>
        )}
        metrics={showMetrics && data ? [
          { key: 'visits', caption: week ? 'Записи за неделю' : 'Записи за день', value: metricEvents.filter(event => event.status !== 'cancelled').length, icon: <ProtoIcon name="calendar" size={16} /> },
          ...(showNoShows ? [{ key: 'noShow', caption: 'Неявки', value: metricEvents.filter(event => event.status === 'noShow').length, icon: <ProtoIcon name="users" size={16} /> }] : []),
          ...(showAmounts ? [{ key: 'amount', caption: 'Стоимость записей', value: money(calendarPeriodAmount(metricEvents, range)), icon: <ProtoIcon name="chart" size={16} />, wide: true }] : []),
        ] : undefined}
        metricLayout="cards"
        search={(
          <div className={css.controls}>
            <div className={css.mode} role="group" aria-label="Период календаря">
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>Список</button>
              <button type="button" aria-pressed={view === 'day'} onClick={() => setView('day')}>День</button>
              <button type="button" aria-pressed={view === 'week'} onClick={() => setView('week')}>Неделя</button>
            </div>
            <div className={css.dateControls}>
              <button type="button" aria-label={week ? 'Предыдущая неделя' : 'Предыдущий день'} onClick={() => shiftDate(-1)}><ProtoIcon name="back" size={17} /></button>
              {plainControls
                ? <DateMenu label="Дата календаря" value={day} onValue={setDay} />
                : <label><span className="sr-only">Дата календаря</span><RuDateInput aria-label="Дата календаря" value={day} onValue={setDay} /></label>}
              <button type="button" aria-label={week ? 'Следующая неделя' : 'Следующий день'} onClick={() => shiftDate(1)}><ProtoIcon name="arrow" size={17} /></button>
            </div>
            <button type="button" className={css.today} onClick={() => setDay(today)}>Сегодня</button>
            {plainControls
              ? <ResourceMenu label={`${resourceLabel} календаря`} allLabel={`Все ${resourcesLabel.toLocaleLowerCase('ru-RU')}`} value={selected} options={data?.resources.map(item => ({ id: item.id, name: item.name })) ?? []} onChange={setResource} />
              : <label className={css.master}>
                <span className="sr-only">{resourceLabel} календаря</span>
                <select aria-label={`${resourceLabel} календаря`} value={selected} onChange={event => setResource(event.target.value)}>
                  <option value="">Все {resourcesLabel.toLocaleLowerCase('ru-RU')}</option>
                  {data?.resources.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
                </select>
              </label>}
          </div>
        )}
      >
        <div className={css.caption}>
          <h2>{periodLine}</h2>
          <span>Часовой пояс · {zoneLabel}</span>
        </div>
        {week && (
          <nav className={css.mobileDays} aria-label="День недели">
            {range.map(date => (
              <button type="button" key={date} aria-pressed={date === day} onClick={() => setDay(date)}>
                <span>{dateLabel(date, { weekday: 'short' })}</span>
                <strong>{dateLabel(date, { day: 'numeric' })}</strong>
              </button>
            ))}
          </nav>
        )}
        {!result ? <p className={css.feedback} role="status">Загружаем календарь…</p>
          : !result.ok ? (
            <div className={css.feedback} role="alert">
              <p>{result.error}</p>
              <button type="button" className={styles.secondary} onClick={retry}>Повторить загрузку</button>
            </div>
          ) : !data?.resources.length ? <p className={css.feedback}>В календаре пока нет доступных сотрудников.</p> : (
            <>
              {view === 'list' ? (
                <BookingDayAgenda showHeading={false} showWorkingHours={showWorkingHours} resourcesLabel={resourcesLabel} data={data} day={day} resourceId={selected} working={Boolean(onOpenPeriod)} editing={editing} onOpenVisit={onOpenVisit} onOpenPeriod={onOpenPeriod} />
              ) : view === 'week' ? (
                <BookingWeekOverview showWorkingHours={showWorkingHours} resourcesLabel={resourcesLabel} data={data} resourceId={selected} working={Boolean(onOpenPeriod)} editing={editing} onOpenVisit={onOpenVisit} onOpenPeriod={onOpenPeriod} onOpenDay={date => { setDay(date); setView('day') }} onMove={onMove} onAssignDrop={onAssignDrop} compactChips={compactWeek} />
              ) : (
                <div
                  className={css.dayBoard}
                  onPointerDown={event => {
                    if (!compact || event.pointerType === 'mouse' || (event.target instanceof Element && event.target.closest('button'))) return
                    swipe.current = { x: event.clientX, y: event.clientY }
                  }}
                  onPointerUp={event => {
                    const start = swipe.current
                    swipe.current = null
                    if (!start || !compact) return
                    const dx = event.clientX - start.x, dy = event.clientY - start.y
                    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return
                    moveMaster(dx < 0 ? 1 : -1)
                  }}
                >
                  {moveNotice && <p className={css.moveNotice} role={moveNotice.error ? 'alert' : 'status'}>{moveNotice.text}</p>}
                  {compact && phonePeople.length > 1 && (
                    <div className={css.staffSwitch} role="tablist" aria-label={resourcesLabel}>
                      {phonePeople.map(person => {
                        const count = data.events.filter(event => event.resourceId === person.id && event.day === day && event.status !== 'cancelled').length
                        return (
                          <button type="button" role="tab" key={person.id} aria-selected={person.id === phoneId} onClick={() => setFocusId(person.id)}>
                            <BookingAvatar small name={person.name} photo={person.photo} />
                            <span>{person.name}</span>
                            <b>{count}</b>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <CalendarGrid
                    showWorkingHours={showWorkingHours}
                    data={data}
                    day={day}
                    resourceId={compact ? phoneId : selected}
                    editing={editing}
                    canMove={Boolean(onMove) && !compact && !editing}
                    onOpenVisit={onOpenVisit}
                    onOpenPeriod={onOpenPeriod}
                    onCreate={onCreate ? create : undefined}
                    onMove={onMove}
                    onNotice={(text, error) => setMoveNotice({ text, error })}
                    leadMinutes={leadMinutes}
                    stepMinutes={stepMinutes}
                    horizonDays={horizonDays}
                    bufferMinutes={bufferMinutes}
                    hourPixels={hourPixels}
                    onAssignDrop={onAssignDrop}
                    dropPreview={dropPreview}
                  />
                </div>
              )}
              {!compact && !week && showWorkingHours && (
                <div className={css.legend}>
                  <span><i data-kind="hours" />Рабочая смена</span>
                  <span><i data-kind="visit" />Запись</span>
                  {bufferMinutes > 0 && <span><i data-kind="buffer" />Пауза после записи</span>}
                  <span><i />Перерыв или не работает</span>
                </div>
              )}
              {showOmissions && data.omitted > 0 && (
                <p className={css.omitted} role="status">
                  Не показано строк: {data.omitted}. Проверьте время, длительность и связь с сотрудником.
                </p>
              )}
              {visibleEvents.some(event => event.status === 'cancelled' && (!compact || event.day === day)) && (
                <div className={css.cancelled}>
                  <strong>Отменённые записи</strong>
                  {visibleEvents.filter(event => event.status === 'cancelled' && (!compact || event.day === day)).map(event => (
                    <button key={`${event.id}:${event.resourceId}`} type="button" onClick={() => onOpenVisit(event.id)}>
                      {week && !compact ? `${ruDateText(event.day)} · ` : ''}
                      {calendarClock(event.start)} · {data.resources.find(item => item.id === event.resourceId)?.name} · {event.title}
                      {event.subtitle ? ` · ${event.subtitle}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
      </ListScreenShell>
    </div>
  )
}

/** Older saved salon definitions use the same calendar surface. */
export const BookingCalendarScreen = TeamCalendarView

function CalendarGrid({
  data, day, resourceId, editing, showWorkingHours, canMove = false, onOpenVisit, onOpenPeriod, onCreate, onMove, onNotice, leadMinutes, stepMinutes, horizonDays, bufferMinutes = 0, hourPixels = 56,
  onAssignDrop, dropPreview = null,
}: {
  data: TeamCalendarSnapshot
  day: string
  resourceId: string
  editing: boolean
  showWorkingHours: boolean
  canMove?: boolean
  onOpenVisit: (id: string) => void
  onOpenPeriod?: (id: string) => void
  onCreate?: (intent: CalendarSlot) => void
  onMove?: (eventId: string, slot: { resourceId: string; day: string; time: string }) => Promise<CalendarMoveResult>
  onNotice?: (text: string, error: boolean) => void
  leadMinutes: number
  stepMinutes: number
  horizonDays: number
  bufferMinutes?: number
  hourPixels?: number
  onAssignDrop?: (slot: { jobId: string; resourceId: string; day: string; time: string }) => void
  dropPreview?: { resourceId: string; day: string; time: string; label: string } | null
}) {
  const resources = data.resources.filter(item => !resourceId || item.id === resourceId)
  const columns = resources.map(item => ({ day, resource: item }))
  const relevant = (id: string, date: string) => data.events.filter(event => event.resourceId === id && event.day === date && event.status !== 'cancelled')
  const active = columns.flatMap(column => relevant(column.resource.id, column.day))
  const shifts = columns.map(column => data.shifts.find(shift => shift.resourceId === column.resource.id && shift.day === column.day)!)
  const workdays = shifts.map(shift => calendarShift(shift?.windows ?? []))
  const windows = shifts.flatMap(shift => shift?.windows ?? [])
  const bounds = calendarGridBounds(windows, active)
  const { start, end, span } = bounds
  const height = span / 60 * (hourPixels ?? 56)
  const ticks = Array.from({ length: span / 60 + 1 }, (_, index) => start + index * 60)
  const position = (from: number, to: number): CSSProperties => {
    const frame = calendarBlockFrame(bounds, from, to)
    return { top: `${frame.top * 100}%`, height: `${frame.height * 100}%` }
  }
  const earliest = instantToWallClock(new Date(Date.now() + leadMinutes * 60000), data.timeZone)!
  const latestDay = instantToWallClock(new Date(Date.now() + horizonDays * 86400000), data.timeZone)!.date
  const gridRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; x: number; y: number; offset: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const [ghost, setGhost] = useState<{ id: string; resourceId: string; day: string; start: number } | null>(null)
  const [moving, setMoving] = useState(false)
  const locate = (clientX: number, clientY: number, offset: number) => {
    const columns = gridRef.current?.querySelectorAll<HTMLElement>('[data-calendar-column]') ?? []
    for (const column of columns) {
      const rect = column.getBoundingClientRect()
      if (rect.width <= 0 || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue
      const gridStart = Number(column.dataset.gridStart)
      const spanMinutes = Number(column.dataset.gridSpan)
      const raw = gridStart + ((clientY - offset - rect.top) / rect.height) * spanMinutes
      const step = stepMinutes > 0 ? stepMinutes : 15
      return { resourceId: column.dataset.resourceId ?? '', day: column.dataset.day ?? day, start: Math.round(raw / step) * step }
    }
    return null
  }
  const finishMove = async (clientX: number, clientY: number) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag?.moved || !onMove) { setGhost(null); return }
    suppressClick.current = true
    const target = locate(clientX, clientY, drag.offset)
    const event = data.events.find(item => item.id === drag.id && item.day === day)
    if (!target || !event) { setGhost(null); return }
    const shift = data.shifts.find(item => item.resourceId === target.resourceId && item.day === target.day)
    const windows = showWorkingHours ? (shift?.windows ?? []) : null
    const issue = showWorkingHours && shift?.windows === null
      ? 'Не удалось проверить рабочие часы. Запись осталась на прежнем месте.'
      : calendarMoveIssue({ event, resourceId: target.resourceId, day: target.day, start: target.start, step: stepMinutes, windows, others: data.events, buffer: bufferMinutes })
    if (issue) { setGhost(null); onNotice?.(issue, true); return }
    setMoving(true)
    try {
      const result = await onMove(event.id, { resourceId: target.resourceId, day: target.day, time: calendarClock(target.start) })
      setGhost(null)
      if (!result.ok) onNotice?.(result.error, true)
      else onNotice?.(result.unchanged ? 'Запись уже стоит на этом времени.' : 'Запись перенесена.', false)
    } catch {
      setGhost(null)
      onNotice?.('Не удалось перенести запись. Она осталась на прежнем месте.', true)
    } finally { setMoving(false) }
  }
  return (
    <div className={css.calendarScroll} tabIndex={0} aria-label="Прокрутка календаря по сотрудникам">
      <div className={css.calendar} data-no-hours={!showWorkingHours || undefined} style={{ '--calendar-columns': columns.length, '--calendar-height': `${height}px` } as CSSProperties} aria-label="Календарь рабочих часов и записей">
        <div className={css.head}>
          <span className={css.axisHead}>Время</span>
          {columns.map((column, index) => (
            <div className={css.columnHead} key={`${column.resource.id}:${column.day}`}>
              <span className={css.headPhoto}><BookingAvatar small name={column.resource.name} photo={column.resource.photo} /></span>
              <strong>{column.resource.name}</strong>
              <b className={css.headCount}>{relevant(column.resource.id, column.day).length}</b>
              {showWorkingHours && (
                <HoursEdit
                  className={css.shiftSummary}
                  periods={shifts[index]?.windows ?? []}
                  unavailable={shifts[index]?.windows === null}
                  closed={Boolean(shifts[index]?.closed)}
                  person={column.resource.name}
                  editing={editing}
                  onOpenPeriod={onOpenPeriod}
                />
              )}
            </div>
          ))}
        </div>
        <div className={css.timeline} ref={gridRef}>
          <div className={css.axis}>{ticks.map(time => <span key={time} style={{ top: `${(time - start) / span * 100}%` }}>{calendarClock(time)}</span>)}</div>
          {columns.map((column, index) => {
            const shift = shifts[index]
            const workday = workdays[index]
            const events = relevant(column.resource.id, column.day)
            const periods = shift?.windows ?? []
            const freeStarts = new Set<number>()
            const hitStep = Math.max(30, stepMinutes)
            return (
              <section
                className={css.column}
                key={`${column.resource.id}:${column.day}`}
                data-calendar-column=""
                data-resource-id={column.resource.id}
                data-day={column.day}
                data-grid-start={start}
                data-grid-span={span}
                data-drop={dropPreview && dropPreview.resourceId === column.resource.id && dropPreview.day === column.day ? 'true' : undefined}
                aria-label={`${column.resource.name}, ${dateLabel(column.day, { day: 'numeric', month: 'long' })}`}
                onDragOver={drag => {
                  if (!onAssignDrop || ![...drag.dataTransfer.types].includes('text/plain')) return
                  drag.preventDefault()
                  drag.currentTarget.dataset.drop = 'true'
                }}
                onDragLeave={drag => { if (!dropPreview) delete drag.currentTarget.dataset.drop }}
                onDrop={drag => {
                  if (!dropPreview) delete drag.currentTarget.dataset.drop
                  const text = drag.dataTransfer.getData('text/plain')
                  const assign = /^dispatch-job\|(.+)$/.exec(text)
                  if (!assign || !onAssignDrop) return
                  drag.preventDefault()
                  const target = locate(drag.clientX, drag.clientY, 16)
                  if (!target) return
                  onAssignDrop({ jobId: assign[1]!, resourceId: target.resourceId, day: target.day, time: calendarClock(target.start) })
                }}
              >
                {ticks.slice(0, -1).map(time => <span aria-hidden className={css.line} key={time} style={{ top: `${(time - start) / span * 100}%` }} />)}
                {workday && <div className={css.shiftOutline} data-calendar-shift aria-hidden style={position(workday.start, workday.end)} />}
                {onCreate && day >= earliest.date && day <= latestDay && periods.flatMap(window => {
                  const slots: number[] = []
                  for (let time = Math.ceil(window.start / stepMinutes) * stepMinutes; time + hitStep <= window.end; time += hitStep) {
                    const overlaps = events.some(event => event.start < time + hitStep && event.end > time)
                    if (!freeStarts.has(time) && !overlaps && (day > earliest.date || calendarClock(time) >= earliest.time)) {
                      slots.push(time)
                      freeStarts.add(time)
                    }
                  }
                  return slots.map(time => (
                    <button type="button" className={css.freeSlot} key={`${window.id}:${time}`} style={position(time, time + hitStep)} disabled={editing} aria-label={`Добавить запись: ${column.resource.name}, ${day}, ${calendarClock(time)}`} onClick={() => onCreate({ resourceId: column.resource.id, day, time: calendarClock(time) })}>
                      <span>+ {calendarClock(time)}</span>
                    </button>
                  ))
                })}
                {workday?.breaks.map(pause => (
                  <span className={css.break} key={`break-${pause.start}`} style={position(pause.start, pause.end)}>
                    <strong>Перерыв</strong>
                    <span>{calendarClock(pause.start)}–{calendarClock(pause.end)}</span>
                  </span>
                ))}
                {shift?.exception && <span className={css.exception}>График на эту дату</span>}
                {calendarEventLanes(events).map(({ event, lane, lanes }) => (
                  <span key={event.id} className={css.visitLane}>
                  {bufferMinutes > 0 && event.status !== 'cancelled' && event.end + bufferMinutes > event.end && (
                    <span className={css.buffer} aria-hidden="true" style={{ ...position(event.end, Math.min(event.end + bufferMinutes, 24 * 60)), left: `calc(${lane / lanes * 100}% + 6px)`, width: `calc(${100 / lanes}% - 12px)` }} />
                  )}
                  <button
                    type="button"
                    key={event.id}
                    className={css.visit}
                    data-status={event.status || undefined}
                    data-short={event.end - event.start <= 60 || undefined}
                    data-move={canMove || undefined}
                    data-dragging={ghost?.id === event.id || undefined}
                    disabled={editing || moving}
                    style={{ ...position(event.start, event.end), left: `calc(${lane / lanes * 100}% + 6px)`, width: `calc(${100 / lanes}% - 12px)` }}
                    title={canMove ? 'Перетащите, чтобы изменить время или мастера' : `${event.subtitle || event.title} · ${calendarClock(event.start)}–${calendarClock(event.end)} · ${statusNames[event.status] ?? ''}`}
                    aria-label={`Открыть запись: ${event.title}, ${event.subtitle}, ${calendarClock(event.start)}–${calendarClock(event.end)}`}
                    onPointerDown={pointer => {
                      if (!canMove || pointer.button !== 0 || moving) return
                      const rect = pointer.currentTarget.getBoundingClientRect()
                      dragRef.current = { id: event.id, x: pointer.clientX, y: pointer.clientY, offset: pointer.clientY - rect.top, moved: false }
                      const move = (next: PointerEvent) => {
                        const drag = dragRef.current
                        if (!drag || drag.id !== event.id) return
                        if (!drag.moved && Math.hypot(next.clientX - drag.x, next.clientY - drag.y) < 6) return
                        drag.moved = true
                        const target = locate(next.clientX, next.clientY, drag.offset)
                        if (target) setGhost({ id: event.id, ...target })
                      }
                      const up = (next: PointerEvent) => {
                        window.removeEventListener('pointermove', move)
                        window.removeEventListener('pointerup', up)
                        window.removeEventListener('pointercancel', up)
                        if (dragRef.current?.id === event.id) void finishMove(next.clientX, next.clientY)
                      }
                      window.addEventListener('pointermove', move)
                      window.addEventListener('pointerup', up)
                      window.addEventListener('pointercancel', up)
                    }}
                    onClick={() => { if (suppressClick.current) { suppressClick.current = false; return } onOpenVisit(event.id) }}
                  >
                    <strong>{event.subtitle || event.title}</strong>
                    {event.subtitle && <small>{event.title}</small>}
                    <span className={css.visitTime}>{calendarClock(event.start)}–{calendarClock(event.end)}</span>
                  </button>
                  </span>
                ))}
                {dropPreview && dropPreview.resourceId === column.resource.id && dropPreview.day === column.day && (() => {
                  const minutes = Number(dropPreview.time.slice(0, 2)) * 60 + Number(dropPreview.time.slice(3, 5))
                  if (!Number.isFinite(minutes)) return null
                  return <div className={css.visit} data-ghost="" style={position(minutes, minutes + 60)}><strong>{dropPreview.label}</strong><span className={css.visitTime}>{dropPreview.time}</span></div>
                })()}
                {ghost && ghost.resourceId === column.resource.id && ghost.day === column.day && (() => {
                  const source = data.events.find(item => item.id === ghost.id)
                  if (!source) return null
                  return (
                    <div className={css.visit} data-status={source.status || undefined} data-ghost="" aria-hidden style={{ ...position(ghost.start, ghost.start + source.end - source.start), left: 6, right: 6 }}>
                      <strong>{source.subtitle || source.title}</strong>
                      <span className={css.visitTime}>{calendarClock(ghost.start)}–{calendarClock(ghost.start + source.end - source.start)}</span>
                    </div>
                  )
                })()}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
