'use client'
import { useEffect, useRef, useState } from 'react'
import { fieldTimeZone, instantToWallClock, wallClockToInstant, type Field } from '@tableapp/schema'
import { canOpenAppV2Screen, type AppV2Actor, type AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { projectSupportRows } from '@/lib/support-persist'
import { templateExample } from '@/lib/templates/presentation'
import { supportPortraitUrl } from '@/lib/templates/support-portraits'
import { buildSupportV2App } from '@/lib/templates/support-v2'
import { BuilderV2AppFrame, BuilderV2Theme } from './app-frame'
import { SupportRowsContext, type SupportOpen } from './support-screens'
import { AppV2Renderer } from './view'

export function supportTemplateDemoModel(example = templateExample('podderzhka')) {
  const app = buildSupportV2App(example.built, { id: example.app.id, workspaceId: example.app.workspaceId, name: 'Обращения и поддержка', slug: 'podderzhka-demo', email: 'marina@example.invalid' })
  const kit = app.support!
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
    if (row.tableId === kit.operatorsTableId && kit.operator.photo) {
      const url = supportPortraitUrl(values[kit.operator.name])
      if (url) values[kit.operator.photo] = url
    }
    return { id: row.id, tableId: row.tableId, values } as AppV2Record
  })
  return { app, tables, rows }
}

type DemoWho = 'anna' | 'irina' | 'marina' | 'petr'

function demoNowMs(at = new Date()) {
  const wall = instantToWallClock(at, 'Europe/Moscow')
  if (!wall) return at.getTime()
  const [year, month, day] = wall.date.split('-').map(Number) as [number, number, number]
  return wallClockToInstant({ year, month, day, hour: 12, minute: 0, second: 0 }, 'Europe/Moscow').getTime()
}

function goalFor(model: ReturnType<typeof supportTemplateDemoModel>, view: string) {
  const kit = model.app.support!
  const ticket = (number: string) => model.rows.find(row => row.tableId === kit.ticketsTableId && row.values[kit.ticket.number] === number)
  const base = { who: 'anna' as DemoWho, open: null as SupportOpen, previewClient: undefined as string | undefined, previewMenuOpen: false }
  if (view === 'client' || view === 'create') return { ...base, who: 'irina' as const, screenId: kit.clientListScreenId, recordId: undefined, open: view === 'create' ? 'create' as const : null }
  if (view === 'client-preview') return { ...base, who: 'anna' as const, screenId: kit.clientListScreenId, recordId: undefined, open: null, previewClient: 'i.petrova@mail.ru', previewMenuOpen: true }
  if (view === 'client-ticket') return { ...base, who: 'petr' as const, screenId: kit.clientTicketScreenId, recordId: ticket('ОБР-1042')?.id, open: null }
  if (view === 'client-waiting') return { ...base, who: 'petr' as const, screenId: kit.clientTicketScreenId, recordId: ticket('ОБР-1033')?.id, open: null }
  if (view === 'settings') return { ...base, who: 'marina' as const, screenId: kit.settingsScreenId, recordId: undefined, open: null }
  if (view === 'dashboard') return { ...base, who: 'anna' as const, screenId: kit.dashboardScreenId ?? kit.queueScreenId, recordId: undefined, open: null }
  if (view === 'clients') return { ...base, screenId: kit.clientsScreenId, recordId: undefined, open: null }
  if (view === 'ticket' || view === 'note' || view === 'assign' || view === 'reply') return { ...base, screenId: kit.ticketScreenId, recordId: ticket('ОБР-1042')?.id, open: view === 'assign' ? 'assign' as const : view === 'reply' ? 'reply' as const : view === 'note' ? 'note' as const : null }
  return { ...base, screenId: kit.queueScreenId, recordId: undefined, open: null }
}

function actorFor(who: DemoWho): AppV2Actor {
  if (who === 'irina') return { authenticated: true, id: 'demo_irina', roleIds: ['client'], email: 'i.petrova@mail.ru', name: 'Ирина Петрова', company: '' }
  if (who === 'petr') return { authenticated: true, id: 'demo_petr', roleIds: ['client'], email: 'p.orlov@yandex.ru', name: 'Пётр Орлов', company: '' }
  if (who === 'marina') return { authenticated: true, id: 'demo_marina', roleIds: ['owner'], email: 'marina@example.invalid', name: 'Марина Соколова', company: '' }
  return { authenticated: true, id: 'demo_anna', roleIds: ['staff'], email: 'anna@example.invalid', name: 'Анна Волкова', company: '' }
}

export function SupportDemo({ view = 'queue', bare = false, scheme, phone = false }: { view?: string; bare?: boolean; scheme?: 'light' | 'dark'; phone?: boolean }) {
  const [model, setModel] = useState<ReturnType<typeof supportTemplateDemoModel> | null>(null)
  const [rows, setRows] = useState<AppV2Record[]>([])
  const [screenId, setScreenId] = useState('')
  const [recordId, setRecordId] = useState<string | undefined>()
  const [who, setWho] = useState<DemoWho>('anna')
  const [open, setOpen] = useState<SupportOpen>(null)
  const [previewClient, setPreviewClient] = useState<string | undefined>()
  const [previewMenuOpen, setPreviewMenuOpen] = useState(false)
  const queueFocus = useRef<import('@/lib/support-logic').SupportQueueFocus | null>(null)
  useEffect(() => { setModel(supportTemplateDemoModel()) }, [])
  useEffect(() => {
    if (!model) return
    const [baseView, ticketsView] = view.split(':')
    const goal = goalFor(model, baseView || view)
    const actor = actorFor(goal.who)
    setWho(goal.who)
    setScreenId(goal.screenId)
    setRecordId(goal.recordId)
    setOpen(goal.open)
    setPreviewClient(goal.previewClient)
    setPreviewMenuOpen(goal.previewMenuOpen)
    if (ticketsView === 'hot' || ticketsView === 'mine' || ticketsView === 'unassigned' || ticketsView === 'waiting' || ticketsView === 'closed' || ticketsView === 'open') {
      queueFocus.current = { view: ticketsView }
    } else if ((baseView || view) === 'queue') {
      queueFocus.current = { view: 'open' }
    }
    setRows(goal.who === 'irina' || goal.who === 'petr' ? projectSupportRows(model.app, actor, model.rows) : model.rows)
  }, [model, view])
  if (!model?.app.support || !screenId) return <div data-support-root data-support-screen="loading" />
  const themed = scheme ? { ...model.app, theme: { ...model.app.theme, scheme } } : model.app
  const actor = actorFor(who)
  const visible = { ...themed, screens: themed.screens.filter(screen => canOpenAppV2Screen(themed, actor, screen.id)) }
  const navigate = (id: string, rowId?: string) => { setScreenId(id); setRecordId(rowId); setOpen(null) }
  return <BuilderV2Theme app={themed}><SupportRowsContext value={{ rows, setRows, open, now: demoNowMs(), sample: true, queueFocus, previewClient, previewMenuOpen }}>
    <div data-support-root data-support-screen={view} data-preview-screen={screenId}>
      <BuilderV2AppFrame app={visible} screenId={screenId} title="" phone={phone} deviceMode={phone ? 'phone' : 'desktop'} fullScreen={bare} onNavigate={navigate}>
        <AppV2Renderer live app={visible} tables={model.tables} actor={actor} screenId={screenId} record={rows.find(row => row.id === recordId)} onNavigate={navigate} />
      </BuilderV2AppFrame>
    </div>
  </SupportRowsContext></BuilderV2Theme>
}
