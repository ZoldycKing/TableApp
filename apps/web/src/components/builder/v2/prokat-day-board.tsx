'use client'
import { useEffect, useMemo, useState } from 'react'
import { ProtoIcon } from '../prototype/icons'
import { Avatar } from '@/components/ui/avatar'
import { formatMoney, PROKAT_TIMELINE_RANGES, type ProkatCatalogItem, type ProkatListItem, type ProkatTimelineRangeId } from '@/lib/prokat-logic'
import {
  buildProkatDaySchedule, PROKAT_SCHEDULE_DAY, scheduleClockLabel, SCHEDULE_DAY_END, SCHEDULE_DAY_START, SCHEDULE_NOW_MIN,
  visibleGaps, type ScheduleBlock, type ScheduleColumn, type ScheduleTone,
} from '@/lib/prokat-day-demo'
import css from './prokat.module.css'

const HOURS = Array.from({ length: (SCHEDULE_DAY_END - SCHEDULE_DAY_START) / 60 + 1 }, (_, index) => SCHEDULE_DAY_START + index * 60)

function toneOf(status: string, endMin: number, nowMin: number): ScheduleTone {
  if (status === 'Заявка') return 'w'
  if (endMin <= nowMin) return 'p'
  return 'a'
}

function minutesOf(iso: string) {
  const time = iso.match(/T(\d{2}):(\d{2})/)
  if (!time) return null
  return Number(time[1]) * 60 + Number(time[2])
}

function dayOf(iso: string) {
  return iso.slice(0, 10)
}

function blocksFromBookings(items: readonly ProkatCatalogItem[], bookings: readonly ProkatListItem[], day: string, nowMin: number): ScheduleBlock[] {
  const open = ['Заявка', 'Подтверждена', 'Выдано', 'Просрочен возврат']
  return bookings.flatMap(booking => {
    if (!open.includes(booking.status)) return []
    if (dayOf(booking.from) > day || dayOf(booking.to) < day) return []
    const itemId = booking.itemIds.find(id => items.some(item => item.id === id))
    if (!itemId) return []
    const start = dayOf(booking.from) < day ? SCHEDULE_DAY_START : Math.max(SCHEDULE_DAY_START, minutesOf(booking.from) ?? SCHEDULE_DAY_START)
    const end = dayOf(booking.to) > day ? SCHEDULE_DAY_END : Math.min(SCHEDULE_DAY_END, minutesOf(booking.to) ?? start + 60)
    if (end <= start) return []
    const item = items.find(entry => entry.id === itemId)
    return [{
      id: booking.id,
      itemId,
      title: booking.clientName || 'Без клиента',
      service: item?.name || booking.title,
      startMin: start,
      endMin: end,
      tone: toneOf(booking.status, end, nowMin),
      oneLine: end - start <= 45,
      clientName: booking.clientName,
      phone: '',
      visits: 1,
      price: booking.price,
      deposit: booking.deposit,
      source: 'Кабинет',
      note: booking.statusReason ?? '',
      history: [],
    }]
  })
}

function weekday(day: string) {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  const label = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', timeZone: 'Europe/Moscow' }).format(new Date(Date.UTC(year, month - 1, date, 9, 0)))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function dateLabel(day: string) {
  const [, month, date] = day.split('-')
  return `${weekday(day)}, ${date}.${month}.${day.slice(0, 4)}`
}

function visitLabel(count: number) {
  return `${count}-й визит`
}

function hoursLabel(value: number) {
  const n = Math.max(1, Math.round(value || 1))
  const mod10 = n % 10
  const mod100 = n % 100
  const word = mod10 === 1 && mod100 !== 11 ? 'час' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'часа' : 'часов'
  return `около ${n} ${word}`
}

export function ProkatDayBoard({
  day, nowMin = SCHEDULE_NOW_MIN, items, bookings, sample, phone, mode, onMode, onShift, onToday, onCreate, onOpen,
}: {
  day: string
  nowMin?: number
  items: readonly ProkatCatalogItem[]
  bookings: readonly ProkatListItem[]
  sample: boolean
  phone: boolean
  mode: ProkatTimelineRangeId
  onMode: (mode: ProkatTimelineRangeId) => void
  onShift: (direction: -1 | 1) => void
  onToday: () => void
  onCreate: (itemId: string, day: string) => void
  onOpen: (id: string) => void
}) {
  const demo = useMemo(() => sample && day === PROKAT_SCHEDULE_DAY ? buildProkatDaySchedule(items) : null, [sample, day, items])
  const columns: ScheduleColumn[] = demo?.columns ?? items.filter(item => item.name && item.status !== 'Списан').map(item => ({ ...item, off: item.status === 'На обслуживании' }))
  const blocks = demo?.blocks ?? blocksFromBookings(columns, bookings, day, nowMin)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => {
    if (!phone) setSelectedId(demo?.selectedId ?? null)
  }, [phone, demo?.selectedId])
  const [arrived, setArrived] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [pickOpen, setPickOpen] = useState(false)
  const shown = focusId ? columns.filter(column => column.id === focusId) : columns
  const phoneColumn = phone ? (shown.find(column => column.id === focusId) ?? shown[0] ?? null) : null
  const gridColumns = phone && phoneColumn ? [phoneColumn] : shown
  const selected = blocks.find(block => block.id === selectedId) ?? null
  const gaps = visibleGaps(columns, blocks)
  const counted = blocks.filter(block => block.tone !== 'br')
  const waiting = counted.filter(block => block.tone === 'w').length
  const revenue = counted.reduce((sum, block) => sum + block.price, 0)
  const freeHours = gaps.reduce((sum, gap) => sum + (gap.endMin - gap.startMin) / 60, 0)
  const showNow = day === PROKAT_SCHEDULE_DAY || (!sample && nowMin >= SCHEDULE_DAY_START && nowMin <= SCHEDULE_DAY_END)
  const nowTop = ((nowMin - SCHEDULE_DAY_START) / (SCHEDULE_DAY_END - SCHEDULE_DAY_START)) * 100
  const hourPx = phone ? 44 : 51

  const place = (start: number, end: number) => ({
    top: `${((start - SCHEDULE_DAY_START) / 60) * hourPx}px`,
    height: `${Math.max(phone ? 22 : 26, ((end - start) / 60) * hourPx - 2)}px`,
  })

  return <div className={css.dayBoard} data-phone={phone || undefined}>
    <div className={css.daySummary} data-cols={phone ? 3 : 4} aria-label="Сводка дня">
      <div><small>Записей сегодня</small><b>{counted.length}{demo ? <i className={css.dayUp}>+{demo.delta} к прошлой пятнице</i> : null}</b></div>
      <div><small>Свободных окон</small><b>{gaps.length}<i>{hoursLabel(freeHours)}</i></b></div>
      <div><small>Ждут подтверждения</small><b>{waiting}</b></div>
      {phone ? null : <div><small>Выручка по записям</small><b>{formatMoney(revenue)}</b></div>}
    </div>
    <div className={css.dayToolbar}>
      <div className={css.dayDate}>
        <button type="button" className={css.dayIcon} aria-label="Назад" onClick={() => onShift(-1)}><ProtoIcon name="back" size={16} /></button>
        <button type="button" className={css.dayIcon} aria-label="Вперёд" onClick={() => onShift(1)}><ProtoIcon name="arrow" size={16} /></button>
        <b>{dateLabel(day)}</b>
        <button type="button" className={css.dayToday} onClick={onToday}>Сегодня</button>
      </div>
      <div className={css.dayTools}>
        <div className={css.daySeg} role="group" aria-label="Диапазон шкалы">
          {PROKAT_TIMELINE_RANGES.map(range => (
            <button key={range.id} type="button" data-on={mode === range.id || undefined} aria-pressed={mode === range.id} onClick={() => onMode(range.id)}>{range.label}</button>
          ))}
        </div>
        <div className={css.dayPick}>
          <button type="button" aria-expanded={pickOpen} onClick={() => setPickOpen(open => !open)}>
            <ProtoIcon name="box" size={14} />
            <span>Предметы <b>{focusId ? (columns.find(column => column.id === focusId)?.serial ?? 'один') : `все ${columns.length}`}</b></span>
            <ProtoIcon name="down" size={14} />
          </button>
          {pickOpen ? <div role="listbox" aria-label="Предметы">
            <button type="button" role="option" aria-selected={!focusId} onClick={() => { setFocusId(null); setPickOpen(false) }}>Все {columns.length}</button>
            {columns.map(column => <button type="button" role="option" key={column.id} aria-selected={focusId === column.id} onClick={() => { setFocusId(column.id); setPickOpen(false) }}>{column.name}</button>)}
          </div> : null}
        </div>
      </div>
    </div>
    {phone ? <div className={css.dayChips} aria-label="Предметы">
      {columns.map(column => <button key={column.id} type="button" data-on={(phoneColumn?.id === column.id) || undefined} onClick={() => setFocusId(column.id)}>{column.serial || column.name}</button>)}
    </div> : null}
    <div className={css.dayLayout} data-open={selected ? true : undefined} data-phone={phone || undefined}>
      <div className={css.dayCal}>
        <div className={css.dayScroll}>
        <div className={css.daySheet} style={{ width: `max(100%, ${52 + gridColumns.length * 120}px)` }}>
        <div className={css.dayHead} style={{ gridTemplateColumns: `52px repeat(${gridColumns.length}, minmax(0, 1fr))` }}>
          <span />
          {gridColumns.map(column => {
            const count = blocks.filter(block => block.itemId === column.id && block.tone !== 'br').length
            return <div key={column.id}>
              <Avatar id={column.serial || column.name} size={24} />
              <span><b title={column.name}>{column.name}</b><small>{column.off ? 'выходной' : `${count} ${count === 1 ? 'запись' : count > 1 && count < 5 ? 'записи' : 'записей'}`}</small></span>
            </div>
          })}
        </div>
        <div className={css.dayGrid} style={{ gridTemplateColumns: `52px repeat(${gridColumns.length}, minmax(0, 1fr))`, height: `${((SCHEDULE_DAY_END - SCHEDULE_DAY_START) / 60) * hourPx}px` }}>
          <div className={css.dayHours} aria-hidden="true">
            {HOURS.map(minute => {
              const near = showNow && Math.abs(((minute - nowMin) / 60) * hourPx) < 18
              if (near) return null
              return <span key={minute} style={{ top: `${((minute - SCHEDULE_DAY_START) / 60) * hourPx}px` }}>{scheduleClockLabel(minute)}</span>
            })}
            {showNow ? <b className={css.dayNowTag} style={{ top: `${((nowMin - SCHEDULE_DAY_START) / 60) * hourPx}px` }}>{scheduleClockLabel(nowMin)}</b> : null}
          </div>
          {gridColumns.map(column => <div key={column.id} className={css.dayCol} data-off={column.off || undefined} onClick={event => {
            if (column.off) return
            if ((event.target as HTMLElement).closest('button')) return
            onCreate(column.id, day)
          }}>
            {blocks.filter(block => block.itemId === column.id).map(block => (
              <button
                key={block.id}
                type="button"
                className={css.dayVisit}
                data-tone={block.tone}
                data-one={block.oneLine || undefined}
                data-on={selectedId === block.id || undefined}
                style={place(block.startMin, block.endMin)}
                onClick={() => setSelectedId(block.id)}
              >
                {block.oneLine ? <><span>{scheduleClockLabel(block.startMin)}</span><b>{block.title}</b></> : <>
                  <b>{block.title}</b>
                  {block.service ? <small>{block.service}</small> : null}
                  <span>{scheduleClockLabel(block.startMin)}–{scheduleClockLabel(block.endMin)}</span>
                </>}
              </button>
            ))}
            {gaps.filter(gap => gap.itemId === column.id).map(gap => (
              <button key={`${gap.startMin}`} type="button" className={css.dayFree} style={place(gap.startMin, gap.endMin)} onClick={() => onCreate(column.id, day)}>+ Свободно</button>
            ))}
          </div>)}
          {showNow ? <i className={css.dayNow} style={{ top: `${nowTop}%` }} /> : null}
        </div>
        </div>
        </div>
        <div className={css.dayLegend}>
          <span><i data-tone="a" />Подтверждена</span>
          <span><i data-tone="p" />Прошла</span>
          <span><i data-tone="w" />Ждёт</span>
          <span><i data-tone="br" />Перерыв</span>
          <em>Нажмите на пустое место в колонке, чтобы записать клиента</em>
        </div>
      </div>
      {selected || !phone ? <aside className={css.dayDetail} aria-label="Выбранная запись" data-open={selected ? true : undefined}>
        {selected ? <>
          <div className={css.dayDetailTop}>
            <em data-tone={arrived === selected.id ? 'a' : selected.tone}>{arrived === selected.id ? 'Пришёл' : selected.tone === 'w' ? 'Ждёт' : selected.tone === 'p' ? 'Прошла' : selected.tone === 'br' ? 'Перерыв' : 'Подтверждена'}</em>
            <button type="button" aria-label="Закрыть" onClick={() => setSelectedId(null)}><ProtoIcon name="close" size={16} /></button>
          </div>
          <div className={css.dayPerson}>
            <Avatar id={selected.phone || selected.clientName || selected.id} size={44} />
            <div>
              <b>{selected.clientName || selected.title}</b>
              <small>{[selected.phone, selected.visits ? visitLabel(selected.visits) : ''].filter(Boolean).join(' · ')}</small>
            </div>
          </div>
          <dl className={css.dayFacts}>
            <dt>Предмет</dt><dd>{selected.service || '—'}</dd>
            <dt>Дата</dt><dd>{dateLabel(day).split(', ')[1]}</dd>
            <dt>Время</dt><dd>{scheduleClockLabel(selected.startMin)}–{scheduleClockLabel(selected.endMin)}</dd>
            <dt>Стоимость</dt><dd>{selected.price ? formatMoney(selected.price) : '—'}</dd>
            <dt>Залог</dt><dd>{selected.deposit ? formatMoney(selected.deposit) : '—'}</dd>
            <dt>Источник</dt><dd>{selected.source}</dd>
          </dl>
          {selected.note ? <p className={css.dayNote}>{selected.note}</p> : null}
          <div className={css.dayActions}>
            <button type="button" onClick={() => onCreate(selected.itemId, day)}>Перенести</button>
            <button type="button" data-primary="true" onClick={() => { if (selected.id.startsWith('day-')) setArrived(selected.id); else onOpen(selected.id) }}>Клиент пришёл</button>
          </div>
          {selected.history.length ? <ol className={css.dayLog}>
            {selected.history.map(entry => <li key={entry.at} data-current={entry.current || undefined}><b>{entry.text}</b><span>{entry.at}</span></li>)}
          </ol> : null}
        </> : <p className={css.dayEmpty}>Выберите запись в сетке.</p>}
      </aside> : null}
    </div>
  </div>
}
