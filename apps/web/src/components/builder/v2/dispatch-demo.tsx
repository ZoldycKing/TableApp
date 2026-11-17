'use client'
import { useEffect, useState } from 'react'
import { fieldTimeZone, type Field } from '@tableapp/schema'
import { canOpenAppV2Screen, type AppV2, type AppV2Actor, type AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { templateExample } from '@/lib/templates/presentation'
import { buildDispatchV2App } from '@/lib/templates/dispatch-v2'
import { dispatchPortraitUrl } from '@/lib/templates/dispatch-portraits'
import { BuilderV2AppFrame, BuilderV2Theme } from './app-frame'
import { AppV2Renderer } from './view'
import { DispatchRowsContext } from './dispatch-screens'
import { TemplateDemoStage } from '@/components/marketing/template-demo-stage'
import { TemplateDemoControls } from '@/components/marketing/template-demo-controls'

const SCREENS = [
  { id: 'overview', label: 'Заявки' },
  { id: 'board', label: 'Доска дня' },
  { id: 'job', label: 'Заявка' },
  { id: 'client', label: 'Клиент' },
  { id: 'technician', label: 'Мастер' },
] as const

export function dispatchTemplateDemoModel(example = templateExample('zayavki')) {
  const app = buildDispatchV2App(example.built, { id: example.app.id, workspaceId: example.app.workspaceId, name: 'Заявки и выезды', slug: 'zayavki-demo', email: 'dispatcher@example.invalid' })
  const dispatch = app.dispatch!
  const tables: BuilderV2Table[] = example.built.tables.map(table => ({
    ...table, views: [], primaryFieldId: table.primaryFieldId,
    fields: example.built.fields.filter(field => field.tableId === table.id).map(field => ({
      id: field.id, name: field.name, type: field.type as Field['type'],
      ...(['date', 'datetime'].includes(field.type) ? { timeZone: fieldTimeZone(field as unknown as Field) } : {}),
      ...(field.type === 'relation' ? { relationTableId: String((field.options as { tableId?: string }).tableId ?? '') } : {}),
      ...(field.options.choices ? { choices: field.options.choices as { id: string; name: string; color?: string }[] } : {}),
    })),
  }))
  const rows = example.rows.map(row => {
    const values = { ...row.data }
    if (row.tableId === dispatch.mastersTableId) {
      const url = dispatchPortraitUrl(values[dispatch.master.name])
      if (url) values[dispatch.master.photo] = url
    }
    if (row.tableId === dispatch.jobsTableId && values[dispatch.job.what] === 'Замена ламп в витрине') {
      values[dispatch.job.signature] = [{ url: '/template-media/dispatch/act-signature.png', name: 'Подпись клиента.png', mime: 'image/png' }]
      values[dispatch.job.photo] = [{ url: '/template-media/dispatch/act-photo.jpg', name: 'Витрина.jpg', mime: 'image/jpeg' }]
    }
    return { id: row.id, tableId: row.tableId, values } as AppV2Record
  })
  return { app, tables, rows }
}

export function DispatchDemo({ phone = false, view = 'overview', bare = false }: { phone?: boolean; view?: string; bare?: boolean }) {
  const [model, setModel] = useState<ReturnType<typeof dispatchTemplateDemoModel> | null>(null)
  const [role, setRole] = useState<'owner' | 'staff'>('owner')
  const [screenId, setScreenId] = useState('')
  const [recordId, setRecordId] = useState<string | undefined>()
  const [selected, setSelected] = useState(view)
  const [rows, setRows] = useState<AppV2Record[]>([])
  const [boardView, setBoardView] = useState<'day' | 'week' | 'list' | undefined>()
  const [dropPreview, setDropPreview] = useState(false)
  const [open, setOpen] = useState<'complete' | 'repeat' | null>(null)
  const [mobile, setMobile] = useState(phone)
  useEffect(() => { setModel(dispatchTemplateDemoModel()) }, [])
  useEffect(() => {
    if (!model?.app.dispatch) return
    const dispatch = model.app.dispatch
    const jobByName = (name: string) => model.rows.find(row => row.tableId === dispatch.jobsTableId && row.values[dispatch.job.what] === name)
    const seriesField = dispatch.job.seriesId
    const series = seriesField ? model.rows.find(row => row.tableId === dispatch.jobsTableId && row.values[seriesField] === 'series-ac-veter') : undefined
    const goal = view === 'technician' ? { role: 'staff' as const, screenId: dispatch.technicianScreenId, recordId: undefined, selected: 'technician', boardView: undefined, dropPreview: false, open: null }
      : view === 'tech-job' || view === 'checklist' ? { role: 'staff' as const, screenId: dispatch.jobScreenId, recordId: jobByName('Замена циркуляционного насоса')?.id, selected: 'technician', boardView: undefined, dropPreview: false, open: null }
      : view === 'complete' ? { role: 'staff' as const, screenId: dispatch.jobScreenId, recordId: jobByName('Замена циркуляционного насоса')?.id, selected: 'technician', boardView: undefined, dropPreview: false, open: 'complete' as const }
      : view === 'recurring' ? { role: 'owner' as const, screenId: dispatch.jobScreenId, recordId: series?.id, selected: 'job', boardView: undefined, dropPreview: false, open: 'repeat' as const }
      : view === 'job' ? { role: 'owner' as const, screenId: dispatch.jobScreenId, recordId: jobByName('Замена ламп в витрине')?.id, selected: 'job', boardView: undefined, dropPreview: false, open: null }
      : view === 'client' ? { role: 'owner' as const, screenId: dispatch.clientScreenId, recordId: model.rows.find(row => row.values[dispatch.client.name] === 'Кафе «Огонёк»')?.id, selected: 'client', boardView: undefined, dropPreview: false, open: null }
      : view === 'week' ? { role: 'owner' as const, screenId: dispatch.boardScreenId, recordId: undefined, selected: 'board', boardView: 'week' as const, dropPreview: false, open: null }
      : view === 'board' ? { role: 'owner' as const, screenId: dispatch.boardScreenId, recordId: undefined, selected: 'board', boardView: 'day' as const, dropPreview: true, open: null }
      : { role: 'owner' as const, screenId: dispatch.overviewScreenId, recordId: undefined, selected: 'overview', boardView: undefined, dropPreview: false, open: null }
    const started = dispatch.job.onSiteAt
    const minutesField = dispatch.job.actualMinutes
    const prepared = view === 'checklist' && started && minutesField ? model.rows.map(row => row.id === goal.recordId ? { ...row, values: { ...row.values, [started]: new Date(Date.now() - 8 * 60_000).toISOString(), [minutesField]: null } } : row) : model.rows
    setRole(goal.role); setScreenId(goal.screenId); setRecordId(goal.recordId); setSelected(goal.selected); setBoardView(goal.boardView); setDropPreview(goal.dropPreview); setOpen(goal.open); setRows(prepared)
  }, [model, view])
  if (!model?.app.dispatch || !screenId) return <div data-dispatch-root data-dispatch-screen="loading" />
  const { app, tables } = model
  const dispatch = model.app.dispatch
  const target = (id: string) => {
    const jobByName = (name: string) => rows.find(row => row.tableId === dispatch.jobsTableId && row.values[dispatch.job.what] === name)
    if (id === 'technician') return { role: 'staff' as const, screenId: dispatch.technicianScreenId, recordId: undefined, selected: 'technician' }
    if (id === 'job') return { role: 'owner' as const, screenId: dispatch.jobScreenId, recordId: jobByName('Замена ламп в витрине')?.id, selected: 'job' }
    if (id === 'client') return { role: 'owner' as const, screenId: dispatch.clientScreenId, recordId: rows.find(row => row.values[dispatch.client.name] === 'Кафе «Огонёк»')?.id, selected: 'client' }
    if (id === 'board') return { role: 'owner' as const, screenId: dispatch.boardScreenId, recordId: undefined, selected: 'board' }
    return { role: 'owner' as const, screenId: dispatch.overviewScreenId, recordId: undefined, selected: 'overview' }
  }
  const actor: AppV2Actor = role === 'owner'
    ? { authenticated: true, id: 'demo_owner', roleIds: ['owner'], email: 'dispatcher@example.invalid', name: 'Диспетчер', company: '' }
    : { authenticated: true, id: 'demo_sergey', roleIds: ['staff'], email: 'sergey@example.invalid', name: 'Сергей Волков', company: '' }
  const visible = { ...app, screens: app.screens.filter(screen => canOpenAppV2Screen(app, actor, screen.id)) }
  const navigate = (id: string, rowId?: string) => { setScreenId(id); setRecordId(rowId) }
  const record = rows.find(row => row.id === recordId)
  const frame = <BuilderV2Theme app={app}><DispatchRowsContext value={{ rows, setRows, boardView, dropPreview, open }}>
    <div data-dispatch-root data-dispatch-screen={selected} data-preview-screen={screenId}>
      <BuilderV2AppFrame app={visible} screenId={screenId} title="" phone={mobile} deviceMode={mobile ? 'phone' : 'desktop'} onNavigate={id => navigate(id)}>
        <AppV2Renderer live app={visible} tables={tables} actor={actor} screenId={screenId} record={record} onNavigate={navigate} />
      </BuilderV2AppFrame>
    </div>
  </DispatchRowsContext></BuilderV2Theme>
  if (bare) return frame
  return <TemplateDemoStage phone={mobile} id="primer" controls={<TemplateDemoControls screens={SCREENS} selected={selected} phone={mobile} label="Экраны заявок" onDeviceChange={setMobile} onScreenChange={next => { const goal = target(next); setRole(goal.role); setSelected(goal.selected); navigate(goal.screenId, goal.recordId) }} />} note="Учебные заявки по Москве. Назначения и отчёты сохраняются только на этой странице.">{frame}</TemplateDemoStage>
}
