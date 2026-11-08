'use client'

import type { AllowlistEntry, App, RoleId } from '@tableapp/schema'
import { customerWorkflows } from '@tableapp/schema'
import { roleName } from '@/lib/app-roles'
import type { TableSummary } from '@/lib/queries'
import { RolesSettings } from '@/components/builder/roles-settings'
import { RowRules } from '@/components/builder/row-rules'
import { ModuleGrantEditor } from './module-grant-editor'
import { ownerInput, ownerSecondary } from './owner-ui'

const MODE_HINTS: Record<string, string> = {
  public:
    'Любой человек сможет войти по коду на свою почту.',
  allowlist: 'Добавьте почту человека и назначьте ему роль.',
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
  if (app.moduleAccess) return <div className="@container mt-4 max-w-3xl space-y-6"><ModuleGrantEditor app={app} onChange={onChange} /><RowRules app={app} tables={tables} onChange={onChange} /></div>

  const setEntries = (entries: AllowlistEntry[]) => onChange({ ...app, allowlist: entries })

  /** Гостя в списке доступа не назначают: гость — это тот, кого в списке нет. */
  const assignable = app.roles
  const fallbackRole = assignable[0]?.id ?? 'staff'

  return (
    <div className="@container mt-4 min-w-0 max-w-3xl space-y-6">
      <label className="block text-sm text-ink-soft">
        <span className="block font-semibold text-ink">Кто может войти</span>
        <select
          aria-label="Кто может войти"
          value={app.accessMode}
          onChange={(event) =>
            onChange({ ...app, accessMode: event.target.value as App['accessMode'] })
          }
          className={ownerInput}
        >
          <option value="allowlist">Только люди из списка</option>
          <option value="public">Любой, у кого есть ссылка</option>
        </select>
        <span className="mt-2 block leading-6">{MODE_HINTS[app.accessMode]}{app.accessMode === 'allowlist' && (app.booking || customerWorkflows(app).length > 0) ? ' Клиенты с оформленными заказами или записями также могут войти.' : ''}</span>
      </label>

      <RolesSettings app={app} onChange={onChange} />

      <section className="space-y-4" aria-label="Люди с доступом">
        <h3 className="text-base font-semibold">Люди с доступом</h3>

        {app.allowlist.length === 0 ? (
          <p className="text-sm leading-6 text-ink-soft">
            Список пока пуст. Добавьте человека, чтобы назначить ему роль.
          </p>
        ) : null}

        {app.allowlist.map((entry, index) => (
          <div key={`${entry.email}-${index}`} className="min-w-0 space-y-3 rounded-xl border border-sand-200 p-3">
            <div className="grid min-w-0 gap-3 @min-[640px]:grid-cols-2">
            <label className="min-w-0 text-sm text-ink-soft @min-[640px]:col-span-2">Почта
            <input
              aria-label={`Почта участника ${index + 1}`}
              type="email"
              maxLength={254}
              defaultValue={entry.email}
              onBlur={(event) => {
                const email = event.target.value.trim().toLowerCase()
                if (!email) return setEntries(app.allowlist.filter((_, at) => at !== index))
                setEntries(app.allowlist.map((item, at) => (at === index ? { ...item, email } : item)))
              }}
              className={ownerInput}
            />
            </label>
            <label className="min-w-0 text-sm text-ink-soft">Роль
            <select
              aria-label={`Роль для ${entry.email || `участника ${index + 1}`}`}
              value={entry.roleId}
              onChange={(event) =>
                setEntries(
                  app.allowlist.map((item, at) =>
                    at === index ? { ...item, roleId: event.target.value as RoleId } : item,
                  ),
                )
              }
              className={ownerInput}
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
            </label>
            {/* Организация нужна правилу «видит заказы своей фирмы». */}
            <label className="min-w-0 text-sm text-ink-soft">Организация
            <input
              aria-label={`Организация для ${entry.email || `участника ${index + 1}`}`}
              defaultValue={entry.company}
              placeholder="Необязательно"
              onBlur={(event) =>
                setEntries(
                  app.allowlist.map((item, at) =>
                    at === index ? { ...item, company: event.target.value.trim() } : item,
                  ),
                )
              }
              className={ownerInput}
            />
            </label>
            </div>
            <button
              type="button"
              onClick={() => setEntries(app.allowlist.filter((_, at) => at !== index))}
              aria-label={`Убрать доступ для ${entry.email || `участника ${index + 1}`}`}
              className={ownerSecondary}
            >
              Убрать из списка
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setEntries([...app.allowlist, { email: '', roleId: fallbackRole, company: '' }])}
          className={ownerSecondary}
        >
          Добавить человека
        </button>
      </section>

      <RowRules app={app} tables={tables} onChange={onChange} />
    </div>
  )
}
