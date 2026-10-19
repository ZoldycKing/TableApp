'use client'

import { useState, useTransition } from 'react'
import { changeRoleAction, inviteMemberAction, removeMemberAction } from '@/app/team-actions'
import { MEMBER_ROLES, ROLE_LABELS, type MemberRole } from '@/lib/roles'

export type TeamRow = { userId: string; email: string; name: string | null; role: MemberRole; accepted: boolean; isSelf: boolean }

const ROLE_HINTS: Record<MemberRole, string> = {
  owner: 'Управление командой, таблицами и приложениями бизнеса.',
  editor: 'Изменение данных, полей и приложений. Без управления командой.',
  viewer: 'Просмотр таблиц и настроек. Без изменения данных.',
}
const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-sage-400'
const INPUT = `min-h-11 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-ink disabled:bg-sand-50 disabled:opacity-60 ${FOCUS}`

export function TeamManager({ rows, canManage }: { rows: TeamRow[]; canManage: boolean }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('editor')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ email: string; hint: string | null } | null>(null)
  const [pending, startTransition] = useTransition()
  const [inviting, setInviting] = useState(false)

  const run = (work: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    startTransition(async () => {
      try {
        const result = await work()
        if (!result.ok) setError(result.error ?? 'Не удалось выполнить действие. Попробуйте ещё раз.')
      } catch { setError('Не удалось связаться с сервером. Проверьте соединение и повторите действие.') }
    })
  }

  return <div className="space-y-6">
    <section aria-labelledby="team-members-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="team-members-heading" className="text-lg font-semibold text-ink">Доступ к кабинету</h2><p className="mt-1 text-sm text-ink-muted">Участники этого бизнеса: {rows.length}</p></div>
        {canManage ? <button type="button" aria-expanded={inviting} onClick={() => { setInviting(!inviting); setError(null) }} className={`rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-ink/90 ${FOCUS}`}>{inviting ? 'Закрыть приглашение' : 'Пригласить участника'}</button> : null}
      </div>
      {canManage && inviting ? <form className="mb-5 space-y-3 rounded-xl border border-sand-200 bg-white p-4" onSubmit={event => {
        event.preventDefault(); setError(null); setSent(null)
        startTransition(async () => {
          try {
            const result = await inviteMemberAction(email, role)
            if (!result.ok) return setError(result.error)
            setSent({ email, hint: result.hint }); setEmail('')
          } catch { setError('Не удалось отправить приглашение. Проверьте соединение и повторите попытку.') }
        })
      }}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
          <label className="block min-w-0 text-sm font-medium text-ink">Почта участника<input autoFocus type="email" required disabled={pending} value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" placeholder="kolleg@company.ru" className={`${INPUT} mt-1.5 block w-full`} /></label>
          <label className="block text-sm font-medium text-ink">Роль в кабинете<select disabled={pending} value={role} onChange={event => setRole(event.target.value as MemberRole)} className={`${INPUT} mt-1.5 block w-full`}>{MEMBER_ROLES.map(candidate => <option key={candidate} value={candidate}>{ROLE_LABELS[candidate]}</option>)}</select></label>
          <button type="submit" disabled={pending} className={`min-h-11 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-40 ${FOCUS}`}>{pending ? 'Отправляем…' : 'Отправить приглашение'}</button>
        </div>
        <p className="text-sm leading-6 text-ink-soft">{ROLE_HINTS[role]}</p>
      </form> : null}
      {sent ? <p role="status" className="mb-4 rounded-xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm text-sage-700">Приглашение отправлено на {sent.email}.{sent.hint ? <span className="mt-1 block">{sent.hint}</span> : null}</p> : null}
      {error ? <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
      <ul className="divide-y divide-sand-200 rounded-2xl border border-sand-200 bg-white">
        {rows.map(row => <li key={row.userId} className="flex flex-wrap items-start gap-3 p-4 sm:items-center sm:p-5">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sage-50 text-sm font-medium text-sage-700">{(row.name || row.email).trim().slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1 basis-36"><p className="break-words text-sm font-medium text-ink">{row.name || row.email}{row.isSelf ? <span className="ml-2 text-xs font-normal text-ink-muted">Вы</span> : null}</p>{row.name ? <p className="mt-1 break-all text-sm text-ink-soft">{row.email}</p> : null}<p className="mt-1 text-xs text-ink-muted">{row.accepted ? 'В команде' : 'Приглашение отправлено'}</p></div>
          <div className="w-full pl-[52px] sm:w-auto sm:pl-0">
            {canManage ? <label className="block text-xs text-ink-muted">Роль: {row.name || row.email}<select aria-label={`Роль: ${row.email}`} value={row.role} disabled={pending} onChange={event => run(() => changeRoleAction(row.userId, event.target.value))} className={`${INPUT} mt-1 block w-full sm:min-w-36`}>{MEMBER_ROLES.map(candidate => <option key={candidate} value={candidate}>{ROLE_LABELS[candidate]}</option>)}</select></label> : <span className="inline-flex rounded-md bg-sand-100 px-2 py-1 text-sm text-ink-soft">{ROLE_LABELS[row.role]}</span>}
          </div>
          {canManage ? <button type="button" disabled={pending} aria-label={`Исключить ${row.email}`} onClick={() => {
            if (window.confirm(`Исключить ${row.email} из команды?`)) run(() => removeMemberAction(row.userId))
          }} className={`ml-[52px] rounded-lg px-2 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40 sm:ml-0 ${FOCUS}`}>Исключить</button> : null}
        </li>)}
      </ul>
      {!canManage ? <p className="mt-3 text-sm text-ink-muted">Приглашать участников и менять роли может владелец бизнеса.</p> : null}
    </section>
    <details className="border-t border-sand-200 pt-5"><summary className={`cursor-pointer text-sm font-medium text-ink-soft ${FOCUS}`}>Что разрешено каждой роли</summary><dl className="mt-4 grid gap-4 sm:grid-cols-3">{MEMBER_ROLES.map(candidate => <div key={candidate}><dt className="text-sm font-semibold text-ink">{ROLE_LABELS[candidate]}</dt><dd className="mt-1 text-sm leading-6 text-ink-soft">{ROLE_HINTS[candidate]}</dd></div>)}</dl></details>
  </div>
}
