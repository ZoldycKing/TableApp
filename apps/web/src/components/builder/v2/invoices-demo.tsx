'use client'
import { useEffect, useState } from 'react'
import { fieldTimeZone, type Field } from '@tableapp/schema'
import { canOpenAppV2Screen, type AppV2Actor, type AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { templateExample } from '@/lib/templates/presentation'
import { buildInvoicesV2App } from '@/lib/templates/invoices-v2'
import { BuilderV2AppFrame, BuilderV2Theme } from './app-frame'
import { AppV2Renderer } from './view'
import { InvoicesRowsContext } from './invoices-screens'
import { TemplateDemoStage } from '@/components/marketing/template-demo-stage'
import { TemplateDemoControls } from '@/components/marketing/template-demo-controls'

const SCREENS = [
  { id: 'home', label: 'Документы' },
  { id: 'document', label: 'Документ' },
  { id: 'clients', label: 'Клиенты' },
  { id: 'products', label: 'Каталог' },
  { id: 'settings', label: 'Настройки' },
] as const

export function invoicesTemplateDemoModel(example = templateExample('scheta')) {
  const app = buildInvoicesV2App(example.built, { id: example.app.id, workspaceId: example.app.workspaceId, name: 'Счета и сметы', slug: 'scheta-demo', email: 'owner@example.invalid' })
  const kit = app.invoices!
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
    const values = { ...(row.data as AppV2Record['values']) }
    if (row.tableId === kit.settingsTableId) {
      values[kit.settings.logo] = [{ url: '/template-media/invoices/logo.png', name: 'logo.png', mime: 'image/png' }]
      values[kit.settings.signature] = [{ url: '/template-media/invoices/signature.png', name: 'signature.png', mime: 'image/png' }]
      values[kit.settings.stamp] = [{ url: '/template-media/invoices/stamp.png', name: 'stamp.png', mime: 'image/png' }]
    }
    return { id: row.id, tableId: row.tableId, values }
  })
  return { app, tables, rows, kit }
}

export function InvoicesDemo({ view = 'home', bare = false, phone = false, scheme }: { view?: string; bare?: boolean; phone?: boolean; scheme?: 'light' | 'dark' }) {
  const [model, setModel] = useState<ReturnType<typeof invoicesTemplateDemoModel> | null>(null)
  const [rows, setRows] = useState<AppV2Record[]>([])
  const [screenId, setScreenId] = useState('')
  const [recordId, setRecordId] = useState<string | undefined>()
  const [selected, setSelected] = useState(view)
  const [mobile, setMobile] = useState(phone)
  useEffect(() => { setMobile(phone) }, [phone])
  useEffect(() => { setModel(invoicesTemplateDemoModel()) }, [])
  useEffect(() => {
    if (!model) return
    const { kit } = model
    const invoice = model.rows.find(row => row.tableId === kit.documentsTableId && String(row.values[kit.document.number] ?? '').startsWith('СЧ-'))
      ?? model.rows.find(row => row.tableId === kit.documentsTableId)
    const act = model.rows.find(row => row.tableId === kit.documentsTableId && String(row.values[kit.document.number] ?? '').startsWith('АКТ-'))
    const goal = view === 'document' || view === 'payment' || view === 'edit' || view === 'pdf' || view === 'pdf-invoice'
      ? { screenId: kit.documentScreenId, recordId: invoice?.id, selected: 'document' }
      : view === 'pdf-act'
        ? { screenId: kit.documentScreenId, recordId: act?.id ?? invoice?.id, selected: 'document' }
      : view === 'clients' ? { screenId: kit.clientsScreenId, recordId: undefined, selected: 'clients' }
      : view === 'products' ? { screenId: kit.productsScreenId, recordId: undefined, selected: 'products' }
      : view === 'settings' ? { screenId: kit.settingsScreenId, recordId: undefined, selected: 'settings' }
      : { screenId: kit.homeScreenId, recordId: undefined, selected: 'home' }
    setScreenId(goal.screenId); setRecordId(goal.recordId); setSelected(goal.selected); setRows(model.rows)
  }, [model, view])
  if (!model?.app.invoices || !screenId) return <div data-invoices-root data-invoices-screen="loading" />
  const themed = scheme ? { ...model.app, theme: { ...model.app.theme, scheme } } : model.app
  const actor: AppV2Actor = { authenticated: true, roleIds: ['owner'], id: 'demo_owner', email: 'owner@example.invalid', name: 'Марина', company: '' }
  const visible = { ...themed, screens: themed.screens.filter(screen => canOpenAppV2Screen(themed, actor, screen.id)) }
  const navigate = (id: string, rowId?: string) => { setScreenId(id); setRecordId(rowId) }
  const record = rows.find(row => row.id === recordId)
  const open = view === 'payment' ? 'payment' as const : view === 'edit' ? 'edit' as const : view === 'pdf' || view === 'pdf-invoice' || view === 'pdf-act' ? 'pdf' as const : null
  const target = (id: string) => {
    const { kit } = model
    if (id === 'document') return { screenId: kit.documentScreenId, recordId: rows.find(row => row.tableId === kit.documentsTableId)?.id }
    if (id === 'clients') return { screenId: kit.clientsScreenId, recordId: undefined }
    if (id === 'products') return { screenId: kit.productsScreenId, recordId: undefined }
    if (id === 'settings') return { screenId: kit.settingsScreenId, recordId: undefined }
    return { screenId: kit.homeScreenId, recordId: undefined }
  }
  const frame = <BuilderV2Theme app={themed}><InvoicesRowsContext value={{ rows, setRows, open }}>
    <div data-invoices-root data-invoices-screen={selected} data-preview-screen={screenId}>
      <BuilderV2AppFrame app={visible} screenId={screenId} title="" phone={mobile} deviceMode={mobile ? 'phone' : 'desktop'} fullScreen={bare} onNavigate={navigate}>
        <AppV2Renderer live app={visible} tables={model.tables} actor={actor} screenId={screenId} record={record} onNavigate={navigate} />
      </BuilderV2AppFrame>
    </div>
  </InvoicesRowsContext></BuilderV2Theme>
  if (bare) return frame
  return <TemplateDemoStage phone={mobile} id="primer" controls={<TemplateDemoControls screens={SCREENS} selected={selected} phone={mobile} label="Экраны счетов" onDeviceChange={setMobile} onScreenChange={next => { const goal = target(next); setSelected(next); navigate(goal.screenId, goal.recordId) }} />} note="Учебные сметы и счета. Изменения сохраняются только на этой странице.">{frame}</TemplateDemoStage>
}