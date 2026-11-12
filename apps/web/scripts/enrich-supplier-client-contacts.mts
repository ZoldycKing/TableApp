/**
 * Adds email/city/terms/messenger fields to live inventory suppliers + CRM clients
 * for visual QA, and patches published app forms so edit modals show them.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { and, eq, isNull } from 'drizzle-orm'
import { db, apps, fields, rows } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import type { AppV2, AppV2Node } from '@tableapp/schema/app-v2'
import { configureBuilderV2FormSave } from '../src/lib/builder-v2-form-action'

const EXTRA_SUPPLIER: Array<{ name: string; type: string; help: string }> = [
  { name: 'Почта', type: 'email', help: 'Куда отправлять заявку или счёт.' },
  { name: 'Город', type: 'text', help: 'Город или регион склада поставщика.' },
  { name: 'Адрес', type: 'text', help: 'Адрес склада или офиса.' },
  { name: 'Срок поставки', type: 'text', help: 'Обычный срок или условия поставки.' },
  { name: 'Telegram', type: 'text', help: 'Юзернейм или телефон в Telegram.' },
  { name: 'WhatsApp', type: 'phone', help: 'Номер WhatsApp.' },
  { name: 'MAX', type: 'text', help: 'Контакт в MAX.' },
  { name: 'Другой мессенджер', type: 'text', help: 'Название другого канала.' },
  { name: 'Контакт другого мессенджера', type: 'text', help: 'Логин, ссылка или номер.' },
]

const EXTRA_CLIENT: Array<{ name: string; type: string; help: string }> = [
  { name: 'Telegram', type: 'text', help: 'Юзернейм или телефон в Telegram.' },
  { name: 'WhatsApp', type: 'phone', help: 'Номер WhatsApp.' },
  { name: 'MAX', type: 'text', help: 'Контакт в MAX.' },
  { name: 'Другой мессенджер', type: 'text', help: 'Название другого канала.' },
  { name: 'Контакт другого мессенджера', type: 'text', help: 'Логин, ссылка или номер.' },
]

async function ensureFields(tableId: string, extras: typeof EXTRA_SUPPLIER) {
  const existing = await db.select().from(fields).where(eq(fields.tableId, tableId))
  const byName = new Map(existing.map(field => [field.name, field]))
  // Rename legacy labels when present.
  for (const [from, to] of [['Контакт', 'Контактное лицо'], ['Комментарий', 'Заметки']] as const) {
    const row = byName.get(from)
    if (row && !byName.has(to)) {
      await db.update(fields).set({ name: to, updatedAt: new Date() }).where(eq(fields.id, row.id))
      byName.delete(from)
      byName.set(to, { ...row, name: to })
      console.log('renamed', from, '->', to, row.id)
    }
  }
  let position = existing.length
  const ids = new Map<string, string>()
  for (const field of byName.values()) ids.set(field.name, field.id)
  for (const extra of extras) {
    if (ids.has(extra.name)) continue
    const id = newId('field')
    position += 1
    await db.insert(fields).values({
      id,
      tableId,
      name: extra.name,
      type: extra.type,
      options: {},
      description: extra.help,
      position: `a${String(position).padStart(3, '0')}`,
    })
    ids.set(extra.name, id)
    console.log('added field', extra.name, id)
  }
  return ids
}

function inputNode(fieldId: string, label: string): Extract<AppV2Node, { type: 'input' }> {
  return {
    id: newId('component'),
    name: label,
    type: 'input',
    fieldId,
    label,
    required: false,
    visibleTo: null,
    visibleWhen: null,
    initialValue: null,
  }
}

function fieldNode(id: string, name: string, fieldId: string): Extract<AppV2Node, { type: 'field' }> {
  return {
    id,
    name,
    type: 'field',
    label: name,
    visibleTo: null,
    visibleWhen: null,
    value: { kind: 'row', fieldId },
  }
}

function patchForm(app: AppV2, formId: string | undefined, fieldIds: Array<{ id: string; label: string }>) {
  if (!formId) return
  const form = app.nodes.find(node => node.id === formId && node.type === 'form')
  if (!form || form.type !== 'form') return
  const owned = new Set(form.childIds)
  const fieldCovered = new Set(
    form.childIds.flatMap(id => {
      const node = app.nodes.find(item => item.id === id)
      return node?.type === 'input' ? [node.fieldId] : []
    }),
  )
  for (const item of fieldIds) {
    if (fieldCovered.has(item.id)) continue
    // Always create a form-local input — sharing nodes across forms fails validation.
    const node = inputNode(item.id, item.label)
    app.nodes.push(node)
    form.childIds = [...form.childIds, node.id]
    owned.add(node.id)
    fieldCovered.add(item.id)
  }
}

function grantFields(app: AppV2, tableId: string, fieldIds: string[]) {
  for (const rule of app.policy.tables) {
    if (rule.tableId !== tableId) continue
    for (const grant of rule.grants) {
      if (grant.read?.fieldIds) {
        const set = new Set(grant.read.fieldIds)
        for (const id of fieldIds) set.add(id)
        grant.read.fieldIds = [...set]
      }
      if (grant.update?.fieldIds) {
        const set = new Set(grant.update.fieldIds)
        for (const id of fieldIds) set.add(id)
        grant.update.fieldIds = [...set]
      }
      if (grant.create?.fieldIds) {
        const set = new Set(grant.create.fieldIds)
        for (const id of fieldIds) set.add(id)
        grant.create.fieldIds = [...set]
      }
    }
  }
}

async function enrichInventory(slug: string) {
  const [appRow] = await db.select().from(apps).where(eq(apps.slug, slug))
  if (!appRow?.published) throw new Error(`no app ${slug}`)
  const read = readAppDefinition(appRow.published)
  if (!read.ok || read.formatVersion !== 2) throw new Error('bad published')
  const app = structuredClone(read.app) as AppV2
  const inv = app.inventory
  if (!inv?.suppliersTableId) throw new Error('no suppliers')
  const ids = await ensureFields(inv.suppliersTableId, EXTRA_SUPPLIER)
  const supplierRows = await db.select().from(rows).where(and(eq(rows.tableId, inv.suppliersTableId), isNull(rows.deletedAt)))
  const seed: Record<string, Record<string, string>> = {
    КлиматСервис: {
      Почта: 'anna@klimatservice.ru', Город: 'Москва', Адрес: 'ул. Складочная, 1с4', 'Срок поставки': '2–4 рабочих дня',
      Telegram: 'anna_klimat', WhatsApp: '+7 495 120-44-10',
      Заметки: 'Вентиляция и запчасти, счёт по запросу. Отсрочка 14 дней постоянным.',
    },
    'Упаковка Плюс': {
      Почта: 's.novikov@upakovkaplus.ru', Город: 'Санкт-Петербург', Адрес: 'Шушары, Московское ш., 15', 'Срок поставки': 'Самовывоз со следующего дня',
      MAX: 'sergey_upakovka', 'Другой мессенджер': 'Viber', 'Контакт другого мессенджера': '+7 812 300-19-40',
      Заметки: 'Гофротара, отгрузка со склада в Шушарах. Минимальная партия 20 коробов.',
    },
  }
  const nameId = ids.get('Название')!
  for (const row of supplierRows) {
    const data = { ...(row.data as Record<string, unknown>) }
    const name = String(data[nameId] ?? '')
    const patch = seed[name]
    if (!patch) continue
    for (const [label, value] of Object.entries(patch)) {
      const fieldId = ids.get(label)
      if (fieldId) data[fieldId] = value
    }
    // migrate notes from old comment field if renamed
    const notesId = ids.get('Заметки')
    if (notesId && !data[notesId] && patch.Заметки) data[notesId] = patch.Заметки
    await db.update(rows).set({ data, updatedAt: new Date() }).where(eq(rows.id, row.id))
    console.log('patched supplier', name)
  }

  const formFields = [
    'Контактное лицо', 'Телефон', 'Почта', 'Город', 'Адрес', 'Срок поставки',
    'Telegram', 'WhatsApp', 'MAX', 'Другой мессенджер', 'Контакт другого мессенджера', 'Заметки',
  ].flatMap(name => ids.has(name) ? [{ id: ids.get(name)!, label: name }] : [])
  patchForm(app, inv.createSupplierFormId, formFields)
  patchForm(app, inv.editSupplierFormId, formFields)
  grantFields(app, inv.suppliersTableId, [...ids.values()])
  let next = app
  for (const formId of [inv.createSupplierFormId, inv.editSupplierFormId]) {
    if (!formId) continue
    next = configureBuilderV2FormSave(next, formId, ['owner', 'staff'])
  }
  await db.update(apps).set({ published: next, draft: next, updatedAt: new Date() }).where(eq(apps.id, appRow.id))
  console.log('inventory published patched', slug)
}

async function enrichCrm(slug: string) {
  const [appRow] = await db.select().from(apps).where(eq(apps.slug, slug))
  if (!appRow?.published) throw new Error(`no app ${slug}`)
  const read = readAppDefinition(appRow.published)
  if (!read.ok || read.formatVersion !== 2) throw new Error('bad published')
  const app = structuredClone(read.app) as AppV2
  const crm = app.crm
  if (!crm?.clientsTableId) throw new Error('no clients')
  const ids = await ensureFields(crm.clientsTableId, EXTRA_CLIENT)
  const clientRows = await db.select().from(rows).where(and(eq(rows.tableId, crm.clientsTableId), isNull(rows.deletedAt)))
  const seed: Record<string, Record<string, string>> = {
    'ООО «Вектор»': { Telegram: 'irina_vektor', WhatsApp: '+7 495 120-44-00' },
    'ООО «Северный ветер»': { MAX: 'gusev_sever' },
    'ИП Соколов': { Telegram: '@sokolov_ip', WhatsApp: '+7 903 222-11-44', 'Другой мессенджер': 'Viber', 'Контакт другого мессенджера': '+7 903 222-11-44' },
  }
  const titleId = crm.clientTitleFieldId
  for (const row of clientRows) {
    const data = { ...(row.data as Record<string, unknown>) }
    const name = String(data[titleId] ?? '')
    const patch = seed[name]
    if (!patch) continue
    for (const [label, value] of Object.entries(patch)) {
      const fieldId = ids.get(label)
      if (fieldId) data[fieldId] = value
    }
    await db.update(rows).set({ data, updatedAt: new Date() }).where(eq(rows.id, row.id))
    console.log('patched client', name)
  }
  const formFields = [
    'Telegram', 'WhatsApp', 'MAX', 'Другой мессенджер', 'Контакт другого мессенджера',
  ].flatMap(name => ids.has(name) ? [{ id: ids.get(name)!, label: name }] : [])
  patchForm(app, crm.createClientFormId, formFields)
  patchForm(app, crm.clientEditFormId, formFields)
  // Attach field nodes on client screen for any missing messenger facts (optional; messengers also resolve by name).
  const clientScreen = app.screens.find(screen => screen.id === crm.clientScreenId)
  if (clientScreen) {
    for (const item of formFields) {
      const nodeId = `client_${item.id}`
      if (app.nodes.some(node => node.id === nodeId)) continue
      app.nodes.push(fieldNode(nodeId, item.label, item.id))
      if (!clientScreen.rootIds.includes(nodeId)) {
        const editIdx = clientScreen.rootIds.indexOf(crm.clientEditFormId)
        if (editIdx >= 0) clientScreen.rootIds.splice(editIdx, 0, nodeId)
        else clientScreen.rootIds.push(nodeId)
      }
    }
  }
  grantFields(app, crm.clientsTableId, [...ids.values()])
  let next = app
  for (const formId of [crm.createClientFormId, crm.clientEditFormId]) {
    if (!formId) continue
    next = configureBuilderV2FormSave(next, formId, ['owner', 'staff'])
  }
  await db.update(apps).set({ published: next, draft: next, updatedAt: new Date() }).where(eq(apps.id, appRow.id))
  console.log('crm published patched', slug)
}

const invFixture = JSON.parse(readFileSync('/tmp/inventory-visual-stage3a.json', 'utf8')) as { slug: string }
const crmFixture = JSON.parse(readFileSync('/tmp/crm-visual.json', 'utf8')) as { slug: string }
await enrichInventory(invFixture.slug)
await enrichCrm(crmFixture.slug)
writeFileSync('/tmp/enrich-supplier-client-contacts.json', JSON.stringify({ ok: true, inv: invFixture.slug, crm: crmFixture.slug }, null, 2))
console.log('done')
process.exit(0)
