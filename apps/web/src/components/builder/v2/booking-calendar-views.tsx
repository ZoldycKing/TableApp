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

export type BookingCalendarViewProps = {
  data: TeamCalendarSnapshot
  resourceId: string
  working: boolean
  editing: boolean
  showWorkingHours?: boolean
  resourcesLabel?: string
  onOpenVisit: (id: string) => void
  onOpenPeriod?: (id: string) => void
}

const dayName = (day: string) => bookingCalendarDateLabel(day, { weekday: 'long', day: 'numeric', month: 'long' })

export function BookingPeriodChoice({
  periods, person, editing, onOpenPeriod,
}: {
  periods: NonNullable<TeamCalendarSnapshot['shifts'][number]['windows']>
  person: string
  editing: boolean
  onOpenPeriod?: (id: string) => void
}) {
  if (!onOpenPeriod || !periods.length) return null
  if (periods.length === 1) {
    const period = periods[0]!
    return (
      <button type="button" className={css.periodButton} disabled={editing} aria-label={`Изменить рабочий период: ${person}, ${calendarClock(period.start)}–${calendarClock(period.end)}`} onClick={() => onOpenPeriod(period.id)}>
        <ProtoIcon name="edit" size={14} />
        <span>Часы</span>
      </button>
    )
  }
  return (
    <details className={css.periodChoice}>
      <summary>Изменить часы<span className="sr-only">: {person}</span></summary>
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

function VisitCard({
  event, person, editing, onOpenVisit, agenda = false,
}: {
  event: TeamCalendarEvent
  person: string
  editing: boolean
  onOpenVisit: (id: string) => void
  agenda?: boolean
}) {
  const status = event.statusLabel || bookingCalendarStatusNames[event.status]
  return (
    <button
      type="button"
      className={agenda ? css.agendaVisit : css.weekVisit}
      data-status={event.status || undefined}
      disabled={editing}
      aria-label={`Открыть запись: ${event.title}, ${person}, ${event.subtitle}, ${calendarClock(event.start)}–${calendarClock(event.end)}`}
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

function ShiftInfo({ data, resourceId, day }: { data: TeamCalendarSnapshot; resourceId: string; day: string }) {
  const shift = data.shifts.find(item => item.resourceId === resourceId && item.day === day)
  const hours = calendarShift(shift?.windows ?? [])
  if (!hours) {
    const label = shift?.windows === null ? 'Часы недоступны' : shift?.closed ? 'Выходной' : 'Нет смены'
    return <div className={css.shiftInfo}><span>{label}</span></div>
  }
  return (
    <div className={css.shiftInfo} data-working="true">
      <span><b>{calendarClock(hours.start)}–{calendarClock(hours.end)}</b></span>
      {hours.breaks.filter(pause => pause.end > pause.start).map(pause => (
        <small key={pause.start}>перерыв {calendarClock(pause.start)}–{calendarClock(pause.end)}</small>
      ))}
    </div>
  )
}

function PersonMark() {
  return <span className={css.avatar} aria-hidden><ProtoIcon name="user" size={16} /></span>
}

/** Every person and every appointment stays visible; the row grows with its busiest day. */
export function BookingWeekOverview({
  data, resourceId, editing, onOpenVisit, onOpenPeriod, onOpenDay, showWorkingHours = true, resourcesLabel = 'Сотрудники',
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
                const periods = data.shifts.find(shift => shift.resourceId === person.id && shift.day === day)?.windows ?? []
                return (
                  <td key={day}>
                    <section className={css.weekCell} aria-label={`${person.name}, ${dayName(day)}`}>
                      {showWorkingHours && <ShiftInfo data={data} resourceId={person.id} day={day} />}
                      <BookingPeriodChoice periods={periods} person={`${person.name}, ${dayName(day)}`} editing={editing} onOpenPeriod={onOpenPeriod} />
                      {events.length > 0 && (
                        <div className={css.weekVisits}>
                          {events.map(event => <VisitCard key={event.id} event={event} person={person.name} editing={editing} onOpenVisit={onOpenVisit} />)}
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
          const periods = data.shifts.find(shift => shift.resourceId === person.id && shift.day === day)?.windows ?? []
          return (
            <div className={css.rosterRow} key={person.id}>
              <PersonMark />
              <strong>{person.name}</strong>
              {showWorkingHours && <ShiftInfo data={data} resourceId={person.id} day={day} />}
              {working && <BookingPeriodChoice periods={periods} person={person.name} editing={editing} onOpenPeriod={onOpenPeriod} />}
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
