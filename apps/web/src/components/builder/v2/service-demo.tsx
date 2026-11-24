'use client'
import { useEffect, useState } from 'react'
import { fieldTimeZone, instantToWallClock, wallClockToInstant, type Field } from '@tableapp/schema'
import { canOpenAppV2Screen, type AppV2Actor, type AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { projectServiceRows } from '@/lib/service-persist'
import { templateExample } from '@/lib/templates/presentation'
import { buildServiceV2App } from '@/lib/templates/service-v2'
import { conversationShotAlert, conversationShotDraftFiles, conversationShotPage } from '@/components/runtime/conversation-shot'
import { BuilderV2AppFrame, BuilderV2Theme } from './app-frame'
import { ServiceRowsContext, type ServiceConversationShot, type ServiceOpen } from './service-screens'
import { AppV2Renderer } from './view'

export function serviceTemplateDemoModel(example = templateExample('service')) {
  const app = buildServiceV2App(example.built, { id: example.app.id, workspaceId: example.app.workspaceId, name: 'Сервисный центр', slug: 'service-demo', email: 'sergey@service-demo.ru' })
  const tables: BuilderV2Table[] = example.built.tables.map(table => ({
    ...table, views: [], primaryFieldId: table.primaryFieldId,
    fields: example.built.fields.filter(field => field.tableId === table.id).map(field => ({
      id: field.id, name: field.name, type: field.type as Field['type'],
      ...(['date', 'datetime'].includes(field.type) ? { timeZone: fieldTimeZone(field as unknown as Field) } : {}),
      ...(field.type === 'relation' ? { relationTableId: String((field.options as { tableId?: string }).tableId ?? '') } : {}),
      ...(field.options.choices ? { choices: field.options.choices as { id: string; name: string; color?: string }[] } : {}),
    })),
  }))
  const rows = example.rows.map(row => ({ id: row.id, tableId: row.tableId, values: { ...row.data } } as AppV2Record))
  return { app, tables, rows }
}

type DemoWho = 'sergey' | 'andrey' | 'petrov' | 'sidorova' | 'kim'

function demoNowMs(at = new Date()) {
  const wall = instantToWallClock(at, 'Europe/Moscow')
  if (!wall) return at.getTime()
  const [year, month, day] = wall.date.split('-').map(Number) as [number, number, number]
  return wallClockToInstant({ year, month, day, hour: 12, minute: 0, second: 0 }, 'Europe/Moscow').getTime()
}

/** Repair pages always use ConversationPanel so attachments stay on the real composer. */
function conversationShotFor(_view: string, staff: boolean): ServiceConversationShot {
  return {
    preview: conversationShotPage(staff),
    previewFiles: staff ? conversationShotDraftFiles : [],
    previewAlert: staff ? conversationShotAlert : null,
  }
}

function goalFor(model: ReturnType<typeof serviceTemplateDemoModel>, view: string) {
  const kit = model.app.service!
  const repair = (number: string) => model.rows.find(row => row.tableId === kit.repairsTableId && row.values[kit.repair.number] === number)
  const base = { who: 'andrey' as DemoWho, open: null as ServiceOpen, conversationShot: undefined as ServiceConversationShot | undefined }
  const bare = view.replace(/:files$/, '').replace(/-files$/, '')
  if (view === 'client' || view === 'cabinet') return { ...base, who: 'sidorova' as const, screenId: kit.clientListScreenId, recordId: undefined, open: null }
  if (bare === 'client-repair' || view === 'client-repair-files') return { ...base, who: 'sidorova' as const, screenId: kit.clientRepairScreenId, recordId: repair('РМ-1042')?.id, open: null, conversationShot: conversationShotFor(view, false) }
  if (view === 'dashboard') return { ...base, who: 'sergey' as const, screenId: kit.dashboardScreenId, recordId: undefined, open: null }
  if (view === 'clients') return { ...base, who: 'sergey' as const, screenId: kit.clientsScreenId, recordId: undefined, open: null }
  if (view === 'client-card') {
    const client = model.rows.find(row => row.tableId === kit.clientsTableId && row.values[kit.client.email] === 'm.sidorova@yandex.ru')
    return { ...base, who: 'sergey' as const, screenId: kit.clientScreenId, recordId: client?.id, open: null }
  }
  if (view === 'masters') return { ...base, who: 'sergey' as const, screenId: kit.mastersScreenId, recordId: undefined, open: null }
  if (view === 'create') return { ...base, who: 'andrey' as const, screenId: kit.repairsScreenId, recordId: undefined, open: 'create' as const }
  if (bare === 'repair' || view === 'repair-files' || view === 'note' || view === 'assign' || view === 'reply') {
    return {
      ...base,
      screenId: kit.repairScreenId,
      recordId: repair('РМ-1042')?.id,
      open: view === 'assign' ? 'assign' as const : view === 'reply' ? 'reply' as const : view === 'note' ? 'note' as const : null,
      conversationShot: conversationShotFor(view, true),
    }
  }
  if (view === 'repair-ready') return { ...base, screenId: kit.repairScreenId, recordId: repair('РМ-1039')?.id, open: null, conversationShot: conversationShotFor(view, true) }
  if (view === 'repair-parts') return { ...base, who: 'sergey' as const, screenId: kit.repairScreenId, recordId: repair('РМ-1041')?.id, open: null, conversationShot: conversationShotFor(view, true) }
  return { ...base, screenId: kit.repairsScreenId, recordId: undefined, open: null }
}

function actorFor(who: DemoWho): AppV2Actor {
  if (who === 'petrov') return { authenticated: true, id: 'demo_petrov', roleIds: ['client'], email: 'a.petrov@mail.ru', name: 'Алексей Петров', company: '' }
  if (who === 'sidorova') return { authenticated: true, id: 'demo_sidorova', roleIds: ['client'], email: 'm.sidorova@yandex.ru', name: 'Мария Сидорова', company: '' }
  if (who === 'kim') return { authenticated: true, id: 'demo_kim', roleIds: ['client'], email: 'm.kim@inbox.ru', name: 'Михаил Ким', company: '' }
  if (who === 'sergey') return { authenticated: true, id: 'demo_sergey', roleIds: ['owner'], email: 'sergey@service-demo.ru', name: 'Сергей Волков', company: '' }
  return { authenticated: true, id: 'demo_andrey', roleIds: ['staff'], email: 'andrey@service-demo.ru', name: 'Андрей Морозов', company: '' }
}

export function ServiceDemo({ view = 'repairs', bare = false, scheme, phone = false }: { view?: string; bare?: boolean; scheme?: 'light' | 'dark'; phone?: boolean }) {
  const [model, setModel] = useState<ReturnType<typeof serviceTemplateDemoModel> | null>(null)
  const [rows, setRows] = useState<AppV2Record[]>([])
  const [screenId, setScreenId] = useState('')
  const [recordId, setRecordId] = useState<string | undefined>()
  const [who, setWho] = useState<DemoWho>('andrey')
  const [open, setOpen] = useState<ServiceOpen>(null)
  const [conversationShot, setConversationShot] = useState<ServiceConversationShot | undefined>()
  useEffect(() => { setModel(serviceTemplateDemoModel()) }, [])
  useEffect(() => {
    if (!model) return
    const shotView = view === 'repair:files' ? 'repair-files' : view === 'client-repair:files' ? 'client-repair-files' : view
    const goal = goalFor(model, shotView)
    const actor = actorFor(goal.who)
    setWho(goal.who)
    setScreenId(goal.screenId)
    setRecordId(goal.recordId)
    setOpen(goal.open)
    setConversationShot(goal.conversationShot)
    setRows(goal.who === 'petrov' || goal.who === 'sidorova' || goal.who === 'kim' ? projectServiceRows(model.app, actor, model.rows) : model.rows)
  }, [model, view])
  if (!model?.app.service || !screenId) return <div data-service-root data-service-screen="loading" />
  const themed = scheme ? { ...model.app, theme: { ...model.app.theme, scheme } } : model.app
  const actor = actorFor(who)
  const visible = { ...themed, screens: themed.screens.filter(screen => canOpenAppV2Screen(themed, actor, screen.id)) }
  const navigate = (id: string, rowId?: string) => { setScreenId(id); setRecordId(rowId); setOpen(null) }
  return <BuilderV2Theme app={themed}><ServiceRowsContext value={{ rows, setRows, open, now: demoNowMs(), sample: true, conversationShot }}>
    <div data-service-root data-service-screen={view} data-preview-screen={screenId} data-conversation-files={conversationShot ? '1' : undefined}>
      <BuilderV2AppFrame app={visible} screenId={screenId} title="" phone={phone} deviceMode={phone ? 'phone' : 'desktop'} fullScreen={bare} onNavigate={navigate}>
        <AppV2Renderer live app={visible} tables={model.tables} actor={actor} screenId={screenId} record={rows.find(row => row.id === recordId)} onNavigate={navigate} />
      </BuilderV2AppFrame>
    </div>
  </ServiceRowsContext></BuilderV2Theme>
}
