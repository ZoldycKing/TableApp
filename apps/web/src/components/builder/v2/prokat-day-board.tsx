'use client'
import { useState } from 'react'
import { instantToWallClock } from '@tableapp/schema'
import { Avatar } from '@/components/ui/avatar'
import { formatMoney, formatProkatDateTime, prokatInstantParts, PROKAT_ZONE, type ProkatCatalogItem, type ProkatListItem } from '@/lib/prokat-logic'
import css from './prokat.module.css'

const OPEN = ['Заявка', 'Подтверждена', 'Выдано', 'Просрочен возврат']
const DAY_START = 8 * 60
const DAY_END = 21 * 60
const SPAN = DAY_END - DAY_START

function minutes(iso: string) {
  const wall = instantToWallClock(iso, PROKAT_ZONE)
  if (!wall?.time) return null
  const [hour, minute] = wall.time.split(':')
  const hours = Number(hour)
  const mins = Number(minute)
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null
  return hours * 60 + mins
}

function dayKey(iso: string) {
  return instantToWallClock(iso, PROKAT_ZONE)?.date ?? ''
}

function toneOf(status: string) {
  if (status === 'Заявка') return 'wait'
  if (status === 'Просрочен возврат') return 'bad'
  if (status === 'Возвращено' || status === 'Отменена' || status === 'Не забрали') return 'past'
  return 'ok'
}

export function ProkatDayBoard({
  day, now, items, bookings, onOpen, onCreate,
}: {
  day: string
  now: number
  items: readonly ProkatCatalogItem[]
  bookings: readonly ProkatListItem[]
  onOpen: (id: string) => void
  onCreate: (itemId: string, day: string) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const today = dayKey(new Date(now).toISOString()) === day
  const nowMinutes = today ? minutes(new Date(now).toISOString()) : null
  const active = bookings.filter(booking => OPEN.includes(booking.status) && dayKey(booking.from) <= day && dayKey(booking.to) >= day)
  const waiting = active.filter(booking => booking.status === 'Заявка').length
  const sum = active.reduce((total, booking) => total + booking.price, 0)
  const columns = items.filter(item => item.name)
  const freeCount = columns.filter(item => !active.some(booking => booking.itemIds.includes(item.id))).length
  const chosen = active.find(booking => booking.id === selected) ?? null
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, index) => DAY_START + index * 60)

  return <div className={css.dayBoard}>
    <div className={css.daySummary} aria-label="Сводка дня">
      <div><small>Записей</small><b>{active.length}</b></div>
      <div><small>Свободно</small><b>{freeCount}</b></div>
      <div><small>Ждут</small><b>{waiting}</b></div>
      <div><small>Сумма</small><b>{formatMoney(sum)}</b></div>
    </div>
    <div className={css.dayLayout} data-open={chosen ? true : undefined}>
      <div className={css.dayColumns}>
        <div className={css.dayHours} aria-hidden="true">
          {hours.map(minute => <span key={minute} style={{ top: `${((minute - DAY_START) / SPAN) * 100}%` }}>{String(Math.floor(minute / 60)).padStart(2, '0')}:00</span>)}
          {nowMinutes != null && nowMinutes >= DAY_START && nowMinutes <= DAY_END ? <b className={css.dayNowLabel} style={{ top: `calc(${((nowMinutes - DAY_START) / SPAN) * 100}% )` }}>сейчас</b> : null}
        </div>
        <div className={css.dayScroll}>
          {columns.map(item => {
            const mine = active.filter(booking => booking.itemIds.includes(item.id))
            const blocks = mine.map(booking => {
              const crosses = dayKey(booking.from) < day || dayKey(booking.to) > day
              const start = crosses ? DAY_START + 60 : Math.max(DAY_START, minutes(booking.from) ?? DAY_START)
              const end = crosses ? start + 90 : Math.min(DAY_END, minutes(booking.to) ?? start + 60)
              return { booking, top: (start - DAY_START) / SPAN, height: Math.min(0.18, Math.max(0.08, (end - start) / SPAN)) }
            })
            const covered = blocks.some(block => block.height > 0.2)
            return <section key={item.id} className={css.dayColumn} aria-label={item.name}>
              <header>
                <Avatar id={item.id} size={22} />
                <strong>{item.name}</strong>
                <small>{item.serial}</small>
              </header>
              <div className={css.dayTrack}>
                {nowMinutes != null && nowMinutes >= DAY_START && nowMinutes <= DAY_END ? (
                  <i className={css.dayNow} style={{ top: `${((nowMinutes - DAY_START) / SPAN) * 100}%` }} />
                ) : null}
                {blocks.map(block => (
                  <button
                    key={block.booking.id}
                    type="button"
                    className={css.dayVisit}
                    data-tone={toneOf(block.booking.status)}
                    data-on={selected === block.booking.id || undefined}
                    style={{ top: `${block.top * 100}%`, height: `${block.height * 100}%` }}
                    onClick={() => setSelected(block.booking.id)}
                  >
                    <Avatar id={block.booking.clientEmail || block.booking.id} size={16} />
                    <span>{block.booking.clientName || 'Без клиента'}</span>
                    <small>{prokatInstantParts(block.booking.from).time || '12:00'}</small>
                  </button>
                ))}
                {!covered ? <button type="button" className={css.dayFree} onClick={() => onCreate(item.id, day)}>+ Свободно</button> : null}
              </div>
            </section>
          })}
        </div>
      </div>
      {chosen ? <aside className={css.dayDetail} aria-label="Выбранная запись">
          <header>
            <Avatar id={chosen.clientEmail || chosen.id} size={36} />
            <div>
              <strong>{chosen.clientName || 'Без клиента'}</strong>
              <small>{chosen.title}</small>
            </div>
            <em data-tone={toneOf(chosen.status)}>{chosen.status}</em>
          </header>
          <dl>
            <div><dt>Когда</dt><dd>{formatProkatDateTime(chosen.from)} — {formatProkatDateTime(chosen.to)}</dd></div>
            <div><dt>Сумма</dt><dd>{formatMoney(chosen.price)}</dd></div>
            <div><dt>Залог</dt><dd>{formatMoney(chosen.deposit)}</dd></div>
            {chosen.statusReason ? <div><dt>Заметка</dt><dd>{chosen.statusReason}</dd></div> : null}
          </dl>
          <button type="button" className={css.primary} onClick={() => onOpen(chosen.id)}>Открыть запись</button>
          <p className={css.quiet}>{day.split('-').reverse().join('.')}</p>
      </aside> : null}
    </div>
    {chosen ? null : <p className={css.quiet}>Выберите запись в колонке. Свободный час — «+ Свободно».</p>}
  </div>
}
