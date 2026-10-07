'use client'

import type { ImportPreview, SheetInfo } from '@tableapp/import'
import type { Field, FieldType } from '@tableapp/schema'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { FIELD_LABELS, IMPORTABLE_TYPES } from '@/lib/field-labels'
import { formatCell } from '@/lib/format'
import {
  blockerAdvice,
  blockerText,
  columnsWord,
  isImportable,
  noteText,
  rowsWord,
  type PlanIssue,
  type SheetSetup,
} from '@/lib/import-plan'

/**
 * Части экрана импорта.
 *
 * Здесь только показ: ни одного серверного действия и ни одного решения.
 * Решения — в `import-screen.tsx` и в `lib/import-plan.ts`, и это не вкусовое
 * разделение. Правило «лист либо целиком, либо никак» должно проверяться
 * без браузера, а список листов с флажками — не то место, где такому правилу
 * можно доверять.
 */

const number = new Intl.NumberFormat('ru-RU')

export const PREVIEW_LIMIT = 50

/** Метка состояния листа. Цвет несёт то же, что и слово: без цвета понятно. */
function Tag({ tone, children }: { tone: 'plain' | 'warn' | 'bad' | 'good'; children: ReactNode }) {
  const look =
    tone === 'bad'
      ? 'border-red-200 bg-red-50 text-red-800'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : tone === 'good'
          ? 'border-sage-300 bg-sage-50 text-sage-700'
          : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] text-[var(--color-ink-muted)]'
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${look}`}>{children}</span>
}

/**
 * Выбор листов книги.
 *
 * Флажок у каждого листа, и ни один не ставится за человека, кроме первого
 * пригодного видимого. Скрытый лист прячут намеренно — решать за автора
 * книги, что лист снова нужен, мы не будем.
 */
export function SheetPicker({
  sheets,
  selected,
  onToggle,
}: {
  sheets: readonly SheetInfo[]
  selected: readonly string[]
  onToggle: (name: string, next: boolean) => void
}) {
  return (
    <ul className="space-y-3">
      {sheets.map((sheet) => {
        const ok = isImportable(sheet)
        const checked = selected.includes(sheet.name)

        return (
          <li key={sheet.name}>
            <label
              className={`flex gap-3 rounded-xl border p-4 ${
                ok
                  ? 'cursor-pointer border-[var(--color-border-subtle)] bg-[var(--color-surface)] hover:border-sage-400'
                  : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)]'
              }`}
            >
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-[var(--color-ink)]"
                checked={checked}
                disabled={!ok}
                onChange={(event) => onToggle(sheet.name, event.target.checked)}
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{sheet.name}</span>
                  {sheet.hidden ? <Tag tone="warn">скрытый лист</Tag> : null}
                  {ok ? null : <Tag tone="bad">не импортируется</Tag>}
                </p>

                <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                  {number.format(sheet.rows)} {rowsWord(sheet.rows)} · {sheet.columns} {columnsWord(sheet.columns)}
                </p>

                {sheet.header.length > 0 ? (
                  <p className="mt-1 truncate text-xs text-[var(--color-ink-muted)]" title={sheet.header.join(', ')}>
                    {sheet.header.join(' · ')}
                  </p>
                ) : null}

                {sheet.blockers.map((blocker) => (
                  <p key={blocker.kind} className="mt-2 text-sm text-red-800">
                    {blockerText(blocker)}
                    {blockerAdvice(blocker) ? (
                      <span className="text-[var(--color-ink-muted)]"> {blockerAdvice(blocker)}</span>
                    ) : null}
                  </p>
                ))}

                {sheet.notes.map((note) => (
                  <p key={note.kind} className="mt-2 text-sm text-amber-900">
                    {noteText(note)}
                  </p>
                ))}
              </div>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

/** Переключение между выбранными листами. Настройки каждого сохраняются. */
export function SheetTabs({
  setups,
  active,
  onSelect,
}: {
  setups: readonly SheetSetup[]
  active: string
  onSelect: (name: string) => void
}) {
  if (setups.length < 2) return null

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {setups.map((setup) => {
        const done = setup.outcome?.status === 'done' || setup.outcome?.status === 'repeat'
        const failed = setup.outcome?.status === 'failed'
        return (
          <button
            key={setup.name}
            type="button"
            onClick={() => onSelect(setup.name)}
            aria-current={setup.name === active ? 'true' : undefined}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              setup.name === active
                ? 'border-ink bg-ink text-white'
                : 'border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-muted)]'
            }`}
          >
            {setup.name}
            {done ? <span className="ml-1.5 text-xs">✓</span> : null}
            {failed ? <span className="ml-1.5 text-xs">!</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/** Куда лист ложится: новая таблица или уже существующая. */
export function Destination({
  setup,
  preview,
  tables,
  busy,
  onName,
  onTable,
}: {
  setup: SheetSetup
  preview: ImportPreview
  tables: readonly { id: string; name: string }[]
  busy: boolean
  onName: (name: string) => void
  onTable: (tableId: string | null) => void
}) {
  const mapped = Object.keys(setup.mapping).length

  return (
    <div className="grid gap-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] p-4 sm:grid-cols-2">
      <label className="block">
        <span className="text-sm font-medium">Куда</span>
        <select
          value={setup.destination.kind === 'new' ? 'new' : setup.destination.tableId}
          disabled={busy}
          onChange={(event) => onTable(event.target.value === 'new' ? null : event.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--color-border-subtle)] bg-white px-2 py-2 text-sm"
        >
          <option value="new">Создать новую таблицу</option>
          {tables.map((table) => (
            <option key={table.id} value={table.id}>
              Добавить в «{table.name}»
            </option>
          ))}
        </select>
      </label>

      {setup.destination.kind === 'new' ? (
        <label className="block">
          <span className="text-sm font-medium">Название таблицы</span>
          <input
            value={setup.destination.name}
            disabled={busy}
            onChange={(event) => onName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border-subtle)] bg-white px-2 py-2 text-sm"
          />
        </label>
      ) : (
        <p className="self-end text-sm text-[var(--color-ink-muted)]">
          Колонок сопоставлено: {mapped} из {preview.fields.length}. Выберите соответствие в шапке
          таблицы ниже; остальные колонки не перенесутся.
        </p>
      )}
    </div>
  )
}

/**
 * Предпросмотр листа.
 *
 * Та же таблица, что была раньше: слева направо колонки файла, сверху — что
 * с ними станет. В режиме «добавить в таблицу» вместо типа выбирается колонка
 * назначения: тип там уже задан, и менять его импортом нельзя.
 */
export function PreviewTable({
  preview,
  setup,
  targetFields,
  busy,
  onName,
  onType,
  onMap,
}: {
  preview: ImportPreview
  setup: SheetSetup
  targetFields: readonly Field[]
  busy: boolean
  onName: (index: number, value: string) => void
  onType: (index: number, value: FieldType) => void
  onMap: (column: number, targetId: string) => void
}) {
  const append = setup.destination.kind === 'existing'

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-border-subtle)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[var(--color-surface-muted)]">
            {preview.fields.map((field, index) => (
              <th
                key={field.id}
                className="min-w-44 border-b border-[var(--color-border-subtle)] px-3 py-2 text-left align-top"
              >
                {append ? (
                  <>
                    <p className="truncate font-medium" title={field.name}>
                      {field.name}
                    </p>
                    <select
                      value={setup.mapping[index] ?? ''}
                      disabled={busy}
                      onChange={(event) => onMap(index, event.target.value)}
                      className={`mt-1 w-full rounded border bg-white px-1.5 py-1 text-xs font-normal ${
                        setup.mapping[index]
                          ? 'border-sage-400 text-ink'
                          : 'border-[var(--color-border-subtle)] text-[var(--color-ink-muted)]'
                      }`}
                    >
                      <option value="">не переносить</option>
                      {targetFields.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <input
                      value={setup.nameOverrides[index] ?? field.name}
                      disabled={busy}
                      onChange={(event) => onName(index, event.target.value)}
                      className="w-full bg-transparent font-medium outline-none focus:underline"
                    />
                    <select
                      value={field.type}
                      disabled={busy}
                      onChange={(event) => onType(index, event.target.value as FieldType)}
                      className="mt-1 w-full rounded border border-[var(--color-border-subtle)] bg-white px-1.5 py-1 text-xs font-normal text-[var(--color-ink-muted)]"
                    >
                      {IMPORTABLE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {FIELD_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.rows.slice(0, PREVIEW_LIMIT).map((row, rowIndex) => (
            <tr key={rowIndex} className="even:bg-[var(--color-surface-muted)]/40">
              {preview.fields.map((field) => {
                // Пустая ячейка при непустом исходнике означает, что значение
                // не удалось привести к выбранному типу — это видно сразу.
                const text = formatCell(field, row[field.id])
                return (
                  <td
                    key={field.id}
                    className="max-w-80 truncate border-b border-[var(--color-border-subtle)] px-3 py-1.5"
                    title={text}
                  >
                    {text || <span className="text-[var(--color-ink-muted)]">—</span>}
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

/** Сводка перед запуском: что именно произойдёт и что этому мешает. */
export function Summary({
  lines,
  issues,
}: {
  lines: readonly string[]
  issues: readonly PlanIssue[]
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border-subtle)] p-4">
      <h2 className="text-sm font-medium">Что произойдёт</h2>
      <ul className="mt-2 space-y-1 text-sm text-[var(--color-ink-soft)]">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      {issues.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm">
          {issues.map((issue) => (
            <li
              key={issue.text}
              className={`rounded-lg border px-3 py-2 ${
                issue.level === 'block'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              {issue.text}
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        Сказано до запуска, а не после: человек, который ждёт от импорта
        перенесённую книгу целиком, должен узнать правду здесь.
      */}
      <p className="mt-3 text-xs leading-relaxed text-[var(--color-ink-muted)]">
        Импортируются значения ячеек. Формулы Excel и связи между листами
        автоматически не переносятся: после импорта таблицы независимы, связь
        между ними можно настроить полем «Связь с таблицей».
      </p>
    </div>
  )
}

/** Чем всё кончилось — по листу на строку, с числами и ссылками. */
export function Results({
  setups,
  onRetry,
  onMore,
  busy,
  more,
}: {
  setups: readonly SheetSetup[]
  onRetry: () => void
  onMore: () => void
  busy: boolean
  more: number
}) {
  const failed = setups.filter((setup) => setup.outcome?.status === 'failed')

  return (
    <section className="mt-6">
      <h2 className="text-lg font-medium">Результат импорта</h2>

      <ul className="mt-3 space-y-2">
        {setups.map((setup) => {
          const outcome = setup.outcome
          const ok = outcome?.status === 'done' || outcome?.status === 'repeat'
          return (
            <li
              key={setup.name}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                ok
                  ? 'border-sage-300 bg-sage-50'
                  : outcome?.status === 'failed'
                    ? 'border-red-200 bg-red-50'
                    : 'border-[var(--color-border-subtle)]'
              }`}
            >
              <span className="min-w-0">
                <span className="font-medium">{setup.name}</span>
                <span className="text-[var(--color-ink-soft)]"> — {outcome ? outcome.text : 'ещё не импортирован'}</span>
              </span>
              {ok && outcome?.tableId ? (
                <Link
                  href={`/t/${outcome.tableId}`}
                  className="shrink-0 rounded-lg border border-[var(--color-border-subtle)] bg-white px-3 py-1.5 font-medium hover:bg-[var(--color-surface-muted)]"
                >
                  Открыть таблицу
                </Link>
              ) : null}
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        {failed.length > 0 ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={busy}
            className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-40"
          >
            {busy ? 'Повторяем…' : `Повторить неудавшиеся: ${failed.length}`}
          </button>
        ) : null}
        {more > 0 ? (
          <button
            type="button"
            onClick={onMore}
            disabled={busy}
            className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)] disabled:opacity-40"
          >
            Импортировать оставшиеся листы: {more}
          </button>
        ) : null}
      </div>
    </section>
  )
}
