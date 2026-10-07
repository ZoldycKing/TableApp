'use client'

import type { App, Field, RoleId, Screen, View } from '@tableapp/schema'

/**
 * Кто открывает экран.
 *
 * Стоит рядом с названием экрана, а не в отдельном разделе настроек: решение
 * «кому это видно» принимается в тот же момент, что и «что тут показано»,
 * и разносить их по разным местам — верный способ забыть про второе.
 *
 * Три вопроса разделены намеренно, потому что это три разных вопроса:
 * можно ли открыть экран, какие данные при этом видно, и кому из вошедших
 * он положен. Раньше первые два были склеены галочкой «Гость» в списке ролей,
 * и включить показ без входа значило показать всё, что на экране есть.
 */
export function ScreenAccessFields({
  app,
  screen,
  views,
  fieldsByTable,
  onChange,
}: {
  app: App
  screen: Screen
  /** Нужны, чтобы понять, какая таблица стоит за экраном-списком. */
  views: View[]
  fieldsByTable: Record<string, Field[]>
  onChange: (screen: Screen) => void
}) {
  const roles = screen.access.roles
  const toggleRole = (role: RoleId) =>
    onChange({
      ...screen,
      access: {
        ...screen.access,
        roles: roles.includes(role) ? roles.filter((item) => item !== role) : [...roles, role],
      },
    })

  const tableId = tableOfScreen(screen, views)
  const fields = tableId ? (fieldsByTable[tableId] ?? []) : []
  const open = new Set(screen.access.publicFields)

  const toggleField = (fieldId: string) =>
    onChange({
      ...screen,
      access: {
        ...screen.access,
        publicFields: open.has(fieldId)
          ? screen.access.publicFields.filter((item) => item !== fieldId)
          : [...screen.access.publicFields, fieldId],
      },
    })

  const hint = (role: { id: RoleId; isDefault: boolean }) =>
    role.isDefault ? 'все, кто вошёл и не указан отдельно' : 'из списка доступа'

  /*
   * Общедоступная форма создания — это приём заказов от незнакомых людей.
   * Чтобы принять такой заказ, человеку заводится кабинет с ролью по
   * умолчанию, а значит должно быть заранее сказано, где чьи строки.
   * Пока не сказано — приём не работает, и владелец должен узнать об этом
   * здесь, а не от клиента, у которого ничего не отправилось.
   */
  const intake = screen.access.public && screen.type === 'form' && screen.mode === 'create'
  const defaultRoleId = app.roles.find((role) => role.isDefault)?.id ?? null
  const ownRowsSet =
    defaultRoleId !== null &&
    tableId !== null &&
    app.rowAccessRules.some(
      (rule) => rule.tableId === tableId && rule.appliesTo.includes(defaultRoleId),
    )

  return (
    <div className="space-y-2 rounded-lg border border-[var(--color-border-subtle)] p-2.5">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={screen.access.public}
          onChange={(event) =>
            onChange({ ...screen, access: { ...screen.access, public: event.target.checked } })
          }
        />
        <span>
          Видно без входа
          <span className="block text-xs text-[var(--color-ink-muted)]">
            Экран смогут открыть все, у кого есть ссылка.
          </span>
        </span>
      </label>

      {screen.access.public ? (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5">
          <div>
            <p className="text-xs font-semibold text-amber-900">Публичные данные</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-900">
              {screen.type === 'form'
                ? 'Форму увидит и заполнит любой по ссылке. Готовые записи ему не показываются: выберите ниже, что из таблицы можно показать без входа.'
                : 'Выберите данные, которые можно показывать без входа. Любой человек по ссылке сможет увидеть выбранные поля.'}
            </p>
          </div>

          {intake ? (
            <div className="rounded-md border border-amber-300 bg-white/70 p-2">
              <p className="text-xs font-medium text-amber-900">
                {ownRowsSet
                  ? 'Заказ от незнакомого человека принимается так: он вводит почту, получает код, и у него появляется кабинет со своими записями.'
                  : 'Приём заказов пока не работает.'}
              </p>
              {ownRowsSet ? null : (
                <p className="mt-1 text-xs leading-relaxed text-amber-900">
                  Незнакомому человеку нужен кабинет, где видно его записи — и только
                  его. Задайте в правах доступа правило «видит только свои строки»
                  для роли{' '}
                  <b>{app.roles.find((role) => role.isDefault)?.name ?? 'по умолчанию'}</b>{' '}
                  в этой таблице. Без него форму видно, но отправить её нельзя:
                  иначе первый же заказавший увидел бы чужие записи.
                </p>
              )}
            </div>
          ) : null}

          {fields.length === 0 ? (
            <p className="text-xs text-amber-900">
              У экрана нет таблицы — показывать без входа нечего.
            </p>
          ) : (
            <div className="space-y-0.5">
              {fields.map((field) => (
                <label key={field.id} className="flex items-center gap-2 text-sm text-amber-900">
                  <input
                    type="checkbox"
                    checked={open.has(field.id)}
                    onChange={() => toggleField(field.id)}
                  />
                  <span className="truncate">{field.name}</span>
                </label>
              ))}
            </div>
          )}

          {fields.length > 0 && open.size === 0 ? (
            <p className="text-xs font-medium text-amber-900">
              Не выбрано ни одной колонки: экран откроется, но данных в нём не будет.
            </p>
          ) : null}

          {/* Ссылка на удалённую колонку копится молча — это надо показать. */}
          {screen.access.publicFields.some((id) => !fields.some((field) => field.id === id)) ? (
            <p className="text-xs text-amber-900">
              Среди выбранных есть удалённые колонки. Снимите и поставьте галочки заново.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1 border-t border-[var(--color-border-subtle)] pt-2">
        <span className="block text-xs font-medium text-[var(--color-ink-muted)]">
          Кому из вошедших открыт экран
        </span>

        {app.roles.map((role) => (
          <label key={role.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={roles.includes(role.id)}
              onChange={() => toggleRole(role.id)}
            />
            <span>{role.name}</span>
            <span className="text-xs text-[var(--color-ink-muted)]">— {hint(role)}</span>
          </label>
        ))}
      </div>

      {/* Роль могли удалить, а на экране она осталась: это надо показать. */}
      {roles.filter((id) => !app.roles.some((role) => role.id === id)).length > 0 ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          На экране остались удалённые роли. Снимите и поставьте галочки заново, чтобы не путаться.
        </p>
      ) : null}

      {roles.length === 0 && !screen.access.public ? (
        <p className="text-xs text-[var(--color-ink-muted)]">
          Экран закрыт для всех: он останется в приложении, но никому не покажется.
        </p>
      ) : null}

      {screen.type === 'detail' ? (
        <label className="flex items-start gap-2 border-t border-[var(--color-border-subtle)] pt-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={screen.access.allowDelete}
            onChange={(event) =>
              onChange({ ...screen, access: { ...screen.access, allowDelete: event.target.checked } })
            }
          />
          <span>
            Разрешить удаление записи
            <span className="block text-xs text-[var(--color-ink-muted)]">
              Удалять смогут те, кому открыт этот экран. Правило «только свои строки», если оно
              задано, продолжает действовать.
            </span>
          </span>
        </label>
      ) : null}
    </div>
  )
}

/** Таблица экрана: у списка через представление, у сводки своей нет. */
function tableOfScreen(screen: Screen, views: View[]): string | null {
  if (screen.type === 'list' || screen.type === 'tiles') {
    return views.find((view) => view.id === screen.source.viewId)?.tableId ?? null
  }
  if (screen.type === 'dashboard') return null
  return screen.tableId
}
