'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from '@/components/ui/avatar'
import { ruCount } from '@/components/ui/format'
import { formatMoney, formatMoneyOrZero } from '@/lib/prokat-logic'
import { ProtoIcon } from '../prototype/icons'
import css from './prokat-booking.module.css'

export type BookingClientOption = {
  id: string
  name: string
  phone: string
  visits: number
  gender?: 'f' | 'm'
}

export type BookingItemOption = {
  id: string
  name: string
  rate: number
  deposit: number
  unit: string
  hint: string
  tone: 'blue' | 'beige'
  status: 'free' | 'stock' | 'busy'
}

const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

function isoParts(iso: string) {
  const [year = 0, month = 0, day = 0] = iso.split('-').map(Number)
  return { year, month, day }
}

function toIso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatRu(iso: string, time: string) {
  const { year, month, day } = isoParts(iso)
  if (!year || !month || !day) return time
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}, ${time}`
}

function monthTitle(year: number, month: number) {
  const raw = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
  return (raw.charAt(0).toUpperCase() + raw.slice(1)).replace(/\s*г\.?\s*$/u, '')
}

function daysBetween(from: string, to: string) {
  if (!from || !to) return 0
  const a = isoParts(from)
  const b = isoParts(to)
  const start = Date.UTC(a.year, a.month - 1, a.day)
  const end = Date.UTC(b.year, b.month - 1, b.day)
  return Math.max(0, Math.round((end - start) / 86400000))
}

function shiftIso(iso: string, days: number) {
  const { year, month, day } = isoParts(iso)
  const next = new Date(Date.UTC(year, month - 1, day + days))
  return toIso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())
}

function usePhone(force?: boolean) {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 759px)').matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(max-width: 759px)')
    const sync = () => setNarrow(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return Boolean(force) || narrow
}

function MonthCalendar({
  from, to, today, onChange,
}: {
  from: string
  to: string
  today: string
  onChange: (next: { from: string; to: string }) => void
}) {
  const seed = from || to || today
  const seedParts = isoParts(seed)
  const [cursor, setCursor] = useState({ year: seedParts.year, month: seedParts.month })
  const [anchor, setAnchor] = useState<string | null>(null)
  const first = new Date(cursor.year, cursor.month - 1, 1)
  const pad = (first.getDay() + 6) % 7
  const count = new Date(cursor.year, cursor.month, 0).getDate()
  const shift = (amount: number) => {
    const next = new Date(cursor.year, cursor.month - 1 + amount, 1)
    setCursor({ year: next.getFullYear(), month: next.getMonth() + 1 })
  }
  const pick = (iso: string) => {
    if (!anchor) {
      setAnchor(iso)
      onChange({ from: iso, to: '' })
      return
    }
    const next = iso < anchor ? { from: iso, to: anchor } : { from: anchor, to: iso }
    onChange(next)
    setAnchor(null)
  }
  const rangeFrom = from && to ? from : anchor || from
  const rangeTo = from && to ? to : from && !to ? '' : to
  return <div className={css.calc}>
    <div className={css.mt}>
      <button type="button" className={css.ib} aria-label="Предыдущий месяц" onClick={() => shift(-1)}><ProtoIcon name="back" size={14} /></button>
      <span>{monthTitle(cursor.year, cursor.month)}</span>
      <button type="button" className={css.ib} aria-label="Следующий месяц" onClick={() => shift(1)}><ProtoIcon name="arrow" size={14} /></button>
    </div>
    <div className={css.dg}>
      {WEEK.map(name => <span key={name} className={css.w}>{name}</span>)}
      {Array.from({ length: pad }, (_, index) => <span key={`pad-${index}`} />)}
      {Array.from({ length: count }, (_, index) => {
        const day = index + 1
        const iso = toIso(cursor.year, cursor.month, day)
        const past = iso < today
        const start = Boolean(rangeFrom && iso === rangeFrom)
        const end = Boolean(rangeTo && iso === rangeTo)
        const both = start && end
        const mid = Boolean(rangeFrom && rangeTo && iso > rangeFrom && iso < rangeTo)
        return <button
          key={iso}
          type="button"
          data-ps={past || undefined}
          data-td={iso === today || undefined}
          data-a={start || undefined}
          data-b={end || both || undefined}
          data-r={mid || undefined}
          onClick={() => pick(iso)}
        >{day}</button>
      })}
    </div>
  </div>
}

function WeekStrip({
  from, to, today, onChange,
}: {
  from: string
  to: string
  today: string
  onChange: (next: { from: string; to: string }) => void
}) {
  const [anchor, setAnchor] = useState<string | null>(null)
  const focus = from || to || today
  const focusParts = isoParts(focus)
  const focusDate = new Date(Date.UTC(focusParts.year, focusParts.month - 1, focusParts.day))
  const weekday = (focusDate.getUTCDay() + 6) % 7
  const monday = shiftIso(focus, -weekday)
  const days = Array.from({ length: 7 }, (_, index) => shiftIso(monday, index))
  const pick = (iso: string) => {
    if (!anchor) {
      setAnchor(iso)
      onChange({ from: iso, to: '' })
      return
    }
    const next = iso < anchor ? { from: iso, to: anchor } : { from: anchor, to: iso }
    onChange(next)
    setAnchor(null)
  }
  const rangeFrom = from && to ? from : anchor || from
  const rangeTo = from && to ? to : ''
  return <div className={css.wk}>
    {WEEK.map(name => <span key={name}>{name}</span>)}
    {days.map(iso => {
      const day = Number(iso.slice(8, 10))
      const past = iso < today
      const start = Boolean(rangeFrom && iso === rangeFrom)
      const end = Boolean(rangeTo && iso === rangeTo)
      const both = start && end
      const mid = Boolean(rangeFrom && rangeTo && iso > rangeFrom && iso < rangeTo)
      return <button
        key={iso}
        type="button"
        data-ps={past || undefined}
        data-a={start || undefined}
        data-b={end || both || undefined}
        data-r={mid || undefined}
        onClick={() => pick(iso)}
      >{day}</button>
    })}
  </div>
}

function StampField({
  label, date, time, onTime,
}: {
  label: string
  date: string
  time: string
  onTime: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const [hour, minute] = /^(\d{2}):(\d{2})$/.exec(time)?.slice(1) ?? ['10', '00']
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div ref={root} style={{ position: 'relative' }}>
    <button type="button" className={css.tmx} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(current => !current)}>
      <small>{label}</small>
      <span className={css.tmxValue}>
        {formatRu(date, time)}
        <ProtoIcon name="down" size={14} />
      </span>
    </button>
    {open ? <div className={css.timePanel} role="dialog" aria-label={label}>
      <div className={css.timeCol} role="listbox" aria-label="Часы">
        {HOURS.map(next => <button key={next} type="button" role="option" aria-selected={next === hour} onClick={() => { onTime(`${next}:${minute}`); setOpen(false) }}>{next}</button>)}
      </div>
      <div className={css.timeCol} role="listbox" aria-label="Минуты">
        {MINUTES.map(next => <button key={next} type="button" role="option" aria-selected={next === minute} onClick={() => { onTime(`${hour}:${next}`); setOpen(false) }}>{next}</button>)}
      </div>
    </div> : null}
  </div>
}

function ClientPicker({
  clients, value, onChange, phone,
}: {
  clients: readonly BookingClientOption[]
  value: string
  onChange: (id: string) => void
  phone: boolean
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const current = clients.find(client => client.id === value) ?? clients[0]
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  if (!current) return null
  const visits = current.visits
  const visitWord = current.gender === 'f'
    ? `брала ${ruCount(visits, 'раз', 'раза', 'раз')}`
    : `брал ${ruCount(visits, 'раз', 'раза', 'раз')}`
  return <div ref={root} style={{ position: 'relative' }}>
    <div className={css.cli}>
      <Avatar id={current.id} size={30} label={current.name} />
      <div>
        <b>{current.name}</b>
        <small>{phone ? current.phone : `${current.phone} · ${visitWord}`}</small>
      </div>
      {phone
        ? <button type="button" className={css.cliMenu} aria-label="Другой клиент" onClick={() => setOpen(currentOpen => !currentOpen)}><ProtoIcon name="down" size={16} /></button>
        : <button type="button" className={css.btn} data-outline data-sm style={{ marginLeft: 'auto' }} onClick={() => setOpen(currentOpen => !currentOpen)}>Другой клиент</button>}
    </div>
    {open ? <div className={css.timePanel} role="listbox" aria-label="Клиент" style={{ maxHeight: 220 }}>
      <div className={css.timeCol} style={{ gridColumn: '1 / -1' }}>
        {clients.map(client => (
          <button key={client.id} type="button" role="option" aria-selected={client.id === current.id} onClick={() => { onChange(client.id); setOpen(false) }}>
            {client.name}
          </button>
        ))}
      </div>
    </div> : null}
  </div>
}

export function BookingModal({
  phone: phoneProp,
  clients,
  items,
  clientId,
  onClientId,
  itemIds,
  onToggleItem,
  query,
  onQuery,
  fromDate,
  toDate,
  onRange,
  fromTime,
  toTime,
  onFromTime,
  onToTime,
  today,
  price,
  deposit,
  confirm,
  onConfirm,
  busy,
  error,
  onClose,
  onSubmit,
  pickupLabel = 'Выдача',
  returnLabel = 'Возврат',
  showInventory = false,
  onShowInventory,
}: {
  phone?: boolean
  clients: readonly BookingClientOption[]
  items: readonly BookingItemOption[]
  clientId: string
  onClientId: (id: string) => void
  itemIds: readonly string[]
  onToggleItem: (id: string) => void
  query: string
  onQuery: (value: string) => void
  fromDate: string
  toDate: string
  onRange: (next: { from: string; to: string }) => void
  fromTime: string
  toTime: string
  onFromTime: (value: string) => void
  onToTime: (value: string) => void
  today: string
  price: number
  deposit: number
  confirm: boolean
  onConfirm: (value: boolean) => void
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: () => void
  pickupLabel?: string
  returnLabel?: string
  showInventory?: boolean
  onShowInventory?: () => void
}) {
  const formId = useId()
  const marker = useRef<HTMLSpanElement>(null)
  const [frame, setFrame] = useState<HTMLElement | null>(null)
  const phone = usePhone(phoneProp)
  useEffect(() => {
    setFrame(marker.current?.closest('[data-navigation]') ?? marker.current?.closest('[data-app-frame]') ?? null)
  }, [])
  const selected = items.filter(item => itemIds.includes(item.id))
  const nights = daysBetween(fromDate, toDate) || (fromDate ? 1 : 0)
  const nightsLabel = nights ? ruCount(nights, 'сутки', 'суток', 'суток') : '—'
  const itemsLabel = ruCount(selected.length, 'предмет', 'предмета', 'предметов')
  const filtered = items.filter(item => {
    if (!query.trim()) return true
    const needle = query.trim().toLowerCase()
    return item.name.toLowerCase().includes(needle)
  })
  const visible = phone && !showInventory ? selected : filtered
  const monthName = fromDate
    ? `${new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(new Date(isoParts(fromDate).year, isoParts(fromDate).month - 1, 1))} ${isoParts(fromDate).year}`
    : ''

  const panel = (
    <div className={css.root} data-phone={phone || undefined} role="presentation">
      <button type="button" aria-label="Закрыть" onClick={onClose} style={{ position: 'absolute', inset: 0, border: 0, padding: 0, margin: 0, background: 'transparent', cursor: 'pointer' }} />
      <form
        id={formId}
        className={css.md}
        style={{ position: 'relative', zIndex: 1 }}
        role="dialog"
        aria-modal="true"
        aria-label="Новая бронь"
        onSubmit={event => { event.preventDefault(); onSubmit() }}
      >
        <div className={css.mh}>
          <div>
            <h2>Новая бронь</h2>
            <div className={css.sub}>{phone ? 'Цена посчитается сама' : 'Выберите клиента, что он берёт и на какие даты — цена посчитается сама'}</div>
          </div>
          <button type="button" className={css.ib} aria-label="Закрыть" onClick={onClose}><ProtoIcon name="close" size={16} /></button>
        </div>

        <div className={css.mb}>
          <div className={css.col}>
            <div>
              <div className={css.deskOnly}>
                <div className={css.st}>
                  <i data-done={clientId || undefined}>{clientId ? <ProtoIcon name="check" size={11} /> : '1'}</i>
                  Клиент
                </div>
              </div>
              <div className={css.phoneOnly}><div className={css.lb2}>Клиент</div></div>
              <ClientPicker clients={clients} value={clientId} onChange={onClientId} phone={phone} />
            </div>

            <div>
              <div className={css.deskOnly}>
                <div className={css.st}>
                  <i>{selected.length ? '2' : '2'}</i>
                  Что берёт
                  <small>выбрано {selected.length}</small>
                </div>
                <label className={css.search}>
                  <ProtoIcon name="search" size={16} />
                  <input value={query} onChange={event => onQuery(event.target.value)} placeholder="Найти в инвентаре: доска, весло, гидрокостюм…" />
                </label>
              </div>
              <div className={css.phoneOnly}>
                <div className={css.lb2}>Что берёт<small>{itemsLabel}</small></div>
              </div>
              <div className={css.its}>
                {visible.map(item => {
                  const on = itemIds.includes(item.id)
                  const disabled = item.status === 'busy' && !on
                  return <button
                    key={item.id}
                    type="button"
                    className={css.it}
                    data-on={on || undefined}
                    data-dis={disabled || undefined}
                    disabled={disabled}
                    aria-pressed={on}
                    onClick={() => onToggleItem(item.id)}
                  >
                    <span className={css.tl} data-tone={item.tone}><ProtoIcon name="box" size={16} /></span>
                    <span className={css.itBody}>
                      <b>{item.name}</b>
                      <small>{phone ? `${formatMoney(item.rate)} ${item.unit}` : item.hint}</small>
                    </span>
                    {!phone ? <span className={css.pr}><b>{formatMoney(item.rate)}</b><small>{item.unit}</small></span> : null}
                    {item.status === 'busy' && !on
                      ? <span style={{ width: 24 }} />
                      : <span className={css.cb} data-on={on || undefined}>{on ? <ProtoIcon name="check" size={12} /> : null}</span>}
                  </button>
                })}
              </div>
              {phone ? <button type="button" className={css.ad} onClick={onShowInventory}><ProtoIcon name="plus" size={14} />Добавить из инвентаря</button> : null}
            </div>
          </div>

          <div>
            <div className={css.deskOnly}>
              <div className={css.st}>
                <i>3</i>
                Когда
                <small>{nightsLabel}</small>
              </div>
              <MonthCalendar from={fromDate} to={toDate} today={today} onChange={onRange} />
            </div>
            <div className={css.phoneOnly}>
              <div className={css.lb2}>Когда<small>{nightsLabel}{monthName ? ` · ${monthName}` : ''}</small></div>
              <WeekStrip from={fromDate} to={toDate} today={today} onChange={onRange} />
            </div>
            <div className={css.tms}>
              <StampField label={pickupLabel} date={fromDate} time={fromTime} onTime={onFromTime} />
              <StampField label={returnLabel} date={toDate || fromDate} time={toTime} onTime={onToTime} />
            </div>
            {error ? <p className={css.error} role="alert">{error}</p> : null}
            <div className={css.phoneOnly}>
              <div className={css.tot}>
                <div>
                  <small>Итого · залог {formatMoneyOrZero(deposit)}</small>
                  <b>{formatMoneyOrZero(price)}</b>
                </div>
                <button type="submit" className={css.btn} data-lg style={{ marginLeft: 'auto' }} disabled={busy}>{busy ? 'Сохраняем…' : 'Создать бронь'}</button>
              </div>
            </div>
          </div>
        </div>

        <div className={css.mf}>
          <div className={css.sum}>
            <small>{selected.length} {selected.length === 1 ? 'предмет' : selected.length > 1 && selected.length < 5 ? 'предмета' : 'предметов'} × {nightsLabel}</small>
            <b>{formatMoneyOrZero(price)}</b>
          </div>
          <div className={css.sum} data-muted style={{ marginLeft: 18 }}>
            <small>Залог</small>
            <b>{formatMoneyOrZero(deposit)}</b>
          </div>
          <button type="button" className={css.ntf} role="switch" aria-checked={confirm} onClick={() => onConfirm(!confirm)}>
            <span className={css.tg} data-on={confirm || undefined} />
            Отправить клиенту подтверждение
          </button>
          <div className={css.mfActions}>
            <button type="button" className={css.btn} data-outline onClick={onClose}>Отмена</button>
            <button type="submit" className={css.btn} disabled={busy}>{busy ? 'Сохраняем…' : <>Создать бронь <ProtoIcon name="arrow" size={14} /></>}</button>
          </div>
        </div>
      </form>
    </div>
  )

  return <>
    <span ref={marker} hidden />
    {frame ? createPortal(panel, frame) : panel}
  </>
}
