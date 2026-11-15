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
  type TeamCalendarSnapshot,
} from '@/lib/team-calendar-core'
import type { CalendarSlot } from '@/lib/team-calendar-prefill'
import { usePublishedV2 } from './published-context'
import { ListScreenShell } from './layout-shell'
import { ProtoIcon } from '../prototype/icons'
import styles from '../prototype/prototype.module.css'
import css from './booking-calendar.module.css'
import {
  BookingWeekOverview,
  BookingDayAgenda,
  BookingPeriodChoice,
  bookingCalendarDateLabel as dateLabel,
  bookingCalendarStatusNames as statusNames,
  bookingCountLabel,
} from './booking-calendar-views'
import { BookingAvatar } from './booking-avatar'
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

export function TeamCalendarView({
  app, screenId, timeZone, working = false, onOpenVisit, onOpenPeriod, onAdd, onCreate, onConfigure,
  editing = false, loader, loaderKey, title = 'Расписание', resourceLabel = 'Мастер', resourcesLabel = 'Мастера',
  showMetrics = true, showWorkingHours = true, showAmounts = true, showNoShows = true, showOmissions = false,
  calendarKey, leadMinutes = 60, stepMinutes = 15, horizonDays = 60,
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
}) {
  const journey = useBookingJourney()
  const saved = journey && journey.calendar?.key === calendarKey ? journey.calendar : null
  const [day, setDay] = useState(saved?.day ?? instantToWallClock(new Date(), timeZone)!.date)
  const [week, setWeek] = useState(saved?.week ?? working)
  const [resource, setResource] = useState(saved?.masterId ?? '')
  const [compact, setCompact] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    journey?.setCalendar({ day, masterId: resource, week, ...(calendarKey ? { key: calendarKey } : {}) })
  }, [day, resource, week, calendarKey])
  const { result, retry } = useCalendar(app, { screenId, day, week }, loader, loaderKey)
  useEffect(() => {
    const element = root.current
    if (!element) return
    const observer = new ResizeObserver(entries => setCompact((entries[0]?.contentRect.width ?? 0) < 760))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const data = result?.ok ? result.data : undefined
  const zone = data?.timeZone ?? timeZone
  const today = instantToWallClock(new Date(), zone)!.date
  const selected = data?.resources.some(item => item.id === resource) ? resource : ''
  const visibleEvents = data?.events.filter(event => !selected || event.resourceId === selected) ?? []
  const metricEvents = [...new Map(visibleEvents.map(event => [event.id, event])).values()]
  const shiftDate = (direction: number) => {
    const next = new Date(`${day}T12:00:00Z`)
    next.setUTCDate(next.getUTCDate() + direction * (week ? 7 : 1))
    setDay(next.toISOString().slice(0, 10))
  }
  const range = week ? calendarDays(day, true) : [day]
  const periodLabel = week
    ? `${dateLabel(range[0]!, { day: 'numeric', month: 'short' })} — ${dateLabel(range[6]!, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : dateLabel(day, { weekday: 'long', day: 'numeric', month: 'long' })
  const zoneLabel = new Intl.DateTimeFormat('ru-RU', { timeZone: zone, timeZoneName: 'shortOffset' })
    .formatToParts(new Date())
    .find(part => part.type === 'timeZoneName')
    ?.value.replace('GMT', 'UTC')
  const create = (slot: CalendarSlot) => {
    if (editing) return
    onCreate?.(slot)
  }
  return (
    <div ref={root} className={css.root} data-booking-calendar data-working={working || undefined} data-compact={compact || undefined}>
      <ListScreenShell
        title={title}
        meta={showWorkingHours ? 'Записи и рабочие часы команды' : 'Записи команды'}
        actions={(
          <div className={css.actions}>
            {onConfigure && <button type="button" className={styles.secondary} disabled={editing} onClick={onConfigure}>Настроить рабочие часы</button>}
            {onAdd && (
              <button type="button" className={styles.primary} disabled={editing} onClick={() => (onCreate ? create({ day, ...(selected ? { resourceId: selected } : {}) }) : onAdd())}>
                <ProtoIcon name="plus" />Добавить запись
              </button>
            )}
          </div>
        )}
        metrics={showMetrics && data ? [
          { key: 'visits', caption: week ? 'Записи за неделю' : 'Записи за день', value: metricEvents.filter(event => event.status !== 'cancelled').length, icon: <ProtoIcon name="calendar" size={16} /> },
          ...(showNoShows ? [{ key: 'noShow', caption: 'Неявки', value: metricEvents.filter(event => event.status === 'noShow').length, icon: <ProtoIcon name="users" size={16} /> }] : []),
          ...(showAmounts ? [{ key: 'amount', caption: 'Стоимость записей', value: money(metricEvents.filter(event => !['cancelled', 'noShow'].includes(event.status)).reduce((sum, event) => sum + (event.amount ?? 0), 0)), icon: <ProtoIcon name="chart" size={16} />, wide: true }] : []),
        ] : undefined}
        metricLayout="cards"
        search={(
          <div className={css.controls}>
            <div className={css.mode} role="group" aria-label="Период календаря">
              <button type="button" aria-pressed={!week} onClick={() => setWeek(false)}>День</button>
              <button type="button" aria-pressed={week} onClick={() => setWeek(true)}>Неделя</button>
            </div>
            <div className={css.dateControls}>
              <button type="button" aria-label={week ? 'Предыдущая неделя' : 'Предыдущий день'} onClick={() => shiftDate(-1)}><ProtoIcon name="back" size={17} /></button>
              <label><span className="sr-only">Дата календаря</span><input type="date" aria-label="Дата календаря" value={day} onChange={event => { if (event.target.value) setDay(event.target.value) }} /></label>
              <button type="button" aria-label={week ? 'Следующая неделя' : 'Следующий день'} onClick={() => shiftDate(1)}><ProtoIcon name="arrow" size={17} /></button>
            </div>
            <button type="button" className={css.today} onClick={() => setDay(today)}>Сегодня</button>
            <label className={css.master}>
              <span className="sr-only">{resourceLabel} календаря</span>
              <select aria-label={`${resourceLabel} календаря`} value={selected} onChange={event => setResource(event.target.value)}>
                <option value="">Все {resourcesLabel.toLocaleLowerCase('ru-RU')}</option>
                {data?.resources.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>
        )}
      >
        <div className={css.caption}>
          <h2>{periodLabel}</h2>
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
              {compact
                ? <BookingDayAgenda showHeading={week} showWorkingHours={showWorkingHours} resourcesLabel={resourcesLabel} data={data} day={day} resourceId={selected} working={Boolean(onOpenPeriod)} editing={editing} onOpenVisit={onOpenVisit} onOpenPeriod={onOpenPeriod} />
                : week
                  ? <BookingWeekOverview showWorkingHours={showWorkingHours} resourcesLabel={resourcesLabel} data={data} resourceId={selected} working={Boolean(onOpenPeriod)} editing={editing} onOpenVisit={onOpenVisit} onOpenPeriod={onOpenPeriod} onOpenDay={date => { setDay(date); setWeek(false) }} />
                  : (
                    <CalendarGrid
                      showWorkingHours={showWorkingHours}
                      data={data}
                      day={day}
                      resourceId={selected}
                      editing={editing}
                      onOpenVisit={onOpenVisit}
                      onOpenPeriod={onOpenPeriod}
                      onCreate={onCreate ? create : undefined}
                      leadMinutes={leadMinutes}
                      stepMinutes={stepMinutes}
                      horizonDays={horizonDays}
                    />
                  )}
              {!compact && !week && showWorkingHours && (
                <div className={css.legend}>
                  <span><i data-kind="hours" />Рабочая смена</span>
                  <span><i data-kind="visit" />Запись</span>
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
                      {week && !compact ? `${dateLabel(event.day, { day: 'numeric', month: 'short' })} · ` : ''}
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
  data, day, resourceId, editing, showWorkingHours, onOpenVisit, onOpenPeriod, onCreate, leadMinutes, stepMinutes, horizonDays,
}: {
  data: TeamCalendarSnapshot
  day: string
  resourceId: string
  editing: boolean
  showWorkingHours: boolean
  onOpenVisit: (id: string) => void
  onOpenPeriod?: (id: string) => void
  onCreate?: (intent: CalendarSlot) => void
  leadMinutes: number
  stepMinutes: number
  horizonDays: number
}) {
  const resources = data.resources.filter(item => !resourceId || item.id === resourceId)
  const columns = resources.map(item => ({ day, resource: item }))
  const relevant = (id: string, date: string) => data.events.filter(event => event.resourceId === id && event.day === date && event.status !== 'cancelled')
  const active = columns.flatMap(column => relevant(column.resource.id, column.day))
  const shifts = columns.map(column => data.shifts.find(shift => shift.resourceId === column.resource.id && shift.day === column.day)!)
  const workdays = shifts.map(shift => calendarShift(shift?.windows ?? []))
  const windows = shifts.flatMap(shift => shift?.windows ?? [])
  const start = Math.max(0, Math.floor(Math.min(8 * 60, ...windows.map(window => window.start - 60), ...active.map(event => event.start - 60)) / 60) * 60)
  const end = Math.min(1440, Math.ceil(Math.max(20 * 60, ...windows.map(window => window.end + 60), ...active.map(event => event.end + 60)) / 60) * 60)
  const span = Math.max(60, end - start)
  const height = span / 60 * 56
  const ticks = Array.from({ length: span / 60 + 1 }, (_, index) => start + index * 60)
  const position = (from: number, to: number): CSSProperties => ({
    top: `${(from - start) / span * 100}%`,
    height: `${(Math.min(to, end) - from) / span * 100}%`,
  })
  const earliest = instantToWallClock(new Date(Date.now() + leadMinutes * 60000), data.timeZone)!
  const latestDay = instantToWallClock(new Date(Date.now() + horizonDays * 86400000), data.timeZone)!.date
  return (
    <div className={css.calendarScroll} tabIndex={0} aria-label="Прокрутка календаря по сотрудникам">
      <div className={css.calendar} data-no-hours={!showWorkingHours || undefined} style={{ '--calendar-columns': columns.length, '--calendar-height': `${height}px`, minWidth: 56 + columns.length * 220 } as CSSProperties} aria-label="Календарь рабочих часов и записей">
        <div className={css.head}>
          <span className={css.axisHead}>Время</span>
          {columns.map((column, index) => (
            <div className={css.columnHead} key={`${column.resource.id}:${column.day}`}>
              <BookingAvatar small name={column.resource.name} photo={column.resource.photo} />
              <strong>{column.resource.name}</strong>
              <small>{bookingCountLabel(relevant(column.resource.id, column.day).length)}</small>
              {showWorkingHours && (
                <span className={css.shiftSummary} data-working={Boolean(workdays[index]) || undefined}>
                  {workdays[index]
                    ? <><span>Работает</span><b>{calendarClock(workdays[index]!.start)}–{calendarClock(workdays[index]!.end)}</b></>
                    : shifts[index]?.windows === null ? 'Часы недоступны' : 'Не работает'}
                </span>
              )}
              <BookingPeriodChoice periods={shifts[index]?.windows ?? []} person={column.resource.name} editing={editing} onOpenPeriod={onOpenPeriod} />
            </div>
          ))}
        </div>
        <div className={css.timeline}>
          <div className={css.axis}>{ticks.map(time => <span key={time} style={{ top: `${(time - start) / span * 100}%` }}>{calendarClock(time)}</span>)}</div>
          {columns.map((column, index) => {
            const shift = shifts[index]
            const workday = workdays[index]
            const events = relevant(column.resource.id, column.day)
            const periods = shift?.windows ?? []
            const freeStarts = new Set<number>()
            const hitStep = Math.max(30, stepMinutes)
            return (
              <section className={css.column} key={`${column.resource.id}:${column.day}`} aria-label={`${column.resource.name}, ${dateLabel(column.day, { day: 'numeric', month: 'long' })}`}>
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
                {showWorkingHours && !periods.length && <p className={css.dayOff}>{shift?.windows === null ? 'Рабочие часы недоступны' : shift?.closed ? 'Выходной' : 'Нет рабочих часов'}</p>}
                {shift?.exception && <span className={css.exception}>График на эту дату</span>}
                {calendarEventLanes(events).map(({ event, lane, lanes }) => (
                  <button
                    type="button"
                    key={event.id}
                    className={css.visit}
                    data-status={event.status || undefined}
                    data-short={event.end - event.start < 45 || undefined}
                    disabled={editing}
                    style={{ ...position(event.start, event.end), left: `calc(${lane / lanes * 100}% + 6px)`, width: `calc(${100 / lanes}% - 12px)` }}
                    title={`${event.subtitle || event.title} · ${calendarClock(event.start)}–${calendarClock(event.end)} · ${statusNames[event.status] ?? ''}`}
                    aria-label={`Открыть запись: ${event.title}, ${event.subtitle}, ${calendarClock(event.start)}–${calendarClock(event.end)}`}
                    onClick={() => onOpenVisit(event.id)}
                  >
                    <span className={css.visitTime}>{calendarClock(event.start)}–{calendarClock(event.end)}</span>
                    <strong>{event.subtitle || event.title}</strong>
                    {event.subtitle && <small>{event.title}</small>}
                  </button>
                ))}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
