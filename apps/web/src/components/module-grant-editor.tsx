'use client'

import { useState } from 'react'
import { MODULE_DEFINITIONS, type App } from '@tableapp/schema'
import { setModuleGrant } from '@/lib/module-access'
import { ownerInput, ownerSecondary } from './owner-ui'

export function ModuleGrantEditor({ app, onChange }: { app: App; onChange: (app: App) => void }) {
  const [email, setEmail] = useState(''), [moduleId, setModuleId] = useState(app.modules?.[0]?.id ?? ''), [selectedRole, setSelectedRole] = useState('')
  const module = app.modules?.find(module => module.id === moduleId), roles = Object.values(module?.roles ?? {})
  const roleId = roles.includes(selectedRole) ? selectedRole : roles[0] ?? ''
  if (!app.moduleAccess) return null
  const change = (address: string, module: string, role: string | null) => onChange({ ...app, moduleAccess: setModuleGrant(app.moduleAccess!, address, module, role) })
  return <section className="@container min-w-0 space-y-4" aria-label="Доступ сотрудников">
    <div>
      <h3 className="text-base font-semibold">Доступ сотрудников</h3>
      <p className="mt-2 text-sm leading-6 text-ink-soft">Выберите, с чем будет работать сотрудник и какую роль он получит. Можно открыть несколько разделов.</p>
    </div>
    {app.moduleAccess.grants.length ? <ul className="space-y-3">{app.moduleAccess.grants.map(grant => {
      const assignedModule = app.modules!.find(item => item.id === grant.moduleId)!
      const name = MODULE_DEFINITIONS[assignedModule.kind].name
      return <li key={`${grant.email}:${grant.moduleId}`} className="min-w-0 space-y-3 rounded-xl border border-sand-200 p-3">
        <div className="min-w-0"><p className="break-all text-sm font-semibold">{grant.email}</p><p className="mt-1 text-sm text-ink-soft">{name}</p></div>
        <label className="block text-sm text-ink-soft">Роль
          <select value={grant.roleId} aria-label={`Роль ${grant.email} в «${name}»`} onChange={event => change(grant.email, grant.moduleId, event.target.value)} className={ownerInput}>
            {Object.values(assignedModule.roles ?? {}).map(id => <option key={id} value={id}>{app.roles.find(role => role.id === id)?.name ?? id}</option>)}
          </select>
        </label>
        <button type="button" aria-label={`Убрать доступ для ${grant.email} к «${name}»`} onClick={() => change(grant.email, grant.moduleId, null)} className={ownerSecondary}>Убрать доступ</button>
      </li>
    })}</ul> : <p className="text-sm text-ink-soft">Сотрудники ещё не добавлены.</p>}
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (roleId) { change(email, moduleId, roleId); setEmail('') } }}>
      <div className="grid min-w-0 gap-4 @min-[640px]:grid-cols-2">
        <label className="min-w-0 text-sm text-ink-soft @min-[640px]:col-span-2">Почта сотрудника
          <input aria-label="Почта сотрудника" required type="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} className={ownerInput} />
        </label>
        <label className="min-w-0 text-sm text-ink-soft">К чему дать доступ
          <select aria-label="К чему дать доступ" value={moduleId} onChange={event => setModuleId(event.target.value)} className={ownerInput}>{app.modules!.map(item => <option key={item.id} value={item.id}>{MODULE_DEFINITIONS[item.kind].name}</option>)}</select>
        </label>
        <label className="min-w-0 text-sm text-ink-soft">Рабочая роль
          <select aria-label="Рабочая роль" value={roleId} onChange={event => setSelectedRole(event.target.value)} className={ownerInput}>{roles.map(id => <option key={id} value={id}>{app.roles.find(role => role.id === id)?.name ?? id}</option>)}</select>
        </label>
      </div>
      <button type="submit" disabled={!roleId} className={ownerSecondary}>Добавить сотрудника</button>
    </form>
  </section>
}
