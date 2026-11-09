import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { readAppDefinition, validateAppV2Definition } from '@tableapp/schema/app-definition'
import { newId } from '@tableapp/schema'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadBuilderV2Catalog } from '../builder-v2'
import { writeRows, updateRow } from '../row-mutations'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const identity = vi.hoisted(() => ({ member: null as import('../session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('../session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/live', () => ({ publishTable: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('installed crm v2 deals', () => {
  let database: typeof import('@tableapp/db')
  let actions: typeof import('@/app/template-actions')
  const userId = newId('user'), workspaceId = newId('workspace')
  const email = `crm-v2-${userId}@example.invalid`
  beforeAll(async () => {
    database = await import('@tableapp/db')
    actions = await import('@/app/template-actions')
    await database.db.insert(database.users).values({ id: userId, email })
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: userId, name: 'CRM v2', slug: `crm-v2-${workspaceId}` })
    await database.db.insert(database.workspaceMembers).values({ userId, workspaceId, role: 'owner' })
  })
  beforeEach(async () => {
    identity.member = { userId, workspaceId, workspaceName: 'CRM v2', email, name: 'Owner', role: 'owner' }
    await database.db.delete(database.apps).where(eq(database.apps.workspaceId, workspaceId))
    await database.db.delete(database.tables).where(eq(database.tables.workspaceId, workspaceId))
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    await database.db.delete(database.users).where(eq(database.users.id, userId))
  })

  it('installs a valid crm v2 draft and persists stage, note and next-contact date', async () => {
    const installed = await actions.applyTemplateAction('crm')
    if (!installed.ok) throw new Error(installed.error)
    const [record] = await database.db.select().from(database.apps).where(eq(database.apps.id, installed.appId))
    const read = readAppDefinition(record!.draft)
    if (!read.ok || read.formatVersion !== 2 || !read.app.crm) throw new Error('CRM draft is not builder v2')
    const { catalog } = await loadBuilderV2Catalog(workspaceId)
    expect(validateAppV2Definition(read.app, catalog, { mode: 'publish' })).toEqual({ ok: true, app: read.app })
    const crm = read.app.crm
    const deals = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, crm.dealsTableId), isNull(database.rows.deletedAt)))
    const clients = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, crm.clientsTableId), isNull(database.rows.deletedAt)))
    expect(deals.length).toBeGreaterThan(0)
    expect(clients.length).toBeGreaterThan(0)
    expect(crm.contactsTableId).toBeTruthy()
    const contactsBefore = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, crm.contactsTableId!), isNull(database.rows.deletedAt)))
    expect(contactsBefore.length).toBeGreaterThan(0)
    const deal = deals[0]!
    const stageField = catalog.fields.get(crm.stageFieldId)!
    const nextStage = (await database.db.select().from(database.fields).where(eq(database.fields.id, crm.stageFieldId)))[0]
    const choices = ((nextStage?.options as { choices?: { id: string; name: string }[] } | null)?.choices) ?? []
    const negotiations = choices.find(choice => choice.name === 'Переговоры')?.id
    expect(negotiations).toBeTruthy()
    const due = '2030-05-15'
    const note = 'Созвон: ждём ответ директора'
    await writeRows(workspaceId, context => updateRow(context, crm.dealsTableId, deal.id, {
      [crm.stageFieldId]: negotiations!,
      [crm.dueFieldId]: due,
      [crm.noteFieldId]: note,
    }, { id: userId, kind: 'member' }))
    const [updated] = await database.db.select().from(database.rows).where(eq(database.rows.id, deal.id))
    const data = updated!.data as Record<string, unknown>
    expect(data[crm.stageFieldId]).toBe(negotiations)
    expect(data[crm.noteFieldId]).toBe(note)
    expect(String(data[crm.dueFieldId])).toContain('2030-05')
    expect(stageField.type).toBe('single_select')
    const board = read.app.screens.find(screen => screen.id === crm.boardScreenId)!
    expect(board.rootIds.some(id => read.app.nodes.find(node => node.id === id)?.type === 'form')).toBe(false)
  })

  it('clears sample history while keeping a real client and its deals', async () => {
    const installed = await actions.applyTemplateAction('crm')
    if (!installed.ok) throw new Error(installed.error)
    const [record] = await database.db.select().from(database.apps).where(eq(database.apps.id, installed.appId))
    const read = readAppDefinition(record!.draft)
    if (!read.ok || read.formatVersion !== 2 || !read.app.crm) throw new Error('CRM draft is not builder v2')
    const crm = read.app.crm
    const { db, rows } = database
    const [client] = await db.select().from(rows).where(and(eq(rows.tableId, crm.clientsTableId), isNull(rows.deletedAt))).limit(1)
    await db.update(rows).set({ sample: false }).where(eq(rows.id, client!.id))
    const preparation = await import('../template-preparation')
    const state = await preparation.templatePreparation(workspaceId, installed.appId)
    expect(state!.samples).toBeGreaterThan(0)
    expect(state!.removable.some(row => row.id === client!.id)).toBe(false)
    expect(await actions.clearTemplateSamplesAction(installed.appId)).toEqual({ ok: true })
    const remaining = await db.select().from(rows).where(and(inArray(rows.tableId, installed.tableIds), isNull(rows.deletedAt)))
    expect(remaining.some(row => row.id === client!.id)).toBe(true)
    expect(remaining.some(row => row.tableId === crm.dealsTableId)).toBe(true)
    expect((await preparation.templatePreparation(workspaceId, installed.appId))!.samples).toBe(0)
  })
})
