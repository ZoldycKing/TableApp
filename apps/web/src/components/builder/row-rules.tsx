'use client'

import type { App, Field, RowMatch } from '@tableapp/schema'
import { GUEST_ROLE } from '@tableapp/schema'
import { rolesForRowRules } from '@/lib/app-roles'
import type { TableSummary } from '@/lib/queries'

/**
 * Правила «видит только свои строки».
 *
 * Их может быть несколько на одну таблицу, и они складываются: строка видна,
 * если подошло хотя бы одно. Так «свои заказы и заказы своей фирмы» получается
 * двумя правилами, а добавление правила только расширяет доступ — рассуждать
 * об этом можно, не держа в голове всю таблицу.
 */

const MATCH_WORDS: Record<RowMatch, string> = {
  email: 'почтой вошедшего',
  company: 'его организацией',
}

const TEXTUAL = new Set(['email', 'text'])

export function RowRules({
  app,
  tables,
  onChange,
}: {
  app: App
  tables: TableSummary[]
  onChange: (next: App) => void
}) {
  const rules = app.rowAccessRules
  const setRules = (next: App['rowAccessRules']) => onChange({ ...app, rowAccessRules: next })

  const fieldsOf = (tableId: string): Field[] =>
    (tables.find((table) => table.id === tableId)?.fields ?? []).filter((field) =>
      TEXTUAL.has(field.type),
    )

  const add = () => {
    const table = tables[0]
    if (!table) return
    const candidates = fieldsOf(table.id)
    const chosen = candidates.find((field) => field.type === 'email') ?? candidates[0]
    setRules([
      ...rules,
      {
        tableId: table.id,
        fieldId: chosen?.id ?? '',
        match: 'email',
        appliesTo: [GUEST_ROLE, ...app.roles.filter((role) => role.isDefault).map((role) => role.id)],
      },
    ])
  }

  const patch = (index: number, changes: Partial<App['rowAccessRules'][number]>) =>
    setRules(rules.map((rule, at) => (at === index ? { ...rule, ...changes } : rule)))

  return (
    <div className="space-y-2">
      <div>
        <span className="block text-xs font-medium text-[var(--color-ink-muted)]">
          Кто какие строки видит
        </span>
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
          Без правил человек видит все строки таблицы. Правило сужает: он увидит только те,
          где поле совпало с ним самим.
        </p>
      </div>

      {rules.map((rule, index) => {
        const fields = fieldsOf(rule.tableId)
        const companyKnown = app.allowlist.some((entry) => entry.company.trim() !== '')

        return (
          <div key={index} className="space-y-1.5 rounded-lg border border-[var(--color-border-subtle)] p-2.5">
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-[var(--color-ink-muted)]">В таблице</span>
              <select
                value={rule.tableId}
                onChange={(event) => {
                  const tableId = event.target.value
                  const candidates = fieldsOf(tableId)
                  const chosen = candidates.find((field) => field.type === 'email') ?? candidates[0]
                  patch(index, { tableId, fieldId: chosen?.id ?? '' })
                }}
                className="rounded border border-[var(--color-border-subtle)] px-2 py-1 text-sm"
              >
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name}
                  </option>
                ))}
              </select>

              <span className="text-[var(--color-ink-muted)]">поле</span>
              <select
                value={rule.fieldId}
                onChange={(event) => patch(index, { fieldId: event.target.value })}
                className="rounded border border-[var(--color-border-subtle)] px-2 py-1 text-sm"
              >
                <option value="">— не выбрано —</option>
                {fields.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.name}
                  </option>
                ))}
              </select>

              <span className="text-[var(--color-ink-muted)]">совпадает с</span>
              <select
                value={rule.match}
                onChange={(event) => patch(index, { match: event.target.value as RowMatch })}
                className="rounded border border-[var(--color-border-subtle)] px-2 py-1 text-sm"
              >
                {(['email', 'company'] as RowMatch[]).map((match) => (
                  <option key={match} value={match}>
                    {MATCH_WORDS[match]}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setRules(rules.filter((_, at) => at !== index))}
                className="ml-auto rounded border border-[var(--color-border-subtle)] px-2 py-1 text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]"
              >
                ✕
              </button>
            </div>

            {rule.match === 'company' && !companyKnown ? (
              <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                Организация ни у кого не указана — правило не пропустит ни одной строки. Впишите
                организацию рядом с адресами в списке доступа.
              </p>
            ) : null}

            <div className="space-y-1">
              <span className="block text-xs font-medium text-[var(--color-ink-muted)]">
                К кому применять
              </span>
              {rolesForRowRules(app).map((role: { id: string; name: string }) => (
                <label key={role.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={rule.appliesTo.includes(role.id)}
                    onChange={() =>
                      patch(index, {
                        appliesTo: rule.appliesTo.includes(role.id)
                          ? rule.appliesTo.filter((item) => item !== role.id)
                          : [...rule.appliesTo, role.id],
                      })
                    }
                  />
                  <span>{role.name}</span>
                  {role.id === GUEST_ROLE ? (
                    <span className="text-xs text-[var(--color-ink-muted)]">
                      — не увидит ни одной строки
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          </div>
        )
      })}

      <button
        type="button"
        onClick={add}
        disabled={tables.length === 0}
        className="rounded border border-[var(--color-border-subtle)] px-2 py-1 text-xs hover:bg-[var(--color-surface-muted)] disabled:opacity-40"
      >
        + Правило
      </button>

      {rules.length > 1 ? (
        <p className="text-xs text-[var(--color-ink-muted)]">
          Правила складываются: строка видна, если подошло хотя бы одно.
        </p>
      ) : null}
    </div>
  )
}
