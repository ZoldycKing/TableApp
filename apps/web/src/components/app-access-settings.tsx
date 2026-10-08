'use client'

import type { AllowlistEntry, App, Field, RoleId } from '@tableapp/schema'
import { GUEST_ROLE } from '@tableapp/schema'
import { roleName } from '@/lib/app-roles'
import type { TableSummary } from '@/lib/queries'
import { RolesSettings } from '@/components/builder/roles-settings'
import { RowRules } from '@/components/builder/row-rules'

const EMAIL_FIELD_TYPES = new Set(['email', 'text'])

const MODE_HINTS: Record<string, string> = {
  public:
    'Любой может войти по коду на почту и получить основную роль. Доступ к записям зависит от прав экранов и правил на строки. Без ограничивающих правил доступны все записи открытых этой роли экранов. Гостевые экраны доступны без входа.',
  allowlist: 'Войти могут только адреса из списка. Остальные увидят лишь то, что вы отметили «Видно без входа».',
}

/**
 * Доступ к приложению: кто входит, с какой ролью и какие строки видит.
 *
 * Роль отвечает на вопрос «что можно делать» и задаётся здесь, правило ниже —
 * на вопрос «с какими строками». Их намеренно видно рядом: почти все ошибки
 * в правах происходят оттого, что человек настроил одно и забыл про второе.
 */
export function AppAccessSettings({
  app,
  tables,
  onChange,
}: {
  app: App
  tables: TableSummary[]
  onChange: (next: App) => void
}) {
  const rule = app.rowAccessRules[0] ?? null
  const ruleTable = tables.find((table) => table.id === rule?.tableId)
  const emailFields = (candidate: TableSummary | undefined): Field[] =>
    (candidate?.fields ?? []).filter((field) => EMAIL_FIELD_TYPES.has(field.type))

  const setEntries = (entries: AllowlistEntry[]) => onChange({ ...app, allowlist: entries })

  /** Гостя в списке доступа не назначают: гость — это тот, кого в списке нет. */
  const assignable = app.roles
  const fallbackRole = assignable[0]?.id ?? 'staff'

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-[var(--color-border-subtle)] p-3">
      <label className="block space-y-1">
        <span className="block text-xs font-medium text-[var(--color-ink-muted)]">Кто может войти</span>
        <select
          value={app.accessMode}
          onChange={(event) =>
            onChange({ ...app, accessMode: event.target.value as App['accessMode'] })
          }
          className="w-full rounded border border-[var(--color-border-subtle)] px-2 py-1.5 text-sm outline-none focus:border-sage-400"
        >
          <option value="allowlist">Только адреса из списка</option>
          <option value="public">Любой по ссылке</option>
        </select>
        <span className="block text-xs text-[var(--color-ink-muted)]">{MODE_HINTS[app.accessMode]}</span>
      </label>

      {app.accessMode === 'public' ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Гостевые экраны увидит кто угодно, включая поисковых роботов. Проверьте на вкладке каждого
          экрана, что без входа открыто только то, что не жалко показать.
        </p>
      ) : null}

      <RolesSettings app={app} onChange={onChange} />

      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-[var(--color-ink-muted)]">
          Адреса, роли и организации
        </span>

        {app.allowlist.length === 0 ? (
          <p className="text-xs text-[var(--color-ink-muted)]">
            Пока никого. Добавьте адрес сотрудника — он войдёт по коду на почту.
          </p>
        ) : null}

        {app.allowlist.map((entry, index) => (
          <div key={`${entry.email}-${index}`} className="flex gap-1.5">
            <input
              defaultValue={entry.email}
              onBlur={(event) => {
                const email = event.target.value.trim().toLowerCase()
                if (!email) return setEntries(app.allowlist.filter((_, at) => at !== index))
                setEntries(app.allowlist.map((item, at) => (at === index ? { ...item, email } : item)))
              }}
              className="min-w-0 flex-1 rounded border border-[var(--color-border-subtle)] px-2 py-1.5 font-mono text-xs outline-none focus:border-sage-400"
            />
            <select
              value={entry.roleId}
              onChange={(event) =>
                setEntries(
                  app.allowlist.map((item, at) =>
                    at === index ? { ...item, roleId: event.target.value as RoleId } : item,
                  ),
                )
              }
              className="rounded border border-[var(--color-border-subtle)] px-2 py-1.5 text-xs outline-none focus:border-sage-400"
            >
              {/* Роль могли удалить, а запись осталась: показываем её как есть. */}
              {assignable.some((role) => role.id === entry.roleId) ? null : (
                <option value={entry.roleId}>{roleName(app, entry.roleId)}</option>
              )}
              {assignable.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            {/* Организация нужна правилу «видит заказы своей фирмы». */}
            <input
              defaultValue={entry.company}
              placeholder="организация"
              onBlur={(event) =>
                setEntries(
                  app.allowlist.map((item, at) =>
                    at === index ? { ...item, company: event.target.value.trim() } : item,
                  ),
                )
              }
              className="w-28 shrink-0 rounded border border-[var(--color-border-subtle)] px-2 py-1.5 text-xs outline-none focus:border-sage-400"
            />
            <button
              type="button"
              onClick={() => setEntries(app.allowlist.filter((_, at) => at !== index))}
              title="Убрать из списка"
              className="rounded border border-[var(--color-border-subtle)] px-2 text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]"
            >
              ✕
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setEntries([...app.allowlist, { email: '', roleId: fallbackRole, company: '' }])}
          className="rounded border border-[var(--color-border-subtle)] px-2 py-1 text-xs hover:bg-[var(--color-surface-muted)]"
        >
          + Адрес
        </button>
      </div>

      <RowRules app={app} tables={tables} onChange={onChange} />
    </div>
  )
}
