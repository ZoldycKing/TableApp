'use client'

import { useState } from 'react'
import { MODULE_DEFINITIONS, type App } from '@tableapp/schema'
import { setModuleGrant } from '@/lib/module-access'

export function ModuleGrantEditor({ app, onChange }: { app: App; onChange: (app: App) => void }) {
  const [email, setEmail] = useState(''), [moduleId, setModuleId] = useState(app.modules?.[0]?.id ?? ''), [selectedRole, setSelectedRole] = useState('')
  const module = app.modules?.find(module => module.id === moduleId), roles = Object.values(module?.roles ?? {})
  const roleId = roles.includes(selectedRole) ? selectedRole : roles[0] ?? ''
  if (!app.moduleAccess) return null
  const change = (address: string, module: string, role: string | null) => onChange({ ...app, moduleAccess: setModuleGrant(app.moduleAccess!, address, module, role) })
  return <div className="space-y-3">
    <p className="text-xs leading-relaxed text-ink-muted">Клиенты видят свои обращения после входа. Рабочие права назначаются отдельно для каждой возможности; одна почта может получить несколько назначений.</p>
    {app.moduleAccess.grants.map(grant => <div key={`${grant.email}:${grant.moduleId}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-sand-50 p-2 text-xs">
      <span className="min-w-0 break-all font-medium">{grant.email}</span><span className="text-ink-muted">{MODULE_DEFINITIONS[app.modules!.find(module => module.id === grant.moduleId)!.kind].name}</span>
      <select value={grant.roleId} aria-label={`Роль ${grant.email}`} onChange={event => change(grant.email, grant.moduleId, event.target.value)} className="rounded border border-sand-200 px-2 py-1">
        {Object.values(app.modules!.find(module => module.id === grant.moduleId)!.roles ?? {}).map(id => <option key={id} value={id}>{app.roles.find(role => role.id === id)?.name ?? id}</option>)}
      </select><button type="button" onClick={() => change(grant.email, grant.moduleId, null)} className="ml-auto underline underline-offset-2">Убрать назначение</button>
    </div>)}
    <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); if (roleId) { change(email, moduleId, roleId); setEmail('') } }}>
      <input aria-label="Почта сотрудника" required type="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="Почта сотрудника" className="min-w-0 flex-1 rounded-lg border border-sand-200 px-2 py-1.5 text-xs" />
      <select aria-label="Возможность для сотрудника" value={moduleId} onChange={event => setModuleId(event.target.value)} className="max-w-full rounded-lg border border-sand-200 px-2 py-1.5 text-xs">{app.modules!.map(module => <option key={module.id} value={module.id}>{MODULE_DEFINITIONS[module.kind].name}</option>)}</select>
      <select aria-label="Рабочая роль" value={roleId} onChange={event => setSelectedRole(event.target.value)} className="max-w-full rounded-lg border border-sand-200 px-2 py-1.5 text-xs">{roles.map(id => <option key={id} value={id}>{app.roles.find(role => role.id === id)?.name ?? id}</option>)}</select>
      <button type="submit" disabled={!roleId} className="rounded-lg border border-sand-200 px-2 py-1.5 text-xs disabled:opacity-50">Добавить назначение</button>
    </form>
  </div>
}
