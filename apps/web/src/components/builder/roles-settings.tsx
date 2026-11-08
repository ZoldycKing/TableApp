'use client'

import type { App, RoleId } from '@tableapp/schema'
import { newId } from '@tableapp/schema'
import { ownerInput, ownerSecondary } from '../owner-ui'
import { ShellIcon } from '../shell/icons'

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
    <section className="space-y-4" aria-label="Роли приложения">
      <div>
        <h3 className="text-base font-semibold">Роли приложения</h3>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Роль определяет, какие разделы человек видит и что может менять.
        </p>
      </div>

      <div className="grid gap-3 @min-[640px]:grid-cols-2">
        {app.roles.map((role) => (
          <div key={role.id} className="flex items-end gap-2">
            <label className="min-w-0 flex-1 text-sm text-ink-soft">Название роли
            <input
              aria-label={`Название роли «${role.name}»`}
              defaultValue={role.name}
              onBlur={(event) => {
                const name = event.target.value.trim()
                if (!name) return
                setRoles(app.roles.map((item) => (item.id === role.id ? { ...item, name } : item)))
              }}
              className={ownerInput}
            />
            </label>

            <button
              type="button"
              onClick={() => remove(role.id)}
              aria-label={`Удалить роль «${role.name}»`}
              className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-sand-100 focus-visible:ring-2 focus-visible:ring-sage-400"
            >
              <ShellIcon name="close" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className={ownerSecondary}
      >
        Добавить роль
      </button>

      <label className="block max-w-md text-sm text-ink-soft">Роль по умолчанию
        <select aria-label="Роль по умолчанию" className={ownerInput} value={app.roles.find(role => role.isDefault)?.id ?? ''} onChange={event => makeDefault(event.target.value)}>
          <option value="" disabled>Не выбрана</option>
          {app.roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
        <span className="mt-2 block text-sm leading-6">При открытом входе её получают люди, которых нет в списке.</span>
      </label>
      {app.accessMode === 'public' && app.roles.every(role => !role.isDefault) ? <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">Роль по умолчанию не выбрана. Новым пользователям будут доступны только открытые экраны.</p> : null}
      <p className="text-sm leading-6 text-ink-soft">Без входа видны только экраны с отметкой «Видно без входа».</p>
    </section>
  )
}
