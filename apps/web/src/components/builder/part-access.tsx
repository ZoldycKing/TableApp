'use client'

import type { App } from '@tableapp/schema'


/**
 * Кому положена часть экрана: компонент карточки или блок сводки.
 *
 * Здесь же решается, какие поля роль вправе читать и писать: если поле
 * не выводит ни одна доступная ей часть, оно этой роли не приходит
 * и от неё не принимается. Одна настройка вместо двух матриц — полей
 * и видимости, — которые иначе разъедутся на второй неделе.
 */
export function PartAccess({
  app,
  screenRoles,
  roles,
  onChange,
  hint,
}: {
  app: App
  /** Роли экрана: от них считается «как у экрана». */
  screenRoles: readonly string[]
  /** `null` — как у экрана. */
  roles: readonly string[] | null
  onChange: (roles: string[] | null) => void
  /** Что именно произойдёт с остальными ролями: у поля и у блока это разное. */
  hint?: string
}) {
  const inherited = roles === null
  const chosen = roles ?? screenRoles
  const available = app.roles.filter((role) => screenRoles.includes(role.id))

  const toggle = (roleId: string) =>
    onChange(
      chosen.includes(roleId) ? chosen.filter((item) => item !== roleId) : [...chosen, roleId],
    )

  return (
    <div className="space-y-1.5 rounded-lg border border-[var(--color-border-subtle)] p-2.5">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={inherited}
          onChange={(event) => onChange(event.target.checked ? null : [...screenRoles])}
        />
        Как у экрана
      </label>

      {inherited ? (
        <p className="text-xs text-[var(--color-ink-muted)]">
          Видят все, кому открыт экран. Снимите галочку, чтобы спрятать это от части роле́й —
          например, себестоимость от клиента.
        </p>
      ) : (
        <>
          <span className="block text-xs font-medium text-[var(--color-ink-muted)]">
            Кому показывать
          </span>
          <div className="space-y-1">
            {available.map((role) => (
              <label key={role.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={chosen.includes(role.id)}
                  onChange={() => toggle(role.id)}
                />
                {role.name}
              </label>
            ))}
          </div>

          {hint ? <p className="text-xs text-[var(--color-ink-muted)]">{hint}</p> : null}

          {chosen.length === 0 ? (
            <p className="text-xs text-[var(--color-ink-muted)]">
              Это не увидит никто: останется в приложении, но не покажется.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
