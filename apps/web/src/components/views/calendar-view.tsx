'use client'

import type { Field, ViewOf } from '@tableapp/schema'
import { useMemo, useState } from 'react'
import { formatCell } from '@/lib/format'
import type { TableRow } from '@/lib/table-store'

type CalendarProps = {
  view: ViewOf<'calendar'>
  fields: Field[]
  rows: TableRow[]
  titleField: Field | undefined
  onConfigChange: (config: ViewOf<'calendar'>['config']) => void
}

const DATE_TYPES = new Set(['date', 'datetime', 'created_time', 'updated_time'])

// Неделя начинается с понедельника — русский календарь, а не американский.
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })

function dayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`
}

/** Сетка месяца: полные недели, включая хвосты соседних месяцев. */
function monthGrid(anchor: Date): Date[] {
  const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1))
  const offset = (first.getUTCDay() + 6) % 7
  const start = new Date(first.getTime() - offset * 86400000)

  return Array.from({ length: 42 }, (_, index) => new Date(start.getTime() + index * 86400000))
}

export function CalendarView({ view, fields, rows, titleField, onConfigChange }: CalendarProps) {
  const candidates = fields.filter((field) => DATE_TYPES.has(field.type))
  const dateField = fields.find((field) => field.id === view.config.dateFieldId) ?? candidates[0]

  const [anchor, setAnchor] = useState(() => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  })

  const byDay = useMemo(() => {
    const map = new Map<string, TableRow[]>()
    if (!dateField) return map
    for (const row of rows) {
      const raw = row.data[dateField.id]
      if (!raw) continue
      const date = new Date(String(raw))
      if (Number.isNaN(date.getTime())) continue
      const key = dayKey(date)
      const bucket = map.get(key)
      if (bucket) bucket.push(row)
      else map.set(key, [row])
    }
    return map
  }, [rows, dateField])

  if (!dateField) {
    return (
      <p className="rounded-xl border border-[var(--color-border-subtle)] px-4 py-8 text-center text-sm text-[var(--color-ink-muted)]">
        Для календаря нужно поле с датой. В этой таблице таких полей нет.
      </p>
    )
  }

  const days = monthGrid(anchor)
  const todayKey = dayKey(new Date())
  const undated = rows.filter((row) => !row.data[dateField.id]).length

  const shift = (months: number) =>
    setAnchor((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + months, 1)))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[var(--color-ink-muted)]">Дата из поля</span>
        <select
          value={dateField.id}
          onChange={(event) => onConfigChange({ ...view.config, dateFieldId: event.target.value })}
          className="rounded border border-[var(--color-border-subtle)] bg-white px-2 py-1 text-sm outline-none focus:border-sage-400"
        >
          {candidates.map((field) => (
            <option key={field.id} value={field.id}>
              {field.name}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} className="rounded px-2 py-1 hover:bg-[var(--color-surface-muted)]">
            ←
          </button>
          <span className="min-w-40 text-center font-medium capitalize">{monthFormatter.format(anchor)}</span>
          <button type="button" onClick={() => shift(1)} className="rounded px-2 py-1 hover:bg-[var(--color-surface-muted)]">
            →
          </button>
        </div>

        {undated > 0 ? (
          <span className="text-[var(--color-ink-muted)]">без даты: {undated}</span>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border-subtle)]">
        <div className="grid grid-cols-7 bg-[var(--color-surface-muted)]">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="px-2 py-1.5 text-center text-xs font-medium text-[var(--color-ink-muted)]">
              {weekday}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = dayKey(day)
            const dayRows = byDay.get(key) ?? []
            const outside = day.getUTCMonth() !== anchor.getUTCMonth()
            const isToday = key === todayKey

            return (
              <div
                key={key}
                className={`min-h-24 border-b border-r border-[var(--color-border-subtle)] p-1.5 ${
                  outside ? 'bg-[var(--color-surface-muted)]/40' : ''
                }`}
              >
                <div className="mb-1 flex items-center gap-1">
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs ${
                      isToday
                        ? 'bg-ink font-medium text-white'
                        : outside
                          ? 'text-[var(--color-ink-muted)]'
                          : ''
                    }`}
                  >
                    {day.getUTCDate()}
                  </span>
                </div>

                <div className="space-y-1">
                  {dayRows.slice(0, 3).map((row) => (
                    <div
                      key={row.id}
                      title={titleField ? formatCell(titleField, row.data[titleField.id]) : ''}
                      className="truncate rounded bg-sage-50 px-1.5 py-0.5 text-xs text-sage-700"
                    >
                      {titleField ? formatCell(titleField, row.data[titleField.id]) || 'Без названия' : 'Запись'}
                    </div>
                  ))}
                  {dayRows.length > 3 ? (
                    <div className="px-1.5 text-xs text-[var(--color-ink-muted)]">
                      ещё {dayRows.length - 3}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
