'use client'
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties } from 'react'
import { instantToWallClock } from '@tableapp/schema'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { bookingCalendarDays, bookingCalendarShift, bookingClock, bookingVisitLanes, type BookingCalendarRequest, type BookingCalendarResult, type BookingCalendarSnapshot } from '@/lib/builder-v2-booking-calendar'
import { usePublishedV2 } from './published-context'
import { ListScreenShell } from './layout-shell'
import { ProtoIcon } from '../prototype/icons'
import styles from '../prototype/prototype.module.css'
import css from './booking-calendar.module.css'

export const BookingCalendarDemoContext = createContext<((request: BookingCalendarRequest) => BookingCalendarResult) | null>(null)
const dateLabel = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00Z`).toLocaleDateString('ru-RU', { ...options, timeZone: 'UTC' })
const money = (value: number) => `${value.toLocaleString('ru-RU')} ₽`
const statusNames: Record<string, string> = { booked: 'Записан', arrived: 'Пришёл', completed: 'Завершено', noShow: 'Не пришёл', cancelled: 'Отменён' }

function useCalendar(app: AppV2, request: BookingCalendarRequest) {
  const demo = useContext(BookingCalendarDemoContext), published = usePublishedV2()
  const [retry, setRetry] = useState(0)
  const key = JSON.stringify([app, request, published?.revision, published?.dataVersion, retry])
  const [state, setState] = useState<{ key: string; result: BookingCalendarResult }>()
  useEffect(() => {
    let cancelled = false
    const read = async () => {
      if (demo) return demo(request)
      const actions = await import('@/app/builder-v2-booking-actions')
      return published ? actions.readPublishedV2BookingCalendarAction(published.slug, { ...request, revision: published.revision }) : actions.readBuilderV2BookingCalendarAction(app.id, app, request)
    }
    void read().then(result => { if (!cancelled) setState({ key, result }) }).catch(() => { if (!cancelled) setState({ key, result: { ok: false, error: 'Не удалось загрузить календарь. Попробуйте ещё раз.' } }) })
    return () => { cancelled = true }
  }, [key])
  return { result: state?.key === key ? state.result : undefined, retry: () => setRetry(value => value + 1) }
}

export function BookingCalendarScreen({ app, screenId, timeZone, working = false, onOpenVisit, onOpenPeriod, onAdd, editing = false }: {
  app: AppV2; screenId: string; timeZone: string; working?: boolean; editing?: boolean
  onOpenVisit: (id: string) => void; onOpenPeriod?: (id: string) => void; onAdd?: () => void
}) {
  const today = instantToWallClock(new Date(), timeZone)!.date
  const [day, setDay] = useState(today), [week, setWeek] = useState(working), [master, setMaster] = useState(''), [compact, setCompact] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const { result, retry } = useCalendar(app, { screenId, day, week })
  useEffect(() => {
    const element = root.current
    if (!element) return
    const observer = new ResizeObserver(entries => setCompact((entries[0]?.contentRect.width ?? 0) < 700))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const data = result?.ok ? result.data : undefined
  const selectedMaster = data?.masters.some(item => item.id === master) ? master : ''
  const effectiveMaster = selectedMaster || (compact || week ? data?.masters[0]?.id ?? '' : '')
  const visibleVisits = data?.visits.filter(visit => !effectiveMaster || visit.masterId === effectiveMaster) ?? []
  const shiftDate = (direction: number) => {
    const next = new Date(`${day}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + direction * (week ? 7 : 1)); setDay(next.toISOString().slice(0, 10))
  }
  const range = week ? bookingCalendarDays(day, true) : [day]
  const periodLabel = week ? `${dateLabel(range[0]!, { day: 'numeric', month: 'short' })} — ${dateLabel(range[6]!, { day: 'numeric', month: 'short', year: 'numeric' })}` : dateLabel(day, { weekday: 'long', day: 'numeric', month: 'long' })
  return <div ref={root} className={css.root} data-booking-calendar data-working={working || undefined} data-compact={compact || undefined}>
    <ListScreenShell title={working ? 'Рабочее время' : 'Расписание'} meta={working ? 'График мастеров и записи клиентов' : 'Рабочие часы и записи мастеров'} actions={onAdd && <button type="button" className={styles.primary} onClick={onAdd}><ProtoIcon name="plus" />{working ? 'Настроить график' : 'Добавить запись'}</button>}
      metrics={!working && data ? [
        { key: 'visits', caption: week ? 'Записи за неделю' : 'Записи за день', value: visibleVisits.filter(visit => visit.status !== 'cancelled').length, icon: <ProtoIcon name="calendar" size={16} /> },
        { key: 'noShow', caption: 'Неявки', value: visibleVisits.filter(visit => visit.status === 'noShow').length, icon: <ProtoIcon name="users" size={16} /> },
        { key: 'amount', caption: 'Стоимость записей', value: money(visibleVisits.filter(visit => !['cancelled', 'noShow'].includes(visit.status)).reduce((sum, visit) => sum + (visit.price ?? 0), 0)), icon: <ProtoIcon name="chart" size={16} />, wide: true },
      ] : undefined} metricLayout="cards"
      search={<div className={css.controls}>
        <div className={css.mode} role="group" aria-label="Период календаря"><button type="button" aria-pressed={!week} onClick={() => setWeek(false)}>День</button><button type="button" aria-pressed={week} onClick={() => setWeek(true)}>Неделя</button></div>
        <div className={css.dateControls}><button type="button" aria-label={week ? 'Предыдущая неделя' : 'Предыдущий день'} onClick={() => shiftDate(-1)}><ProtoIcon name="back" size={17} /></button><label><span className="sr-only">Дата календаря</span><input type="date" aria-label="Дата календаря" value={day} onChange={event => { if (event.target.value) setDay(event.target.value) }} /></label><button type="button" aria-label={week ? 'Следующая неделя' : 'Следующий день'} onClick={() => shiftDate(1)}><ProtoIcon name="arrow" size={17} /></button></div>
        <button type="button" className={css.today} onClick={() => setDay(today)}>Сегодня</button>
        <label className={css.master}><span className="sr-only">Мастер календаря</span><select aria-label="Мастер календаря" value={effectiveMaster} onChange={event => setMaster(event.target.value)}>{!compact && !week && <option value="">Все мастера</option>}{data?.masters.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      </div>}>
      <div className={css.caption}><h2>{periodLabel}</h2><span>Время студии · {new Intl.DateTimeFormat('ru-RU', { timeZone: data?.timeZone ?? timeZone, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value.replace('GMT', 'UTC')}</span></div>
      {week && <nav className={css.mobileDays} aria-label="День недели">{range.map(date => <button type="button" key={date} aria-pressed={date === day} onClick={() => setDay(date)}><span>{dateLabel(date, { weekday: 'short' })}</span><strong>{dateLabel(date, { day: 'numeric' })}</strong></button>)}</nav>}
      {!result ? <p className={css.feedback} role="status">Загружаем календарь…</p> : !result.ok ? <div className={css.feedback} role="alert"><p>{result.error}</p><button type="button" className={styles.secondary} onClick={retry}>Повторить загрузку</button></div> : !data?.masters.length ? <p className={css.feedback}>Сначала добавьте мастера в разделе «Мастера».</p> : <>
        <CalendarGrid data={data} day={day} week={week} compact={compact} masterId={effectiveMaster} working={working} editing={editing} onOpenVisit={onOpenVisit} onOpenPeriod={onOpenPeriod} />
        <div className={css.legend}><span><i data-kind="hours" />Рабочая смена</span><span><i data-kind="visit" />Запись клиента</span><span><i />Перерыв или не работает</span></div>
        {visibleVisits.some(visit => visit.status === 'cancelled') && <div className={css.cancelled}><strong>Отменённые записи</strong>{visibleVisits.filter(visit => visit.status === 'cancelled').map(visit => <button key={visit.id} type="button" onClick={() => onOpenVisit(visit.id)}>{bookingClock(visit.start)} · {visit.service}{visit.client ? ` · ${visit.client}` : ''}</button>)}</div>}
      </>}
    </ListScreenShell>
  </div>
}

function CalendarGrid({ data, day, week, compact, masterId, working, editing, onOpenVisit, onOpenPeriod }: {
  data: BookingCalendarSnapshot; day: string; week: boolean; compact: boolean; masterId: string; working: boolean; editing: boolean
  onOpenVisit: (id: string) => void; onOpenPeriod?: (id: string) => void
}) {
  const masters = data.masters.filter(master => !masterId || master.id === masterId)
  const columns = week ? (compact ? [day] : data.days).map(date => ({ day: date, master: masters[0]! })) : masters.map(master => ({ day, master }))
  const relevant = (masterId: string, date: string) => data.visits.filter(visit => visit.masterId === masterId && visit.day === date && visit.status !== 'cancelled')
  const active = columns.flatMap(column => relevant(column.master.id, column.day))
  const shifts = columns.map(column => data.shifts.find(shift => shift.masterId === column.master.id && shift.day === column.day)!)
  const workdays = shifts.map(shift => bookingCalendarShift(shift.windows ?? []))
  const windows = shifts.flatMap(shift => shift.windows ?? [])
  const start = Math.max(0, Math.floor(Math.min(8 * 60, ...windows.map(window => window.start - 60), ...active.map(visit => visit.start - 60)) / 60) * 60)
  const end = Math.min(1440, Math.ceil(Math.max(20 * 60, ...windows.map(window => window.end + 60), ...active.map(visit => visit.end + 60)) / 60) * 60)
  const span = end - start, height = span / 60 * 56
  const ticks = Array.from({ length: span / 60 + 1 }, (_, index) => start + index * 60)
  const position = (from: number, to: number): CSSProperties => ({ top: `${(from - start) / span * 100}%`, height: `${(Math.min(to, end) - from) / span * 100}%` })
  return <div className={css.calendar} style={{ '--calendar-columns': columns.length, '--calendar-height': `${height}px` } as CSSProperties} aria-label="Календарь рабочих часов и записей">
    <div className={css.head}><span className={css.axisHead}>Время</span>{columns.map((column, index) => <div className={css.columnHead} key={`${column.master.id}:${column.day}`}>{!week && <span className={css.avatar} aria-hidden>{column.master.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('')}</span>}<strong>{week ? dateLabel(column.day, { weekday: 'short', day: 'numeric', month: 'short' }) : column.master.name}</strong><small>{week ? column.master.name : dateLabel(column.day, { day: 'numeric', month: 'long' })}</small><span className={css.shiftSummary} data-working={Boolean(workdays[index]) || undefined}>{workdays[index] ? <><span>Работает</span><b>{bookingClock(workdays[index]!.start)}–{bookingClock(workdays[index]!.end)}</b></> : shifts[index]!.windows === null ? 'Часы недоступны' : 'Не работает'}</span></div>)}</div>
    <div className={css.timeline}><div className={css.axis}>{ticks.map(time => <span key={time} style={{ top: `${(time - start) / span * 100}%` }}>{bookingClock(time)}</span>)}</div>{columns.map((column, index) => {
      const shift = shifts[index]!, workday = workdays[index], visits = relevant(column.master.id, column.day), periods = shift.windows ?? []
      return <section className={css.column} key={`${column.master.id}:${column.day}`} aria-label={`${column.master.name}, ${dateLabel(column.day, { day: 'numeric', month: 'long' })}`}>
        {ticks.slice(0, -1).map(time => <span aria-hidden className={css.line} key={time} style={{ top: `${(time - start) / span * 100}%` }} />)}
        {workday && <div className={css.shiftOutline} data-calendar-shift aria-hidden style={position(workday.start, workday.end)} />}
        {working && onOpenPeriod && periods.map((window, windowIndex) => <button type="button" className={css.hours} key={`${window.id}:${windowIndex}`} style={position(window.start, window.end)} aria-label={`Изменить рабочий период: ${column.master.name}, ${dateLabel(column.day, { day: 'numeric', month: 'long' })}, ${bookingClock(window.start)}–${bookingClock(window.end)}`} title={`Изменить часы ${bookingClock(window.start)}–${bookingClock(window.end)}`} disabled={editing} onClick={() => onOpenPeriod(window.id)}><span>Изменить часы</span></button>)}
        {workday?.breaks.map(pause => <span className={css.break} key={`break-${pause.start}`} style={position(pause.start, pause.end)}><strong>Перерыв</strong><span>{bookingClock(pause.start)}–{bookingClock(pause.end)}</span></span>)}
        {!periods.length && <p className={css.dayOff}>{shift.windows === null ? 'Рабочие часы недоступны' : shift.closed ? 'Выходной' : 'Нет рабочих часов'}</p>}
        {shift.exception && <span className={css.exception}>График на эту дату</span>}
        {bookingVisitLanes(visits).map(({ visit, lane, lanes }) => <button type="button" key={visit.id} className={css.visit} data-status={visit.status || undefined} data-short={visit.end - visit.start < 90 || undefined} disabled={editing} style={{ ...position(visit.start, visit.end), left: `calc(${lane / lanes * 100}% + 6px)`, width: `calc(${100 / lanes}% - 12px)` }} title={`${bookingClock(visit.start)}–${bookingClock(visit.end)} · ${visit.service} · ${visit.client} · ${statusNames[visit.status] ?? ''}`} aria-label={`Открыть запись: ${visit.service}, ${visit.client}, ${bookingClock(visit.start)}–${bookingClock(visit.end)}`} onClick={() => onOpenVisit(visit.id)}><span className={css.visitTime}>{bookingClock(visit.start)}–{bookingClock(visit.end)}</span><strong>{visit.service}</strong>{visit.client && <small>{visit.client}</small>}<span className={css.status}>{statusNames[visit.status] ?? ''}</span></button>)}
      </section>
    })}</div>
  </div>
}
