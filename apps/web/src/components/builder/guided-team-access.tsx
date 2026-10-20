'use client'

import { useState } from 'react'
import type { App } from '@tableapp/schema'
import { ownerInput, ownerSecondary, OwnerField } from '../owner-ui'
import { ShellIcon } from '../shell/icons'

/** Only edits the existing draft allowlist; publication and server authorization remain unchanged. */
export function GuidedTeamAccess({ app, onChange }: { app: App; onChange: (next: App) => void }) {
  const roles = app.roles.filter(role => role.id !== 'client' && app.screens.some(screen => !screen.access.public && screen.access.roles.includes(role.id)))
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '')
  const [error, setError] = useState('')
  return <section aria-labelledby="setup-team-title" className="space-y-5">
    <h3 id="setup-team-title" className="font-semibold">Сотрудники приложения</h3>
    <p className="max-w-xl text-sm leading-6 text-ink-soft">Сотрудник войдёт по коду на свою почту после публикации. Письмо-приглашение автоматически не отправляется.</p>
    {app.allowlist.length ? <ul className="divide-y divide-sand-200">{app.allowlist.map((entry, index) => <li key={`${entry.email}:${index}`} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="break-all text-sm font-medium">{entry.email || 'Адрес не заполнен'}</p><p className="mt-1 text-sm text-ink-soft">{app.roles.find(role => role.id === entry.roleId)?.name ?? entry.roleId}{entry.company ? ` · ${entry.company}` : ''}</p></div><button type="button" aria-label={`Убрать доступ для ${entry.email || 'незаполненного адреса'}`} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-sand-100 focus-visible:ring-2 focus-visible:ring-sage-400" onClick={() => onChange({ ...app, allowlist: app.allowlist.filter((_, at) => at !== index) })}><ShellIcon name="close" /></button></li>)}</ul> : <p className="text-sm text-ink-soft">Сотрудники ещё не добавлены.</p>}
    {roles.length ? <form onSubmit={event => {
      event.preventDefault()
      const normalized = email.trim().toLowerCase()
      if (app.allowlist.some(entry => entry.email.toLowerCase() === normalized)) { setError('Эта почта уже есть в списке. Изменить её роль можно в дополнительных настройках ниже.'); return }
      if (!normalized || !roles.some(role => role.id === roleId)) return
      onChange({ ...app, allowlist: [...app.allowlist, { email: normalized, roleId, company: '' }] })
      setEmail(''); setError('')
    }} className="space-y-4"><div className="grid items-start gap-4 sm:grid-cols-2"><OwnerField label="Почта сотрудника"><input required type="email" maxLength={254} value={email} onChange={event => { setEmail(event.target.value); setError('') }} className={`${ownerInput} text-base!`} /></OwnerField><OwnerField label="Рабочая роль"><select value={roleId} onChange={event => setRoleId(event.target.value)} className={`${ownerInput} text-base!`}>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></OwnerField></div>{error ? <p role="alert" className="text-sm leading-6 text-red-700">{error}</p> : null}<button type="submit" className={ownerSecondary}>Добавить сотрудника</button></form> : <p className="text-sm leading-6 text-ink-soft">Сначала откройте рабочие экраны нужной роли в дополнительных настройках.</p>}
    <p className="text-xs leading-5 text-ink-soft">Список сохраняется в черновике. Новый доступ начнёт действовать после публикации приложения.</p>
  </section>
}
