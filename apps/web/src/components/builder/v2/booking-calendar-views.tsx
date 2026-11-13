'use client'
import type { BookingCalendarSnapshot, BookingCalendarVisit } from '@/lib/builder-v2-booking-calendar'
import { bookingCalendarShift, bookingClock } from '@/lib/builder-v2-booking-calendar'
import css from './booking-calendar.module.css'

export const bookingCalendarDateLabel = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00Z`).toLocaleDateString('ru-RU', { ...options, timeZone: 'UTC' })
export const bookingCalendarStatusNames: Record<string, string> = { booked: 'Записан', arrived: 'Пришёл', completed: 'Завершено', noShow: 'Не пришёл', cancelled: 'Отменён' }
export type BookingCalendarViewProps = {
  data: BookingCalendarSnapshot; masterId: string; working: boolean; editing: boolean
  onOpenVisit: (id: string) => void; onOpenPeriod?: (id: string) => void
}
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('')
const dayName = (day: string) => bookingCalendarDateLabel(day, { weekday: 'long', day: 'numeric', month: 'long' })

function VisitCard({ visit, master, editing, onOpenVisit, agenda = false }: {
  visit: BookingCalendarVisit; master: string; editing: boolean; onOpenVisit: (id: string) => void; agenda?: boolean
}) {
  return <button type="button" className={agenda ? css.agendaVisit : css.weekVisit} data-status={visit.status || undefined} disabled={editing}
    aria-label={`Открыть запись: ${visit.service}, ${master}, ${visit.client}, ${bookingClock(visit.start)}–${bookingClock(visit.end)}`} onClick={() => onOpenVisit(visit.id)}>
    <span className={css.cardTime}>{bookingClock(visit.start)}–{bookingClock(visit.end)}</span>
    {agenda && <span className={css.cardMaster}><span className={css.miniAvatar} aria-hidden>{initials(master)}</span>{master}</span>}
    <strong>{visit.service}</strong>
    {visit.client && <small>{visit.client}</small>}
    {bookingCalendarStatusNames[visit.status] && <span className={css.cardStatus}>{bookingCalendarStatusNames[visit.status]}</span>}
  </button>
}

function ShiftInfo({ data, masterId, day }: { data: BookingCalendarSnapshot; masterId: string; day: string }) {
  const shift = data.shifts.find(item => item.masterId === masterId && item.day === day)
  const hours = bookingCalendarShift(shift?.windows ?? [])
  return <div className={css.shiftInfo} data-working={Boolean(hours) || undefined}>
    {hours ? <><span>Работает <b>{bookingClock(hours.start)}–{bookingClock(hours.end)}</b></span>{hours.breaks.map(pause => <small key={pause.start}>Перерыв <span>{bookingClock(pause.start)}–{bookingClock(pause.end)}</span></small>)}</> : <span>{shift?.windows === null ? 'Часы недоступны' : shift?.closed ? 'Выходной' : 'Нет рабочих часов'}</span>}
  </div>
}

/** Every master and every appointment stays visible; the row grows with its busiest day. */
export function BookingWeekOverview({ data, masterId, editing, onOpenVisit, onOpenDay }: BookingCalendarViewProps & { onOpenDay: (day: string) => void }) {
  const masters = data.masters.filter(master => !masterId || master.id === masterId)
  return <div className={css.weekOverview} data-calendar-week>
    <table className={css.weekTable} aria-label="Неделя всех мастеров">
      <colgroup><col className={css.masterColumn} />{data.days.map(day => <col key={day} />)}</colgroup>
      <thead><tr><th scope="col" className={css.weekCorner}>Мастера</th>{data.days.map(day => <th scope="col" key={day}><button type="button" className={css.openDay} aria-label={`Открыть день: ${dayName(day)}`} onClick={() => onOpenDay(day)}><span>{bookingCalendarDateLabel(day, { weekday: 'short' })}</span><strong>{bookingCalendarDateLabel(day, { day: 'numeric', month: 'short' })}</strong></button></th>)}</tr></thead>
      <tbody>{masters.map(master => <tr key={master.id}>
        <th scope="row" className={css.weekMaster}><span className={css.avatar} aria-hidden>{initials(master.name)}</span><strong>{master.name}</strong></th>
        {data.days.map(day => {
          const visits = data.visits.filter(visit => visit.masterId === master.id && visit.day === day && visit.status !== 'cancelled')
          return <td key={day}><section className={css.weekCell} aria-label={`${master.name}, ${dayName(day)}`}>
            <ShiftInfo data={data} masterId={master.id} day={day} />
            <div className={css.weekVisits}>{visits.map(visit => <VisitCard key={visit.id} visit={visit} master={master.name} editing={editing} onOpenVisit={onOpenVisit} />)}</div>
            {!visits.length && <span className={css.noVisits}>Нет записей</span>}
          </section></td>
        })}
      </tr>)}</tbody>
    </table>
  </div>
}

/** On small screens the chosen day's appointments form one chronological feed for the whole team. */
export function BookingDayAgenda({ data, masterId, day, working, editing, onOpenVisit, onOpenPeriod }: BookingCalendarViewProps & { day: string }) {
  const masters = data.masters.filter(master => !masterId || master.id === masterId)
  const ids = new Set(masters.map(master => master.id))
  const visits = data.visits.filter(visit => visit.day === day && ids.has(visit.masterId) && visit.status !== 'cancelled').sort((a, b) => a.start - b.start || a.masterId.localeCompare(b.masterId))
  return <div className={css.dayAgenda} data-calendar-agenda>
    <h3>{dayName(day)}</h3>
    <div className={css.roster} aria-label="График мастеров на день">{masters.map(master => {
      const periods = data.shifts.find(shift => shift.masterId === master.id && shift.day === day)?.windows ?? []
      return <div className={css.rosterRow} key={master.id}>
        <span className={css.avatar} aria-hidden>{initials(master.name)}</span><strong>{master.name}</strong>
        <ShiftInfo data={data} masterId={master.id} day={day} />
        {working && onOpenPeriod && periods.length > 0 && <details className={css.periodChoice}><summary>Изменить часы<span className="sr-only">: {master.name}</span></summary><div>{periods.map(period => <button type="button" key={period.id} disabled={editing} aria-label={`Изменить рабочий период: ${master.name}, ${bookingClock(period.start)}–${bookingClock(period.end)}`} onClick={() => onOpenPeriod(period.id)}>{bookingClock(period.start)}–{bookingClock(period.end)}</button>)}</div></details>}
      </div>
    })}</div>
    <h4>Записи на день <span>{visits.length}</span></h4>
    <div className={css.agendaVisits}>{visits.map(visit => <VisitCard key={visit.id} visit={visit} master={masters.find(master => master.id === visit.masterId)?.name ?? ''} editing={editing} onOpenVisit={onOpenVisit} agenda />)}</div>
    {!visits.length && <p className={css.agendaEmpty}>На этот день записей пока нет.</p>}
  </div>
}
