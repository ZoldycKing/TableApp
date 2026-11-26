'use client'

import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { useId, useMemo, useRef, useState } from 'react'
import { useDismiss } from './dismiss'
import { formatRuDate, formatRuTime, parseIsoDate, toIsoDate } from './format'
import css from './ui.module.css'

const WEEK = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

function monthTitle(year: number, month: number) {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
}

function inRange(iso: string, min?: string, max?: string) {
  if (min && iso < min) return false
  if (max && iso > max) return false
  return true
}

function Calendar({
  cursor, onCursor, selected, range, min, max, onPick,
}: {
  cursor: { year: number; month: number }
  onCursor: (next: { year: number; month: number }) => void
  selected: string[]
  range?: { from: string; to: string }
  min?: string
  max?: string
  onPick: (iso: string) => void
}) {
  const first = new Date(cursor.year, cursor.month - 1, 1)
  const pad = (first.getDay() + 6) % 7
  const count = new Date(cursor.year, cursor.month, 0).getDate()
  const shift = (amount: number) => {
    const next = new Date(cursor.year, cursor.month - 1 + amount, 1)
    onCursor({ year: next.getFullYear(), month: next.getMonth() + 1 })
  }
  return (
    <div className={css.calendar}>
      <div className={css.calHead}>
        <button type="button" className={css.iconButton} aria-label="Предыдущий месяц" onClick={() => shift(-1)}><CaretLeftIcon size={16} /></button>
        <strong>{monthTitle(cursor.year, cursor.month)}</strong>
        <button type="button" className={css.iconButton} aria-label="Следующий месяц" onClick={() => shift(1)}><CaretRightIcon size={16} /></button>
      </div>
      <div className={css.week}>{WEEK.map(name => <span key={name}>{name}</span>)}</div>
      <div className={css.days}>
        {Array.from({ length: pad }, (_, index) => <span key={`pad-${index}`} />)}
        {Array.from({ length: count }, (_, index) => {
          const day = index + 1
          const iso = toIsoDate(new Date(cursor.year, cursor.month - 1, day))
          const pressed = selected.includes(iso)
          const inside = Boolean(range?.from && range.to && iso > range.from && iso < range.to)
          return (
            <button
              key={iso}
              type="button"
              className={css.day}
              aria-pressed={pressed}
              data-in-range={inside || undefined}
              data-range-start={range?.from === iso || undefined}
              data-range-end={range?.to === iso || undefined}
              disabled={!inRange(iso, min, max)}
              onClick={() => onPick(iso)}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function useCursor(value: string) {
  const parsed = parseIsoDate(value) ?? new Date()
  return useState({ year: parsed.getFullYear(), month: parsed.getMonth() + 1 })
}

export function DateField({
  label, value, onValue, min, max, disabled = false, id, name, required = false, placeholder = 'Дата', className,
}: {
  label: string
  value: string
  onValue: (value: string) => void
  min?: string
  max?: string
  disabled?: boolean
  id?: string
  name?: string
  required?: boolean
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const listId = useId()
  const [cursor, setCursor] = useCursor(value)
  useDismiss(open, root, () => setOpen(false))
  const text = formatRuDate(value)
  const shown = draft ?? text
  const commit = (raw: string) => {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw)
    if (!match) return false
    const iso = `${match[3]}-${match[2]}-${match[1]}`
    const parsed = parseIsoDate(iso)
    if (!parsed || toIsoDate(parsed) !== iso) return false
    setDraft(null)
    if (iso !== value) onValue(iso)
    return true
  }
  return (
    <div className={`${css.stack} ${className ?? ''}`} ref={root}>
      <span className={css.label} id={`${listId}-label`}>{label}</span>
      <div className={css.anchor}>
        <input
          id={id}
          className={`${css.trigger} ${css.mono}`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-labelledby={`${listId}-label`}
          aria-required={required || undefined}
          disabled={disabled}
          placeholder={placeholder === 'Дата' ? 'дд.мм.гггг' : placeholder}
          value={shown}
          onChange={event => {
            const raw = event.target.value
            if (!commit(raw)) setDraft(raw)
          }}
          onBlur={() => setDraft(null)}
        />
        <button
          type="button"
          className={css.iconButton}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Открыть календарь: ${label}`}
          disabled={disabled}
          onClick={() => {
            const parsed = parseIsoDate(value)
            if (parsed) setCursor({ year: parsed.getFullYear(), month: parsed.getMonth() + 1 })
            setOpen(current => !current)
          }}
        >
          <span aria-hidden>▾</span>
        </button>
        <input type="hidden" name={name} value={value} />
        {open ? (
          <div className={css.panel} role="dialog" aria-label={label}>
            <Calendar cursor={cursor} onCursor={setCursor} selected={value ? [value] : []} min={min} max={max} onPick={iso => { setDraft(null); onValue(iso); setOpen(false) }} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function DateRangeField({
  label, from, to, onChange, min, max,
}: {
  label: string
  from: string
  to: string
  onChange: (next: { from: string; to: string }) => void
  min?: string
  max?: string
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useCursor(from || to)
  useDismiss(open, root, () => { setOpen(false); setAnchor(null) })
  const text = from && to ? `${formatRuDate(from)} – ${formatRuDate(to)}` : from ? formatRuDate(from) : ''
  const pick = (iso: string) => {
    if (!anchor) {
      setAnchor(iso)
      onChange({ from: iso, to: '' })
      return
    }
    const next = iso < anchor ? { from: iso, to: anchor } : { from: anchor, to: iso }
    onChange(next)
    setAnchor(null)
    setOpen(false)
  }
  return (
    <div className={css.stack} ref={root}>
      <span className={css.label}>{label}</span>
      <div className={css.anchor}>
        <button type="button" className={`${css.trigger} ${css.mono}`} data-empty={text ? undefined : true} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(current => !current)}>
          {text || 'Даты'}
        </button>
        {open ? (
          <div className={css.panel} role="dialog" aria-label={label}>
            <Calendar cursor={cursor} onCursor={setCursor} selected={[from, to].filter(Boolean)} range={from && to ? { from, to } : undefined} min={min} max={max} onPick={pick} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

export function TimeField({
  label, value, onValue, disabled = false, id, name, className,
}: {
  label: string
  value: string
  onValue: (value: string) => void
  disabled?: boolean
  id?: string
  name?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useDismiss(open, root, () => setOpen(false))
  const text = formatRuTime(value)
  const [hour, minute] = text ? text.split(':') : ['12', '00']
  const choose = (nextHour: string, nextMinute: string) => onValue(`${nextHour}:${nextMinute}`)
  const hours = useMemo(() => HOURS, [])
  return (
    <div className={`${css.stack} ${className ?? ''}`} ref={root}>
      <span className={css.label}>{label}</span>
      <div className={css.anchor}>
        <button
          type="button"
          className={`${css.trigger} ${css.mono}`}
          data-empty={text ? undefined : true}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`Время, ${label}`}
          disabled={disabled}
          onClick={() => setOpen(current => !current)}
        >
          {text || 'Время'}
        </button>
        <input
          id={id}
          className={css.valueSink}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={label}
          disabled={disabled}
          name={name}
          value={value}
          onChange={event => {
            const next = event.target.value
            if (/^\d{2}:\d{2}$/.test(next)) onValue(next)
          }}
        />
        {open ? (
          <div className={css.panel} role="dialog" aria-label={label}>
            <div className={css.times}>
              <div className={css.timeCol} aria-label="Часы">
                {hours.map(item => <button key={item} type="button" className={css.timeCell} aria-pressed={item === hour} onClick={() => choose(item, minute || '00')}>{item}</button>)}
              </div>
              <div className={css.timeCol} aria-label="Минуты">
                {MINUTES.map(item => <button key={item} type="button" className={css.timeCell} aria-pressed={item === minute} onClick={() => choose(hour || '12', item)}>{item}</button>)}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
