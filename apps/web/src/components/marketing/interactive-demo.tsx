'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowRightIcon, CheckIcon, TableIcon } from '@phosphor-icons/react/ssr'
import { AppShell } from '@/components/runtime/app-shell'
import { DemoStage } from './demo-stage'
import { DEMO_CLIENT_EMAIL, editDemoOrder, projectDemoWorkspace, type DemoEdit, type DemoWorkspace } from '@/lib/demo-workspace'
import type { Device } from '@/lib/demo-view'
import { formatCell } from '@/lib/format'
import styles from './elaya/first-visit.module.css'

export function InteractiveDemo({ data, initialRole, device, deviceChosen, roles }: {
  data: DemoWorkspace; initialRole: string; device: Device; deviceChosen: boolean; roles: { id: string; name: string }[]
}) {
  const [rows, setRows] = useState(data.rows)
  const [role, setRole] = useState(initialRole)
  const [changedId, setChangedId] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const sync = () => { const next = new URL(location.href).searchParams.get('role') ?? initialRole; setRole(roles.some(item => item.id === next) ? next : initialRole) }
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [initialRole, roles])
  const runtime = useMemo(() => projectDemoWorkspace(data, role, rows), [data, role, rows])
  const targetId = changedId ?? data.order.rowId
  const target = rows.find(row => row.id === targetId && row.tableId === data.order.tableId)!
  const titleField = data.fields.find(field => field.id === data.order.title)!
  const statusField = data.fields.find(field => field.id === data.order.status)!
  const amountField = data.fields.find(field => field.id === data.order.amount)!
  const detail = runtime.app.screens.find(screen => screen.type === 'detail' && screen.tableId === data.order.tableId)
  const visibleTarget = runtime.tables[data.order.tableId]?.rows.some(row => row.id === targetId)
  const selectRole = (next: string) => {
    setRole(next)
    const url = new URL(location.href); url.searchParams.set('role', next); history.pushState(null, '', url)
  }
  const update = (edit: DemoEdit) => {
    const result = editDemoOrder(data, rows, role, edit)
    if (!result.ok) return result
    setRows(result.rows); setChangedId(edit.rowId)
    return { ok: true as const }
  }
  const reset = () => { setRows(data.rows); setChangedId(null); setRevision(value => value + 1) }
  const clientCanSee = target.data[data.order.email] === DEMO_CLIENT_EMAIL
  return <DemoStage roles={roles} activeRole={role} initialDevice={device} deviceChosen={deviceChosen}
    onRolePick={selectRole} onReset={reset} note="Учебные данные · сбросятся при обновлении страницы"
    description={<p>{role === 'anonymous' ? 'Гость видит услуги. Заказы клиентов ему недоступны.' : role === 'client' ? 'Клиент видит только свои заказы и их текущий статус.' : 'Нажмите «Изменить», выберите новый статус и сохраните заказ.'}</p>}
    summary={<section className={styles.sharedRecord} data-changed={Boolean(changedId)} aria-label="Общая таблица владельца">
      <div className={styles.sharedHeading}><span><TableIcon size={18} aria-hidden />В таблице владельца</span><span role="status">{changedId ? <><CheckIcon size={16} aria-hidden />Обновлено</> : 'Тот же заказ'}</span></div>
      <div className={styles.sharedValues}><div><strong>{formatCell(titleField, target.data[titleField.id])}</strong><small>{formatCell(amountField, target.data[amountField.id])}</small></div><span key={`${target.id}:${String(target.data[statusField.id])}`} className={styles.sharedStatus}>{formatCell(statusField, target.data[statusField.id])}</span></div>
      {changedId && role !== 'client' && clientCanSee && <button type="button" onClick={() => selectRole('client')}>Посмотреть результат у клиента<ArrowRightIcon size={16} aria-hidden /></button>}
    </section>}>
    <AppShell key={`${role}:${revision}`} runtime={runtime} viewer={null} demo onDemoUpdate={update}
      demoRoleLabel={role === 'anonymous' ? 'Для посетителей' : role === 'client' ? 'Кабинет клиента' : 'Экран сотрудника'}
      initialScreenId={visibleTarget ? detail?.id : undefined} initialRowId={visibleTarget && detail ? targetId : undefined} />
  </DemoStage>
}
