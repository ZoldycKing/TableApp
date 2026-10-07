'use client'

import type { App, RoleId } from '@tableapp/schema'
import { newId } from '@tableapp/schema'

/**
 * Роли приложения.
 *
 * Набор ролей задаёт владелец: «Врач» и «Пациент», «Курьер» и «Диспетчер» —
 * это его слова. Правила по всему приложению ссылаются на идентификатор роли,
 * поэтому переименование ничего не ломает, а удаление — ломает, и об этом
 * здесь сказано прямо.
 *
 * Гостя в списке нет намеренно: это не роль, а отсутствие входа. Будь он
 * обычной записью, его можно было бы удалить — и публичная форма приёма
 * заявок молча перестала бы работать.
 */
export function RolesSettings({
  app,
  onChange,
}: {
  app: App
  onChange: (next: App) => void
}) {
  const setRoles = (roles: App['roles']) => onChange({ ...app, roles })

  /** Где роль используется: показываем перед удалением, а не после. */
  const usage = (roleId: RoleId): number => {
    const onScreens = app.screens.filter((screen) => screen.access.roles.includes(roleId)).length
    const inList = app.allowlist.filter((entry) => entry.roleId === roleId).length
    const inRules = app.rowAccessRules.filter((rule) => rule.appliesTo.includes(roleId)).length
    return onScreens + inList + inRules
  }

  const add = () =>
    setRoles([...app.roles, { id: newId('role'), name: 'Новая роль', isDefault: false }])

  const remove = (roleId: RoleId) => {
    const used = usage(roleId)
    if (used > 0) {
      const name = app.roles.find((role) => role.id === roleId)?.name ?? 'роль'
      const ok = window.confirm(
        `Роль «${name}» используется в ${used} настройках. После удаления те экраны и правила останутся без неё. Удалить?`,
      )
      if (!ok) return
    }
    setRoles(app.roles.filter((role) => role.id !== roleId))
  }

  /** Роль по умолчанию одна: иначе непонятно, какую получит новый человек. */
  const makeDefault = (roleId: RoleId) =>
    setRoles(app.roles.map((role) => ({ ...role, isDefault: role.id === roleId })))

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-[var(--color-border-subtle)] p-3">
      <div>
        <span className="block text-xs font-medium text-[var(--color-ink-muted)]">Роли приложения</span>
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
          Назовите их так, как называете людей у себя: мастер, диспетчер, пациент. От роли зависит,
          какие экраны человек откроет и что сможет изменить.
        </p>
      </div>

      <div className="space-y-1.5">
        {app.roles.map((role) => (
          <div key={role.id} className="flex items-center gap-1.5">
            <input
              defaultValue={role.name}
              onBlur={(event) => {
                const name = event.target.value.trim()
                if (!name) return
                setRoles(app.roles.map((item) => (item.id === role.id ? { ...item, name } : item)))
              }}
              className="min-w-0 flex-1 rounded border border-[var(--color-border-subtle)] px-2 py-1.5 text-sm outline-none focus:border-sage-400"
            />

            <button
              type="button"
              onClick={() => makeDefault(role.id)}
              title="Эту роль получат все, кто вошёл и не указан в списке доступа"
              className={`shrink-0 rounded border px-2 py-1.5 text-xs transition-colors ${
                role.isDefault
                  ? 'border-sage-400 bg-sage-50 text-sage-700'
                  : 'border-[var(--color-border-subtle)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]'
              }`}
            >
              {role.isDefault ? 'по умолчанию' : 'сделать основной'}
            </button>

            <button
              type="button"
              onClick={() => remove(role.id)}
              title="Удалить роль"
              className="shrink-0 rounded border border-[var(--color-border-subtle)] px-2 py-1.5 text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="rounded border border-[var(--color-border-subtle)] px-2 py-1 text-xs hover:bg-[var(--color-surface-muted)]"
      >
        + Роль
      </button>

      {app.roles.every((role) => !role.isDefault) ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          Ни одна роль не основная. Тогда человек, вошедший по коду, но не указанный в списке
          доступа, останется гостем и увидит только то, что открыто всем.
        </p>
      ) : null}

      <p className="text-xs text-[var(--color-ink-muted)]">
        Тот, кто открыл ссылку и не входил, роли не получает вовсе — он никто. Что показать ему,
        решается на каждом экране отдельно переключателем «Видно без входа».
      </p>
    </div>
  )
}
