'use client'
import { useRef, useState } from 'react'
import { instantToWallClock } from '@tableapp/schema'
import { canOpenAppV2Screen, evaluateAppV2Condition, projectAppV2Row, resolveAppV2Binding, type AppV2, type AppV2Actor, type AppV2Json, type AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import type { BuilderV2DataRecord } from '@/lib/builder-v2-data-types'
import type { BuilderV2FormRequest, BuilderV2FormResult, BuilderV2FormOptionsResult, BuilderV2FormState } from '@/lib/builder-v2-form-types'
import { builderV2FormInputs } from '@/lib/builder-v2-form-types'
import type { BuilderV2SubmitRequest } from '@/lib/builder-v2-submit-types'
import { bookingV2Availability } from '@/lib/builder-v2-booking-availability'
import { slotError, oneRelation, type BookingData } from '@/lib/booking'
import { builderV2BookingWriteError } from '@/lib/builder-v2-booking-policy'
import { BuilderV2AppFrame, BuilderV2Theme } from './app-frame'
import { PublishedV2Context, type PublishedV2Transport } from './published-context'
import { BookingDemoAvailability } from './booking-time'
import { BookingScheduleDemoContext } from './booking-schedule'
import { TemplateDemoStage } from '@/components/marketing/template-demo-stage'
import { TemplateDemoControls } from '@/components/marketing/template-demo-controls'
import { bookingSchedulePlan, type BookingScheduleAdapter } from '@/lib/builder-v2-booking-schedule'
import { AppV2Renderer } from './view'
import { BookingCalendarDemoContext } from './booking-calendar'
import { bookingCalendarSnapshot } from '@/lib/builder-v2-booking-calendar'
import { bookingTeamSnapshot } from '@/lib/builder-v2-booking-people'
import { BookingPeopleDemoContext } from './booking-people-data'
import css from './booking.module.css'

const DEMO_SCREENS = [
  { id: 'catalog', label: 'Услуги' },
  { id: 'service', label: 'Карточка услуги' },
  { id: 'client', label: 'Кабинет клиента' },
  { id: 'team', label: 'Команда' },
] as const

/** Synthetic, in-memory adapter. Real applications always use server-backed transport. */
export function BookingDemo({ app, tables, initialRows, phone = false, initialView }: { app: AppV2; tables: BuilderV2Table[]; initialRows: AppV2Record[]; phone?: boolean; initialView?: string }) {
  const booking = app.booking!
  const target = (view: string) => {
    if (view === 'client') return { role: 'client', screenId: booking.clientScreenId, recordId: undefined }
    if (view === 'service') {
      const service = initialRows.find(row => row.tableId === booking.tables.services)
      return { role: 'client', screenId: service ? booking.serviceScreenId : booking.catalogScreenId, recordId: service?.id }
    }
    if (view === 'team') {
      return { role: 'owner', screenId: booking.listScreenId!, recordId: undefined }
    }
    return { role: 'client', screenId: booking.catalogScreenId, recordId: undefined }
  }
  const initialTab = DEMO_SCREENS.find(screen => screen.id === initialView)?.id ?? 'catalog'
  const initial = target(initialTab)
  const [selectedView, setSelectedView] = useState<string>(initialTab)
  const [role, setRole] = useState(initial.role), [screenId, setScreenId] = useState(initial.screenId), [recordId, setRecordId] = useState<string | undefined>(initial.recordId), [rows, setRows] = useState(initialRows), [version, setVersion] = useState(0), [notice, setNotice] = useState('')
  const [mobile, setMobile] = useState(phone)
  const scheduleReceipts = useRef(new Map<string, string>())
  const store = useRef(rows); store.current = rows
  const timeZone = tables.find(table => table.id === booking.tables.visits)?.fields.find(field => field.id === booking.visit.start)?.timeZone ?? 'Europe/Moscow'
  const actor: AppV2Actor = { authenticated: true, id: `demo_${role}`, roleIds: [role], email: role === 'owner' ? 'owner@example.com' : 'irina@example.com', name: role === 'owner' ? 'Анна' : 'Ирина', company: '' }
  const visibleApp = { ...app, screens: app.screens.filter(screen => canOpenAppV2Screen(app, actor, screen.id)) }
  const format = (row: AppV2Record): BuilderV2DataRecord => {
    const values = projectAppV2Row(app, actor, row)
    const display = Object.fromEntries(Object.entries(values).map(([id, value]) => {
      const field = tables.find(table => table.id === row.tableId)?.fields.find(field => field.id === id)
      const label = field?.type === 'relation' && Array.isArray(value) ? value.map(id => {
        const linked = store.current.find(row => row.id === id), primary = tables.find(table => table.id === linked?.tableId)?.primaryFieldId
        return linked && primary ? String(projectAppV2Row(app, actor, linked)[primary] ?? '') : ''
      }).filter(Boolean).join(', ') : field?.choices?.find(choice => choice.id === value)?.name ?? (typeof value === 'number' && id === booking.service.price ? `${value.toLocaleString('ru-RU')} ₽` : String(value ?? ''))
      return [id, label]
    }))
    return { ...row, values, display }
  }
  const data = (): BookingData => {
    const of = (tableId: string) => store.current.filter(row => row.tableId === tableId).map(row => ({ id: row.id, data: { ...row.values } }))
    return { services: of(booking.tables.services), masters: of(booking.tables.masters), schedule: of(booking.tables.schedule), visits: of(booking.tables.visits), ...(booking.clients ? { clients: of(booking.clients.tableId) } : {}), timeZone }
  }
  const navigate = (id: string, rowId?: string) => { setScreenId(id); setRecordId(rowId); setNotice('') }
  const inspect = async (request: BuilderV2FormRequest): Promise<BuilderV2FormResult | BuilderV2FormOptionsResult> => {
    const form = app.nodes.find(node => node.id === request.formId)
    if (form?.type !== 'form') return { ok: false, error: 'Форма недоступна.' }
    const record = store.current.find(row => row.id === request.recordId)
    const fields = builderV2FormInputs(app, form)
    if (request.mode === 'options') {
      const input = fields.find(input => input.fieldId === request.fieldId)
      const field = tables.find(table => table.id === form.tableId)?.fields.find(field => field.id === input?.fieldId)
      if (!field?.relationTableId) return { ok: false, error: 'Поле недоступно.' }
      const primary = tables.find(table => table.id === field.relationTableId)?.primaryFieldId
      return { ok: true, next: null, options: store.current.filter(row => row.tableId === field.relationTableId && Object.keys(projectAppV2Row(app, actor, row)).length).map(row => ({ id: row.id, label: String(primary ? row.values[primary] ?? '' : '') })).filter(option => option.label.toLocaleLowerCase('ru-RU').includes(request.search.toLocaleLowerCase('ru-RU'))) }
    }
    const values: Record<string, AppV2Json> = {}, labels: Record<string, string> = {}
    for (const input of fields) {
      const result = input.initialValue ? resolveAppV2Binding(input.initialValue, { actor, row: record, screenRow: record }) : null
      values[input.fieldId] = input.readOnly && result?.ok ? result.value : request.mode === 'check' && !input.readOnly ? request.values[input.fieldId] ?? null : form.mode === 'edit' ? record?.values[input.fieldId] ?? null : result?.ok ? result.value : null
      const row = record ? format(record) : null
      labels[input.fieldId] = row?.display[input.fieldId] ?? ''
    }
    const errors: Record<string, string> = {}
    if (request.mode === 'check') for (const input of fields) if (input.required && (values[input.fieldId] === null || values[input.fieldId] === '' || Array.isArray(values[input.fieldId]) && !(values[input.fieldId] as unknown[]).length)) errors[input.id] = `Заполните поле «${input.label}»`
    if (Object.keys(errors).length) return { ok: false, error: 'Заполните отмеченные поля.', errors }
    const state: BuilderV2FormState & { revision: string } = { values, labels, revision: 'demo', fingerprint: `demo-${version}`, fields: fields.map(input => {
      const field = tables.find(table => table.id === form.tableId)!.fields.find(field => field.id === input.fieldId)!
      return { nodeId: input.id, fieldId: input.fieldId, type: field.type, label: input.label, required: input.required, readOnly: Boolean(input.readOnly), supported: true, choices: field.choices, timeZone: field.timeZone, allowMultiple: field.id === booking.master.services }
    }) }
    return { ok: true, state }
  }
  const submit = async (request: BuilderV2SubmitRequest) => {
    const checked = await inspect({ ...request, mode: 'check' })
    const form = app.nodes.find(node => node.id === request.formId)
    if (!checked.ok || !('state' in checked) || form?.type !== 'form') return checked.ok ? { ok: false as const, error: 'Форма недоступна.' } : checked
    const current = store.current.find(row => row.id === request.recordId)
    const before = form.mode === 'edit' ? current : undefined
    const policyError = builderV2BookingWriteError(app, actor, form.tableId, checked.state.values, before?.values as Record<string, unknown>, Date.now(), timeZone)
    if (policyError) return { ok: false as const, error: policyError }
    const values = { ...before?.values, ...checked.state.values }
    const newClients: AppV2Record[] = []
    if (form.tableId === booking.tables.visits) {
      const serviceId = oneRelation(values[booking.visit.service]), masterId = oneRelation(values[booking.visit.master])
      if (values[booking.visit.status] !== booking.statuses.cancelled && (form.id === booking.createFormId || form.id === booking.ownerCreateFormId || form.id === booking.rescheduleFormId)) {
        const error = serviceId && masterId ? slotError(booking, data(), { serviceId, masterId, start: values[booking.visit.start], excludeId: before?.id, minutes: before ? Number(before.values[booking.visit.minutes]) : undefined }) : 'Выберите свободное время.'
        if (error) return { ok: false as const, error }
      }
      if (!before && serviceId) {
        const service = store.current.find(row => row.id === serviceId)!
        values[booking.visit.price] = service.values[booking.service.price]!
        values[booking.visit.minutes] = service.values[booking.service.minutes]!
        if (role === 'client') values[booking.visit.email] = actor.email
      }
      if (masterId) values[booking.visit.masterEmail] = store.current.find(row => row.id === masterId)?.values[booking.master.email] ?? ''
      if (!before && booking.clients) {
        const c = booking.clients, linkedId = oneRelation(values[c.linkFieldId]), email = String(values[booking.visit.email] ?? '').trim().toLowerCase()
        const matches = email ? store.current.filter(row => row.tableId === c.tableId && String(row.values[c.email] ?? '').trim().toLowerCase() === email) : []
        let client = linkedId ? store.current.find(row => row.tableId === c.tableId && row.id === linkedId) : matches.length === 1 ? matches[0] : undefined
        if (linkedId && !client) return { ok: false as const, error: 'Клиент не найден.' }
        if (!client) { client = { id: `demo_${crypto.randomUUID().replaceAll('-', '')}`, tableId: c.tableId, values: { [c.name]: values[booking.visit.client]!, [c.phone]: values[booking.visit.phone]!, [c.email]: email, [c.note]: '' } }; newClients.push(client) }
        if (linkedId) { values[booking.visit.client] = client.values[c.name]!; values[booking.visit.phone] = client.values[c.phone]!; values[booking.visit.email] = client.values[c.email] ?? '' }
        values[c.linkFieldId] = [client.id]
      }
    }
    const saved: AppV2Record = { id: before?.id ?? `demo_${crypto.randomUUID().replaceAll('-', '')}`, tableId: form.tableId, values }
    const next = before ? store.current.map(row => row.id === saved.id ? saved : row) : [...store.current, ...newClients, saved]
    store.current = next; setRows(next); setVersion(value => value + 1)
    return { ok: true as const, repeated: false, rowId: saved.id, tableId: saved.tableId, effects: saved.tableId === booking.tables.visits
      ? [{ type: 'open_screen' as const, screenId: booking.visitScreenId, recordId: saved.id }]
      : [{ type: 'notify' as const, message: 'Изменения сохранены.' }] }
  }
  const buttonState = { revision: 'demo', fingerprint: `demo-${version}`, recordLabel: 'Визит', tableName: 'Записи', actionName: 'Отменить запись', stepCount: 1 }
  const scheduleAdapter: BookingScheduleAdapter = {
    read: async scope => {
      if (role !== 'owner') return { ok: false, error: 'Рабочие часы доступны администратору.' }
      const checked = await inspect({ ...scope, mode: 'initial' })
      return checked.ok && 'state' in checked ? { ok: true, state: { revision: 'demo', fingerprint: checked.state.fingerprint, values: checked.state.values, masters: data().masters.map(row => ({ id: row.id, name: String(row.data[booking.master.name]) })) } } : { ok: false, error: 'Не удалось открыть рабочие часы.' }
    },
    save: async request => {
      if (role !== 'owner') return { ok: false, error: 'Рабочие часы доступны администратору.' }
      const payload = JSON.stringify(request)
      const previous = scheduleReceipts.current.get(request.requestId)
      if (previous) return previous === payload ? { ok: true, repeated: true } : { ok: false, error: 'Откройте рабочие часы заново.' }
      if (request.fingerprint !== `demo-${version}`) return { ok: false, stale: true, error: 'Рабочие часы изменились. Откройте форму заново.' }
      const master = data().masters.find(row => row.id === request.input.masterId)
      if (!master) return { ok: false, error: 'Выберите мастера.' }
      const plan = bookingSchedulePlan(booking, request.input, String(master.data[booking.master.name]))
      if (!plan.ok) return plan
      const next = [...store.current]
      plan.rows.forEach((values, index) => {
        const existing = index === 0 && request.recordId ? next.findIndex(row => row.id === request.recordId) : -1
        const row = { id: existing >= 0 ? request.recordId! : `demo_${crypto.randomUUID().replaceAll('-', '')}`, tableId: booking.tables.schedule, values }
        if (existing >= 0) next[existing] = row; else next.push(row)
      })
      store.current = next; setRows(next); setVersion(value => value + 1); scheduleReceipts.current.set(request.requestId, payload)
      return { ok: true, repeated: false }
    },
  }
  const transport: PublishedV2Transport = {
    slug: app.slug, revision: 'demo', dataVersion: version, navigate, back: id => navigate(id), invalidate: message => { setNotice(message); setVersion(value => value + 1) }, refresh: message => { setNotice(message ?? ''); setVersion(value => value + 1) },
    tableName: id => tables.find(table => table.id === id)?.name ?? '', buttonState: () => buttonState,
    readData: async request => {
      const node = app.nodes.find(node => node.id === request.nodeId), source = node && 'sourceId' in node && app.sources.find(source => source.id === node.sourceId)
      if (!source) return { ok: false, error: 'Источник недоступен.' }
      const items = store.current.filter(row => row.tableId === source.tableId && Object.keys(projectAppV2Row(app, actor, row)).length).filter(row => {
        if (source.filter) { const match = evaluateAppV2Condition(source.filter, { actor, row }); if (!match.ok || !match.value) return false }
        if (request.calendarDay && instantToWallClock(String(row.values[booking.visit.start]), timeZone)?.date !== request.calendarDay) return false
        return !request.search || String(row.values[source.searchFieldIds[0] ?? ''] ?? '').toLowerCase().includes(request.search.toLowerCase())
      }).map(format)
      return { ok: true, page: { kind: 'collection', rows: items, total: items.length, value: null, next: null } }
    },
    readRecord: async request => { const row = store.current.find(row => row.id === request.recordId); return row ? { ok: true, record: format(row), title: 'Запись' } : { ok: false, error: 'Запись недоступна.' } },
    inspectForm: inspect, submitForm: submit,
    inspectButton: async () => ({ ok: true, state: buttonState }),
    submitButton: async request => {
      const row = store.current.find(row => row.id === request.recordId)
      if (!row) return { ok: false, error: 'Запись не найдена.' }
      const error = builderV2BookingWriteError(app, actor, row.tableId, { [booking.visit.status]: booking.statuses.cancelled }, row.values as Record<string, unknown>)
      if (error) return { ok: false, error }
      const next = store.current.map(item => item.id === row.id ? { ...item, values: { ...item.values, [booking.visit.status]: booking.statuses.cancelled } } : item)
      store.current = next; setRows(next); setVersion(value => value + 1)
      return { ok: true, repeated: false, effects: [{ type: 'notify', message: 'Запись отменена.' }] }
    },
    inspectDelete: async () => ({ ok: false, error: 'Удаление недоступно в примере.' }), submitDelete: async () => ({ ok: false, error: 'Удаление недоступно в примере.' }),
  }
  const currentRecord = rows.find(row => row.id === recordId)
  return <div className={css.demo}>
    <TemplateDemoStage phone={mobile} controls={<TemplateDemoControls screens={DEMO_SCREENS} selected={selectedView}
      phone={mobile} label="Экраны салона" onDeviceChange={setMobile} onScreenChange={view => {
        const next = target(view); setSelectedView(view); setRole(next.role); navigate(next.screenId, next.recordId)
      }}
    />} note="Это пример салона «Тихая студия». Открывайте услуги и записи на учебных данных.">
    <BuilderV2Theme app={app}><PublishedV2Context value={transport}><BookingDemoAvailability value={input => bookingV2Availability(app, actor, data(), input)}><BookingScheduleDemoContext value={scheduleAdapter}><BookingCalendarDemoContext value={request => bookingCalendarSnapshot(app, actor, data(), request)}>
      <BookingPeopleDemoContext value={id => bookingTeamSnapshot(app, actor, data(), id)}><div className={css.demoFrame} data-preview-screen={`${role}:${screenId}:${recordId ?? ''}`}><BuilderV2AppFrame key={role} app={visibleApp} screenId={screenId} title={visibleApp.screens.find(screen => screen.id === screenId)?.name ?? 'Запись'} onNavigate={id => navigate(id)}>
        {notice && <p role="status">{notice}</p>}<AppV2Renderer key={`${role}:${screenId}:${recordId ?? ''}`} live app={visibleApp} tables={tables} actor={actor} screenId={screenId} record={currentRecord ? format(currentRecord) : undefined} onNavigate={navigate} />
      </BuilderV2AppFrame></div></BookingPeopleDemoContext>
    </BookingCalendarDemoContext></BookingScheduleDemoContext></BookingDemoAvailability></PublishedV2Context></BuilderV2Theme>
    </TemplateDemoStage>
  </div>
}
