'use client'

import { useState, useTransition } from 'react'
import { changeRoleAction, inviteMemberAction, removeMemberAction } from '@/app/team-actions'
import { MEMBER_ROLES, ROLE_LABELS, type MemberRole } from '@/lib/roles'

export type TeamRow = {
  userId: string
  email: string
  name: string | null
  role: MemberRole
  accepted: boolean
  isSelf: boolean
}

const ROLE_HINTS: Record<MemberRole, string> = {
  owner: 'Управляет командой, приложениями и данными',
  editor: 'Меняет данные и схему, но не состав команды',
  viewer: 'Только просмотр',
}

export function TeamManager({ rows, canManage }: { rows: TeamRow[]; canManage: boolean }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('editor')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ email: string; hint: string | null } | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (work: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    startTransition(async () => {
      const result = await work()
      if (!result.ok) setError(result.error ?? 'Не удалось выполнить действие')
    })
  }

  return (
    <div className="space-y-5">
      {canManage ? (
        <form
          className="space-y-2 rounded-xl border border-[var(--color-border-subtle)] p-4"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            setSent(null)
            startTransition(async () => {
              const result = await inviteMemberAction(email, role)
              if (!result.ok) return setError(result.error)
              setSent({ email, hint: result.hint })
              setEmail('')
            })
          }}
        >
          <h2 className="text-sm font-semibold">Пригласить участника</h2>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="kolleg@company.ru"
              className="min-w-56 flex-1 rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm outline-none focus:border-sage-400"
            />
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as MemberRole)}
              className="rounded-lg border border-[var(--color-border-subtle)] px-2 py-2 text-sm outline-none focus:border-sage-400"
            >
              {MEMBER_ROLES.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {ROLE_LABELS[candidate]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-40"
            >
              {pending ? 'Отправляем…' : 'Пригласить'}
            </button>
          </div>
          <p className="text-xs text-[var(--color-ink-muted)]">{ROLE_HINTS[role]}</p>

          {sent ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
              Приглашение отправлено на {sent.email}.
              {sent.hint ? <span className="mt-1 block text-xs">{sent.hint}</span> : null}
            </div>
          ) : null}
        </form>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[var(--color-border-subtle)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-muted)] text-left text-xs text-[var(--color-ink-muted)]">
            <tr>
              <th className="px-4 py-2 font-medium">Участник</th>
              <th className="px-4 py-2 font-medium">Роль</th>
              <th className="px-4 py-2 font-medium">Статус</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className="border-t border-[var(--color-border-subtle)]">
                <td className="px-4 py-2">
                  {row.email}
                  {row.isSelf ? (
                    <span className="ml-1 text-xs text-[var(--color-ink-muted)]">(вы)</span>
                  ) : null}
                </td>
                <td className="px-4 py-2">
                  {canManage ? (
                    <select
                      value={row.role}
                      disabled={pending}
                      onChange={(event) => run(() => changeRoleAction(row.userId, event.target.value))}
                      className="rounded border border-[var(--color-border-subtle)] px-2 py-1 text-sm outline-none focus:border-sage-400"
                    >
                      {MEMBER_ROLES.map((candidate) => (
                        <option key={candidate} value={candidate}>
                          {ROLE_LABELS[candidate]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    ROLE_LABELS[row.role]
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-[var(--color-ink-muted)]">
                  {row.accepted ? 'в команде' : 'приглашение отправлено'}
                </td>
                <td className="px-4 py-2 text-right">
                  {canManage ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(`Исключить ${row.email} из команды?`)) return
                        run(() => removeMemberAction(row.userId))
                      }}
                      className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      Исключить
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!canManage ? (
        <p className="text-sm text-[var(--color-ink-muted)]">
          Приглашать и менять роли может только владелец воркспейса.
        </p>
      ) : null}
    </div>
  )
}
