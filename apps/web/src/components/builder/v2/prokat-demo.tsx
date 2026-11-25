'use client'
import { useEffect, useState } from 'react'
import { fieldTimeZone, instantToWallClock, wallClockToInstant, type Field } from '@tableapp/schema'
import { canOpenAppV2Screen, type AppV2Actor, type AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { projectProkatRows } from '@/lib/prokat-persist'
import { templateExample } from '@/lib/templates/presentation'
import { buildProkatV2App } from '@/lib/templates/prokat-v2'
import { BuilderV2AppFrame, BuilderV2Theme } from './app-frame'
import { ProkatRowsContext, type ProkatOpen } from './prokat-screens'
import { AppV2Renderer } from './view'

export function prokatTemplateDemoModel(example = templateExample('prokat')) {
  const app = buildProkatV2App(example.built, { id: example.app.id, workspaceId: example.app.workspaceId, name: 'Прокат', slug: 'prokat-demo', email: 'owner@prokat-demo.ru' })
  const kit = app.prokat!
  const tables: BuilderV2Table[] = example.built.tables.map(table => ({
    ...table, views: [], primaryFieldId: table.primaryFieldId,
    fields: example.built.fields.filter(field => field.tableId === table.id).map(field => ({
      id: field.id, name: field.name, type: field.type as Field['type'],
      ...(['date', 'datetime'].includes(field.type) ? { timeZone: fieldTimeZone(field as unknown as Field) } : {}),
      ...(field.type === 'relation' ? { relationTableId: String((field.options as { tableId?: string }).tableId ?? '') } : {}),
      ...(field.options.choices ? { choices: field.options.choices as { id: string; name: string; color?: string }[] } : {}),
    })),
  }))
  const rows = example.rows.map(row => ({ id: row.id, tableId: row.tableId, values: { ...row.data } }) as AppV2Record)
  return { app, tables, rows, kit }
}

type DemoWho = 'owner' | 'staff' | 'client'

function demoNowMs(at = new Date()) {
  const wall = instantToWallClock(at, 'Europe/Moscow')
  if (!wall) return at.getTime()
  const [year, month, day] = wall.date.split('-').map(Number) as [number, number, number]
  return wallClockToInstant({ year, month, day, hour: 12, minute: 0, second: 0 }, 'Europe/Moscow').getTime()
}

function goalFor(model: ReturnType<typeof prokatTemplateDemoModel>, view: string) {
  const kit = model.kit
  const booking = (number: string) => model.rows.find(row => row.tableId === kit.bookingsTableId && row.values[kit.booking.number] === number)
  const item = (serial: string) => model.rows.find(row => row.tableId === kit.itemsTableId && row.values[kit.item.serial] === serial)
  const client = (email: string) => model.rows.find(row => row.tableId === kit.clientsTableId && row.values[kit.client.email] === email)
  const base = { who: 'staff' as DemoWho, open: null as ProkatOpen }
  if (view === 'dashboard') return { ...base, who: 'owner' as const, screenId: kit.dashboardScreenId, recordId: undefined }
  if (view === 'bookings' || view === 'create') return { ...base, screenId: kit.bookingsScreenId, recordId: undefined, open: view === 'create' ? 'create' as const : null }
  if (view === 'booking' || view === 'issue' || view === 'return') {
    return {
      ...base,
      screenId: kit.bookingScreenId,
      recordId: booking('ПР-1002')?.id ?? booking('ПР-1001')?.id,
      open: view === 'issue' ? 'issue' as const : view === 'return' ? 'return' as const : null,
    }
  }
  if (view === 'items') return { ...base, screenId: kit.itemsScreenId, recordId: undefined }
  if (view === 'item') return { ...base, screenId: kit.itemScreenId, recordId: item('ВЕЛ-1001')?.id }
  if (view === 'timeline') return { ...base, screenId: kit.timelineScreenId, recordId: undefined }
  if (view === 'clients') return { ...base, who: 'owner' as const, screenId: kit.clientsScreenId, recordId: undefined }
  if (view === 'client-card') return { ...base, who: 'owner' as const, screenId: kit.clientScreenId, recordId: client('m.petrova@yandex.ru')?.id }
  if (view === 'catalog' || view === 'request') return { ...base, who: 'client' as const, screenId: kit.catalogScreenId, recordId: undefined, open: view === 'request' ? 'request' as const : null }
  if (view === 'client' || view === 'cabinet') return { ...base, who: 'client' as const, screenId: kit.clientListScreenId, recordId: undefined }
  if (view === 'client-booking') return { ...base, who: 'client' as const, screenId: kit.clientBookingScreenId, recordId: booking('ПР-1002')?.id ?? booking('ПР-1001')?.id }
  return { ...base, screenId: kit.bookingsScreenId, recordId: undefined }
}

function actorFor(who: DemoWho): AppV2Actor {
  if (who === 'client') return { authenticated: true, id: 'demo_client', roleIds: ['client'], email: 'm.petrova@yandex.ru', name: 'Мария Петрова', company: '' }
  if (who === 'owner') return { authenticated: true, id: 'demo_owner', roleIds: ['owner'], email: 'owner@prokat-demo.ru', name: 'Руководитель проката', company: '' }
  return { authenticated: true, id: 'demo_staff', roleIds: ['staff'], email: 'anna@prokat-demo.ru', name: 'Анна Смирнова', company: '' }
}

export function ProkatDemo({ view = 'bookings', bare = false, scheme, phone = false }: { view?: string; bare?: boolean; scheme?: 'light' | 'dark'; phone?: boolean }) {
  const [model, setModel] = useState<ReturnType<typeof prokatTemplateDemoModel> | null>(null)
  const [rows, setRows] = useState<AppV2Record[]>([])
  const [screenId, setScreenId] = useState('')
  const [recordId, setRecordId] = useState<string | undefined>()
  const [who, setWho] = useState<DemoWho>('staff')
  const [open, setOpen] = useState<ProkatOpen>(null)
  useEffect(() => { setModel(prokatTemplateDemoModel()) }, [])
  useEffect(() => {
    if (!model) return
    const goal = goalFor(model, view)
    const actor = actorFor(goal.who)
    setWho(goal.who)
    setScreenId(goal.screenId)
    setRecordId(goal.recordId)
    setOpen(goal.open)
    setRows(goal.who === 'client' ? projectProkatRows(model.app, actor, model.rows) : model.rows)
  }, [model, view])
  if (!model?.app.prokat || !screenId) return <div data-prokat-root data-prokat-screen="loading" />
  const themed = scheme ? { ...model.app, theme: { ...model.app.theme, scheme } } : model.app
  const actor = actorFor(who)
  const visible = { ...themed, screens: themed.screens.filter(screen => canOpenAppV2Screen(themed, actor, screen.id)) }
  const navigate = (id: string, rowId?: string) => { setScreenId(id); setRecordId(rowId); setOpen(null) }
  return <BuilderV2Theme app={themed}><ProkatRowsContext value={{ rows, setRows, open, now: demoNowMs(), sample: true }}>
    <div data-prokat-root data-prokat-screen={view} data-preview-screen={screenId}>
      <BuilderV2AppFrame app={visible} screenId={screenId} title="" phone={phone} deviceMode={phone ? 'phone' : 'desktop'} fullScreen={bare} onNavigate={navigate}>
        <AppV2Renderer live app={visible} tables={model.tables} actor={actor} screenId={screenId} record={rows.find(row => row.id === recordId)} onNavigate={navigate} />
      </BuilderV2AppFrame>
    </div>
  </ProkatRowsContext></BuilderV2Theme>
}
