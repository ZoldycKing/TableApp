'use client'
import {
  calendarShift,
  calendarClock,
  type TeamCalendarSnapshot,
  type TeamCalendarEvent,
} from '@/lib/team-calendar-core'
import { ProtoIcon } from '../prototype/icons'
import css from './booking-calendar.module.css'

export const bookingCalendarDateLabel = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('ru-RU', { ...options, timeZone: 'UTC' })

export const bookingCalendarStatusNames: Record<string, string> = {
  booked: 'Записан',
  arrived: 'Пришёл',
  completed: 'Завершено',
  noShow: 'Не пришёл',
  cancelled: 'Отменён',
}

export const bookingCountLabel = (count: number, forms: readonly [string, string, string] = ['запись', 'записи', 'записей']) => {
  const form = count % 10 === 1 && count % 100 !== 11
    ? forms[0]
    : count % 10 >= 2 && count % 10 <= 4 && !(count % 100 >= 12 && count % 100 <= 14)
      ? forms[1]
      : forms[2]
  return `${count} ${form}`
}

export type CalendarAssignDrop = { jobId: string; resourceId: string; day: string; time: string }
export type BookingCalendarViewProps = {
  data: TeamCalendarSnapshot
  resourceId: string
  working: boolean
  editing: boolean
  showWorkingHours?: boolean
  resourcesLabel?: string
  onOpenVisit: (id: string) => void
  onOpenPeriod?: (id: string) => void
  onMove?: (eventId: string, slot: { resourceId: string; day: string; time: string }) => Promise<{ ok: boolean }>
  onAssignDrop?: (slot: CalendarAssignDrop) => void
  compactChips?: boolean
}

const dayName = (day: string) => bookingCalendarDateLabel(day, { weekday: 'long', day: 'numeric', month: 'long' })

const breakKey = (periods: NonNullable<TeamCalendarSnapshot['shifts'][number]['windows']>) => {
  const hours = calendarShift(periods)
  return hours?.breaks.filter(pause => pause.end > pause.start).map(pause => `${pause.start}-${pause.end}`).join('|') ?? ''
}

/** One quiet hours line. Click opens the period; a repeated lunch break stays in the tooltip. */
export function HoursEdit({
  periods, unavailable = false, closed = false, person, editing, onOpenPeriod, usualBreak, className,
}: {
  periods: NonNullable<TeamCalendarSnapshot['shifts'][number]['windows']>
  unavailable?: boolean
  closed?: boolean
  person: string
  editing: boolean
  onOpenPeriod?: (id: string) => void
  usualBreak?: string
  className?: string
}) {
  const hours = calendarShift(periods)
  if (!hours) {
    const label = unavailable ? 'Часы недоступны' : closed ? 'Выходной' : 'Не работает'
    return <span className={className ?? css.hoursQuiet}>{label}</span>
  }
  const range = `${calendarClock(hours.start)}–${calendarClock(hours.end)}`
  const breaks = hours.breaks.filter(pause => pause.end > pause.start)
  const key = breaks.map(pause => `${pause.start}-${pause.end}`).join('|')
  const unusual = Boolean(key && usualBreak !== undefined && key !== usualBreak)
  const breakText = breaks.map(pause => `${calendarClock(pause.start)}–${calendarClock(pause.end)}`).join(', ')
  const hint = [range, breakText ? `перерыв ${breakText}` : '', onOpenPeriod ? 'Изменить часы' : ''].filter(Boolean).join(', ')
  const text = unusual ? `${range} · перерыв ${breakText}` : range
  if (!onOpenPeriod || !periods.length) return <span className={className ?? css.hoursQuiet} title={hint}>{text}</span>
  if (periods.length === 1) {
    const period = periods[0]!
    return <button type="button" className={className ?? css.hoursQuiet} title={hint} disabled={editing} aria-label={`Изменить часы: ${person}, ${calendarClock(period.start)}–${calendarClock(period.end)}`} onClick={() => onOpenPeriod(period.id)}>{text}</button>
  }
  return (
    <details className={css.hoursMenu}>
      <summary className={className ?? css.hoursQuiet} title={hint}>{text}</summary>
      <div>
        {periods.map(period => (
          <button type="button" key={period.id} disabled={editing} aria-label={`Изменить рабочий период: ${person}, ${calendarClock(period.start)}–${calendarClock(period.end)}`} onClick={() => onOpenPeriod(period.id)}>
            {calendarClock(period.start)}–{calendarClock(period.end)}
          </button>
        ))}
      </div>
    </details>
  )
}

export function usualBreakKey(data: TeamCalendarSnapshot, resourceId: string) {
  const keys = data.days.map(day => {
    const shift = data.shifts.find(item => item.resourceId === resourceId && item.day === day)
    if (!shift?.windows?.length || shift.closed) return null
    return breakKey(shift.windows)
  }).filter((key): key is string => key !== null)
  const counts = new Map<string, number>()
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
  let best = ''
  let count = 0
  for (const [key, times] of counts) if (times > count) { best = key; count = times }
  return best
}

function VisitCard({
  event, person, editing, onOpenVisit, agenda = false, draggable = false, compact = false,
}: {
  event: TeamCalendarEvent
  person: string
  editing: boolean
  onOpenVisit: (id: string) => void
  agenda?: boolean
  draggable?: boolean
  compact?: boolean
}) {
  const status = event.statusLabel || bookingCalendarStatusNames[event.status]
  return (
    <button
      type="button"
      className={agenda ? css.agendaVisit : css.weekVisit}
      data-status={event.status || undefined}
      data-compact={compact || undefined}
      draggable={draggable || undefined}
      disabled={editing}
      aria-label={`Открыть запись: ${event.title}, ${person}, ${event.subtitle}, ${calendarClock(event.start)}–${calendarClock(event.end)}`}
      onDragStart={drag => {
        if (!draggable) return
        drag.dataTransfer.setData('text/plain', `dispatch-move|${event.id}|${calendarClock(event.start)}`)
        drag.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => onOpenVisit(event.id)}
    >
      <span className={css.cardTime}>{calendarClock(event.start)}–{calendarClock(event.end)}</span>
      {agenda && <span className={css.cardMaster}><ProtoIcon name="user" size={14} />{person}</span>}
      <strong>{event.title}</strong>
      {event.subtitle && <small>{event.subtitle}</small>}
      {status && <span className={css.cardStatus}>{status}</span>}
    </button>
  )
}

function ShiftInfo({ data, resourceId, day, editing, onOpenPeriod }: { data: TeamCalendarSnapshot; resourceId: string; day: string; editing: boolean; onOpenPeriod?: (id: string) => void }) {
  const shift = data.shifts.find(item => item.resourceId === resourceId && item.day === day)
  const person = data.resources.find(item => item.id === resourceId)?.name ?? ''
  return <HoursEdit periods={shift?.windows ?? []} unavailable={shift?.windows === null} closed={shift?.closed} person={`${person}, ${dayName(day)}`} editing={editing} onOpenPeriod={onOpenPeriod} usualBreak={usualBreakKey(data, resourceId)} />
}

function PersonMark() {
  return <span className={css.avatar} aria-hidden><ProtoIcon name="user" size={16} /></span>
}

/** Every person and every appointment stays visible; the row grows with its busiest day. */
export function BookingWeekOverview({
  data, resourceId, editing, onOpenVisit, onOpenPeriod, onOpenDay, showWorkingHours = true, resourcesLabel = 'Сотрудники',
  onMove, onAssignDrop, compactChips = false,
}: BookingCalendarViewProps & { onOpenDay: (day: string) => void }) {
  const resources = data.resources.filter(item => !resourceId || item.id === resourceId)
  return (
    <div className={css.weekOverview} data-calendar-week>
      <table className={css.weekTable} aria-label={resourcesLabel === 'Мастера' ? 'Неделя всех мастеров' : `Неделя: ${resourcesLabel}`}>
        <colgroup><col className={css.masterColumn} />{data.days.map(day => <col key={day} />)}</colgroup>
        <thead>
          <tr>
            <th scope="col" className={css.weekCorner}>{resourcesLabel}</th>
            {data.days.map(day => (
              <th scope="col" key={day}>
                <button type="button" className={css.openDay} aria-label={`Открыть день: ${dayName(day)}`} onClick={() => onOpenDay(day)}>
                  <span>{bookingCalendarDateLabel(day, { weekday: 'short' })}</span>
                  <strong>{bookingCalendarDateLabel(day, { day: 'numeric', month: 'short' })}</strong>
                  {compactChips ? <b>{data.events.filter(event => event.day === day && event.status !== 'cancelled' && (!resourceId || event.resourceId === resourceId)).length}</b> : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resources.map(person => (
            <tr key={person.id}>
              <th scope="row" className={css.weekMaster}><PersonMark /><strong>{person.name}</strong></th>
              {data.days.map(day => {
                const events = data.events.filter(event => event.resourceId === person.id && event.day === day && event.status !== 'cancelled')
                return (
                  <td key={day}>
                    <section
                      className={css.weekCell}
                      aria-label={`${person.name}, ${dayName(day)}`}
                      onDragOver={drag => {
                        if (!onMove && !onAssignDrop) return
                        if (![...drag.dataTransfer.types].includes('text/plain')) return
                        drag.preventDefault()
                        drag.currentTarget.dataset.drop = 'true'
                      }}
                      onDragLeave={drag => { delete drag.currentTarget.dataset.drop }}
                      onDrop={drag => {
                        delete drag.currentTarget.dataset.drop
                        const text = drag.dataTransfer.getData('text/plain')
                        const move = /^dispatch-move\|([^|]+)\|(\d{2}:\d{2})$/.exec(text)
                        const assign = /^dispatch-job\|(.+)$/.exec(text)
                        if (move && onMove) void onMove(move[1]!, { resourceId: person.id, day, time: move[2]! })
                        if (assign && onAssignDrop) onAssignDrop({ jobId: assign[1]!, resourceId: person.id, day, time: '10:00' })
                      }}
                    >
                      {showWorkingHours && <ShiftInfo data={data} resourceId={person.id} day={day} editing={editing} onOpenPeriod={onOpenPeriod} />}
                      {events.length > 0 && (
                        <div className={css.weekVisits}>
                          {events.map(event => <VisitCard key={event.id} event={event} person={person.name} editing={editing} onOpenVisit={onOpenVisit} draggable={Boolean(onMove) && !editing} compact={compactChips} />)}
                        </div>
                      )}
                    </section>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** On a narrow screen the chosen day is one chronological feed. The date stays in the calendar caption. */
export function BookingDayAgenda({
  data, resourceId, day, working, editing, onOpenVisit, onOpenPeriod, showWorkingHours = true, resourcesLabel = 'Сотрудники', showHeading = false,
}: BookingCalendarViewProps & { day: string; showHeading?: boolean }) {
  const resources = data.resources.filter(item => !resourceId || item.id === resourceId)
  const ids = new Set(resources.map(item => item.id))
  const events = data.events
    .filter(event => event.day === day && ids.has(event.resourceId) && event.status !== 'cancelled')
    .sort((a, b) => a.start - b.start || a.resourceId.localeCompare(b.resourceId))
  return (
    <div className={css.dayAgenda} data-calendar-agenda>
      {showHeading && <h3>{dayName(day)}</h3>}
      <div className={css.roster} aria-label={`${resourcesLabel}: выбранный день`}>
        {resources.map(person => {
          return (
            <div className={css.rosterRow} key={person.id}>
              <PersonMark />
              <strong>{person.name}</strong>
              {showWorkingHours && <ShiftInfo data={data} resourceId={person.id} day={day} editing={editing} onOpenPeriod={working ? onOpenPeriod : undefined} />}
            </div>
          )
        })}
      </div>
      <h4>Записи на день <span>{events.length}</span></h4>
      <div className={css.agendaVisits}>
        {events.map(event => (
          <VisitCard
            key={`${event.id}:${event.resourceId}`}
            event={event}
            person={resources.find(item => item.id === event.resourceId)?.name ?? ''}
            editing={editing}
            onOpenVisit={onOpenVisit}
            agenda
          />
        ))}
      </div>
      {!events.length && <p className={css.agendaEmpty}>На этот день записей пока нет.</p>}
    </div>
  )
}
