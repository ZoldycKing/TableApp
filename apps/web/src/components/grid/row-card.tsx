'use client'

import { dateInstant, fieldTimeZone, instantToWallClock, isComputed, type Attachment, type Field } from '@tableapp/schema'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useUnsaved } from '@/lib/unsaved'
import { FileUpload } from '@/components/file-upload'
import type { TitleIndex } from '@/lib/table-export'
import { cellText } from '@/lib/table-export'
import { describeField, type RelatedTables } from '@/lib/field-help'
import { FIELD_LABELS } from '@/lib/field-labels'

/**
 * Карточка строки: все поля столбиком, целиком и сразу готовые к правке.
 *
 * Здесь намеренно нет режима «сначала нажми, потом редактируй»: в карточку
 * заходят именно чтобы читать и править, и лишний щелчок только мешает.
 * Каждый тип поля получает свой понятный элемент управления — переключатель
 * переключается, варианты выбираются кнопками, связи отмечаются галочками.
 * Список с Ctrl, который был здесь раньше, человек просто не умеет закрывать.
 */
export function RowCard({
  row,
  fields,
  relatedTitles,
  relatedTables,
  readOnly,
  position,
  total,
  onSetCell,
  onPrev,
  onNext,
  onClose,
  actions,
}: {
  row: { id: string; data: Record<string, unknown> }
  fields: readonly Field[]
  relatedTitles?: TitleIndex
  /** Связанные таблицы с их полями — из них собираются пояснения. */
  relatedTables?: RelatedTables
  readOnly?: boolean
  position: number
  total: number
  onSetCell: (rowId: string, fieldId: string, value: unknown, base?: unknown) => void
  onPrev?: () => void
  onNext?: () => void
  onClose: () => void
  actions?: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/20" onClick={onClose}>
      <aside
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col border-l border-[var(--color-border-subtle)] bg-white shadow-lift"
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Строка {position}</h2>
            <p className="text-xs text-[var(--color-ink-muted)]">
              из {total} · правки сохраняются сразу
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onPrev}
              disabled={!onPrev}
              title="Предыдущая строка"
              className="rounded-lg border border-[var(--color-border-subtle)] px-2.5 py-1.5 text-sm hover:bg-[var(--color-surface-muted)] disabled:opacity-40"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!onNext}
              title="Следующая строка"
              className="rounded-lg border border-[var(--color-border-subtle)] px-2.5 py-1.5 text-sm hover:bg-[var(--color-surface-muted)] disabled:opacity-40"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--color-border-subtle)] px-2.5 py-1.5 text-sm hover:bg-[var(--color-surface-muted)]"
            >
              Закрыть
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {actions}
          <div className="space-y-3">
            {fields.map((field) => (
              <FieldRow
                key={field.id}
                field={field}
                fields={fields}
                value={row.data[field.id]}
                relatedTitles={relatedTitles}
                relatedTables={relatedTables}
                readOnly={readOnly}
                onChange={(next) => onSetCell(row.id, field.id, next, row.data[field.id])}
              />
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}

const BOX =
  'w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm outline-none transition-colors focus:border-sage-400'

function FieldRow({
  field,
  fields,
  value,
  relatedTitles,
  relatedTables,
  readOnly,
  onChange,
}: {
  field: Field
  fields: readonly Field[]
  value: unknown
  relatedTitles?: TitleIndex
  relatedTables?: RelatedTables
  readOnly?: boolean
  onChange: (value: unknown) => void
}) {
  const computed = isComputed(field.type)
  /*
   * Подсказка появляется при наведении, но нажатие её закрепляет: на телефоне
   * наведения не существует, а с закреплённой можно спокойно прокрутить
   * длинный текст, не боясь увести курсор.
   */
  /*
   * Открытая карточка — это незакрытая работа: в ней правят поля, и
   * перечитывание страницы стёрло бы набранное. Отметка живёт, пока карточка
   * открыта, и снимается при закрытии.
   */
  useUnsaved('row-card', true)

  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const helpOpen = hovered || pinned
  const help = describeField(field, fields, relatedTables)

  return (
    <div className="rounded-xl border border-[var(--color-border-subtle)] p-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium">{field.name}</span>
          {/*
            Подсказка по требованию: связи между полями — самое непонятное
            место таблицы, но висеть постоянно этот текст не должен.
          */}
          <button
            ref={anchorRef}
            type="button"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setHovered(true)}
            onBlur={() => setHovered(false)}
            onClick={() => setPinned((open) => !open)}
            title={pinned ? 'Убрать пояснение' : 'Что это за поле и как его заполнять'}
            aria-expanded={helpOpen}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] leading-none transition-colors ${
              helpOpen
                ? 'border-sage-500 bg-sage-50 text-sage-700'
                : 'border-sand-300 text-[var(--color-ink-muted)] hover:border-sage-400 hover:text-ink'
            }`}
          >
            i
          </button>
        </span>
        <span className="shrink-0 text-xs text-[var(--color-ink-muted)]">
          {FIELD_LABELS[field.type]}
          {computed ? ' · считается само' : ''}
        </span>
      </div>

      {helpOpen ? (
        <HelpPopover
          anchor={anchorRef}
          help={help}
          onEnter={() => setHovered(true)}
          onLeave={() => setHovered(false)}
        />
      ) : null}

      {computed || readOnly ? (
        /* Вычисляемое поле показываем тем же текстом, что и таблица: связи
           названиями строк, а не идентификаторами. */
        <p className="whitespace-pre-wrap break-words text-sm text-[var(--color-ink-muted)]">
          {cellText(field, value, relatedTitles) || 'пусто'}
        </p>
      ) : (
        <Control field={field} value={value} relatedTitles={relatedTitles} onChange={onChange} />
      )}
    </div>
  )
}

function Control({
  field,
  value,
  relatedTitles,
  onChange,
}: {
  field: Field
  value: unknown
  relatedTitles?: TitleIndex
  onChange: (value: unknown) => void
}) {
  switch (field.type) {
    /*
     * Переключатель переключается, а не открывает редактор. Раньше здесь
     * открывалось текстовое поле со словом «false», и при выходе значение
     * уходило строкой — отсюда и бралось «Значение не подходит типу поля».
     */
    case 'checkbox':
      return <Switch value={value === true} onChange={onChange} />

    case 'long_text':
      return <TextInput value={value} onChange={onChange} multiline />

    case 'number':
      return <NumberInput value={value} onChange={onChange} />

    case 'date':
    case 'datetime':
      return <DateInput value={value} withTime={field.type === 'datetime'} zone={fieldTimeZone(field)} onChange={onChange} />

    case 'single_select':
      return (
        <Choices
          choices={field.options.choices}
          selected={typeof value === 'string' ? [value] : []}
          onToggle={(id) => onChange(typeof value === 'string' && value === id ? null : id)}
        />
      )

    case 'multi_select':
      return (
        <Choices
          choices={field.options.choices}
          selected={Array.isArray(value) ? value.map(String) : []}
          onToggle={(id) => {
            const current = Array.isArray(value) ? value.map(String) : []
            onChange(current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
          }}
        />
      )

    case 'relation':
      return (
        <RelationPicker
          options={relatedTitles?.[field.options.tableId] ?? []}
          selected={Array.isArray(value) ? value.map(String) : []}
          allowMultiple={field.options.allowMultiple !== false}
          onChange={onChange}
        />
      )

    case 'attachment':
    case 'image':
      return (
        <FileUpload
          value={Array.isArray(value) ? (value as Attachment[]) : []}
          maxCount={field.options.maxCount ?? 10}
          onChange={(files) => onChange(files)}
        />
      )

    case 'member':
      // Выбор участника — отдельная задача: списка людей здесь нет.
      return (
        <p className="text-sm text-[var(--color-ink-muted)]">
          {cellText(field, value, relatedTitles) || 'не заполнено'} · выбор участника пока
          настраивается в таблице
        </p>
      )

    default:
      return <TextInput value={value} onChange={onChange} type={inputType(field.type)} />
  }
}

function inputType(type: string): string {
  if (type === 'email') return 'email'
  if (type === 'phone') return 'tel'
  if (type === 'url') return 'url'
  return 'text'
}

/** Переключатель словами: «Да» и «Нет» понятнее галочки без подписи. */
function Switch({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex gap-1.5">
      {[
        { label: 'Да', on: true },
        { label: 'Нет', on: false },
      ].map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => onChange(option.on)}
          className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
            value === option.on
              ? 'border-sage-500 bg-sage-50 font-medium text-sage-700'
              : 'border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-muted)]'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Текст сохраняется по уходу из поля, а не на каждую букву: иначе в очередь
 * и в журнал попадёт по правке на символ.
 */
function TextInput({
  value,
  onChange,
  multiline,
  type = 'text',
}: {
  value: unknown
  onChange: (value: unknown) => void
  multiline?: boolean
  type?: string
}) {
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value))
  const commit = () => onChange(draft.trim() === '' ? null : draft)

  if (multiline) {
    return (
      <textarea
        rows={4}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        className={`${BOX} resize-y`}
      />
    )
  }

  return (
    <input
      type={type}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      className={BOX}
    />
  )
}

/** Число приводится здесь же: строка в числовое поле не попадёт. */
function NumberInput({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value))

  return (
    <input
      inputMode="decimal"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const cleaned = draft.trim().replace(/\s/g, '').replace(',', '.')
        if (cleaned === '') return onChange(null)
        const parsed = Number(cleaned)
        onChange(Number.isFinite(parsed) ? parsed : null)
      }}
      className={`${BOX} text-right tabular-nums`}
    />
  )
}

/** Дата вводится по времени продукта — тем же пересчётом, что и в таблице. */
function DateInput({
  value,
  withTime,
  zone,
  onChange,
}: {
  value: unknown
  withTime: boolean
  zone: string
  onChange: (value: unknown) => void
}) {
  const instant = dateInstant(value, zone)
  const wall = instant === null ? null : instantToWallClock(new Date(instant), zone)
  const current = wall ? (withTime ? `${wall.date}T${wall.time}` : wall.date) : ''

  return (
    <div className="flex items-center gap-2">
      <input
        type={withTime ? 'datetime-local' : 'date'}
        value={current}
        onChange={(event) => {
          const next = event.target.value
          if (!next) return onChange(null)
          const parsed = dateInstant(next, zone)
          if (parsed !== null) onChange(new Date(parsed).toISOString())
        }}
        className={BOX}
      />
      {current ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          title="Очистить"
          className="shrink-0 rounded-lg border border-[var(--color-border-subtle)] px-2.5 py-2 text-sm hover:bg-[var(--color-surface-muted)]"
        >
          ×
        </button>
      ) : null}
    </div>
  )
}

/** Варианты выбора — кнопками: нажал и выбрал, повторно нажал и снял. */
function Choices({
  choices,
  selected,
  onToggle,
}: {
  choices: readonly { id: string; name: string; color?: string }[]
  selected: readonly string[]
  onToggle: (id: string) => void
}) {
  if (choices.length === 0) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Варианты не заданы</p>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {choices.map((choice) => {
        const on = selected.includes(choice.id)
        return (
          <button
            key={choice.id}
            type="button"
            onClick={() => onToggle(choice.id)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              on
                ? 'border-sage-500 bg-sage-50 font-medium text-sage-700'
                : 'border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-muted)]'
            }`}
          >
            {choice.name}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Связи: поиск и галочки вместо списка с Ctrl. Выбранные подняты наверх —
 * иначе в длинной таблице непонятно, что вообще отмечено.
 */
function RelationPicker({
  options,
  selected,
  allowMultiple,
  onChange,
}: {
  options: readonly { id: string; title: string }[]
  selected: readonly string[]
  allowMultiple: boolean
  onChange: (value: unknown) => void
}) {
  const [query, setQuery] = useState('')

  const chosen = options.filter((option) => selected.includes(option.id))
  const rest = options
    .filter((option) => !selected.includes(option.id))
    .filter((option) => option.title.toLowerCase().includes(query.trim().toLowerCase()))

  const toggle = (id: string) => {
    if (!allowMultiple) return onChange(selected.includes(id) ? [] : [id])
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id])
  }

  if (options.length === 0) {
    return <p className="text-sm text-[var(--color-ink-muted)]">В связанной таблице нет строк</p>
  }

  return (
    <div className="space-y-2">
      {chosen.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chosen.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => toggle(option.id)}
              title="Убрать связь"
              className="flex items-center gap-1.5 rounded-full border border-sage-500 bg-sage-50 px-3 py-1 text-sm text-sage-700"
            >
              {option.title}
              <span className="text-xs">×</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]">Ничего не выбрано</p>
      )}

      {options.length > 6 ? (
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по строкам"
          className={BOX}
        />
      ) : null}

      <div className="max-h-44 overflow-y-auto rounded-lg border border-[var(--color-border-subtle)]">
        {rest.length === 0 ? (
          <p className="px-3 py-2 text-sm text-[var(--color-ink-muted)]">Ничего не найдено</p>
        ) : (
          rest.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => toggle(option.id)}
              className="flex w-full items-center gap-2 border-b border-[var(--color-border-subtle)] px-3 py-2 text-left text-sm last:border-0 hover:bg-[var(--color-surface-muted)]"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-sand-300 text-[10px]" />
              <span className="truncate">{option.title}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

const POPOVER_WIDTH = 340
const GAP = 8

/**
 * Всплывающая подсказка поверх карточки.
 *
 * Координаты считаются от кнопки и ставятся жёстко относительно окна:
 * внутри карточки она бы либо раздвигала поля, либо обрезалась полосой
 * прокрутки. Если места снизу мало — открывается вверх, если справа —
 * прижимается к краю окна.
 */
function HelpPopover({
  anchor,
  help,
  onEnter,
  onLeave,
}: {
  anchor: { current: HTMLElement | null }
  help: ReturnType<typeof describeField>
  onEnter: () => void
  onLeave: () => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const button = anchor.current
    const box = boxRef.current
    if (!button || !box) return

    const rect = button.getBoundingClientRect()
    const height = box.offsetHeight

    const below = rect.bottom + GAP
    const fitsBelow = below + height <= window.innerHeight - GAP
    const top = fitsBelow ? below : Math.max(GAP, rect.top - GAP - height)

    const left = Math.min(
      Math.max(GAP, rect.left),
      Math.max(GAP, window.innerWidth - POPOVER_WIDTH - GAP),
    )

    setPlace({ left, top })
  }, [anchor, help])

  return (
    <div
      ref={boxRef}
      role="tooltip"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        position: 'fixed',
        width: POPOVER_WIDTH,
        left: place?.left ?? -9999,
        top: place?.top ?? -9999,
        // До первого замера прячем: иначе подсказка мигнёт в левом верхнем углу.
        visibility: place ? 'visible' : 'hidden',
      }}
      className="z-[60] space-y-2 rounded-xl border border-sand-200 bg-white px-3.5 py-3 text-xs leading-relaxed shadow-lift"
    >
      <p>{help.what}</p>
      <p className="text-[var(--color-ink-muted)]">{help.how}</p>

      {help.dependsOn.length > 0 ? (
        <p>
          <span className="text-[var(--color-ink-muted)]">Откуда берётся: </span>
          {help.dependsOn.join('; ')}
        </p>
      ) : null}

      {help.affects.length > 0 ? (
        <p>
          <span className="text-[var(--color-ink-muted)]">Если изменить, пересчитается: </span>
          {help.affects.join('; ')}
        </p>
      ) : null}
    </div>
  )
}
