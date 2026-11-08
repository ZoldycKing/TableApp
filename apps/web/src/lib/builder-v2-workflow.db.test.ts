import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray, isNull, and } from 'drizzle-orm'
import { newId, planOf } from '@tableapp/schema'
import type { AppV2, AppV2Step } from '@tableapp/schema/app-v2'
import type { BuilderV2WorkingFormState } from './builder-v2-submit-types'
import { builderV2Revision } from './builder-v2-revision'
const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('@/lib/live', async original => ({ ...await original<typeof import('./live')>(), publishTable: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const env = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(env)) process.loadEnvFile(env)

describe.skipIf(!process.env.DATABASE_URL)('transactional form workflows', () => {
  let data: typeof import('@tableapp/db'), actions: typeof import('@/app/builder-v2-form-actions'), history: typeof import('@/app/builder-v2-workflow-actions'), builder: typeof import('./builder-v2'), model: typeof import('@/components/builder/v2/model'), configure: typeof import('./builder-v2-form-action'), starter: typeof import('./builder-v2-starter'), live: typeof import('./live')
  const userId = newId('user'), other = newId('user'), workspaceId = newId('workspace'), foreignWorkspace = newId('workspace'), requests = newId('table'), audits = newId('table'), foreignTable = newId('table'), foreignRow = newId('row')
  const title = newId('field'), amount = newId('field'), done = newId('field'), doubled = newId('field'), note = newId('field'), parent = newId('field'), total = newId('field'), choice = newId('field'), foreignName = newId('field')
  const member = { userId, workspaceId, email: `${userId}@example.invalid`, name: 'Цепочки', workspaceName: 'V11 workflow test', role: 'owner' as const }
  beforeAll(async () => {
    data = await import('@tableapp/db'); actions = await import('@/app/builder-v2-form-actions'); history = await import('@/app/builder-v2-workflow-actions'); builder = await import('./builder-v2'); model = await import('@/components/builder/v2/model'); configure = await import('./builder-v2-form-action'); starter = await import('./builder-v2-starter'); live = await import('./live')
    await data.db.insert(data.users).values([{ id: userId, email: member.email }, { id: other, email: `${other}@example.invalid` }])
    await data.db.insert(data.workspaces).values([{ id: workspaceId, ownerId: userId, name: member.workspaceName, slug: workspaceId, plan: 'business' }, { id: foreignWorkspace, ownerId: other, name: 'V11 foreign', slug: foreignWorkspace }])
    await data.db.insert(data.workspaceMembers).values([{ workspaceId, userId, role: 'owner' }, { workspaceId, userId: other, role: 'editor' }, { workspaceId: foreignWorkspace, userId: other, role: 'owner' }])
    await data.db.insert(data.tables).values([{ id: requests, workspaceId, name: 'Заявки', position: 'a0' }, { id: audits, workspaceId, name: 'История', position: 'a1' }, { id: foreignTable, workspaceId: foreignWorkspace, name: 'Чужие записи', position: 'a0' }])
    await data.db.insert(data.fields).values([{ id: title, tableId: requests, name: 'Название', type: 'text', position: 'a0' }, { id: amount, tableId: requests, name: 'Бюджет', type: 'number', position: 'a1' }, { id: done, tableId: requests, name: 'Завершён', type: 'checkbox', position: 'a2' }, { id: doubled, tableId: requests, name: 'Удвоенный бюджет', type: 'formula', options: { expression: '{Бюджет} * 2' }, position: 'a3' }, { id: note, tableId: audits, name: 'Событие', type: 'text', position: 'a0' }, { id: parent, tableId: audits, name: 'Заявка', type: 'relation', options: { tableId: requests }, position: 'a1' }, { id: total, tableId: audits, name: 'Расчёт', type: 'number', position: 'a2' }, { id: choice, tableId: audits, name: 'Тип', type: 'single_select', options: { choices: [{ id: 'valid_choice', name: 'Допустимый' }] }, position: 'a3' }, { id: foreignName, tableId: foreignTable, name: 'Название', type: 'text', position: 'a0' }])
    for (const [id, primaryFieldId] of [[requests, title], [audits, note], [foreignTable, foreignName]]) await data.db.update(data.tables).set({ primaryFieldId }).where(eq(data.tables.id, id!))
    await data.db.insert(data.rows).values({ id: foreignRow, tableId: foreignTable, position: 'a0', data: { [foreignName]: 'Другой владелец' } })
  })
  beforeEach(() => { identity.member = member; vi.clearAllMocks() })
  afterAll(async () => { vi.unstubAllEnvs(); if (!data) return; await data.db.delete(data.workspaces).where(inArray(data.workspaces.id, [workspaceId, foreignWorkspace])); await data.db.delete(data.users).where(inArray(data.users.id, [userId, other])); await data.sql.end() })
  async function fixture(transform?: (steps: AppV2Step[]) => AppV2Step[]) {
    const catalog = (await builder.loadBuilderV2Catalog(workspaceId)).tables
    let app = starter.buildBuilderV2Starter(builder.newBuilderV2App({ id: newId('app'), workspaceId, name: 'Заявки', slug: newId('app').replace('_', '-'), email: member.email }), catalog, requests)
    const detailId = app.screens.find(screen => screen.contextTableId === requests)!.id
    app = model.newScreen(app, 'Добавить заявку')
    const screenId = app.screens.at(-1)!.id, added = model.addNode(app, screenId, 'form', catalog, null, requests)
    app = configure.configureBuilderV2FormSave(added.app, added.id, ['owner'])
    const form = app.nodes.find(node => node.id === added.id)!; if (form.type !== 'form') throw new Error('Form missing')
    const action = configure.builderV2SaveFormAction(app, form)!, save = action.step
    const steps: AppV2Step[] = [save, { id: 'audit', type: 'create_row', tableId: audits, values: { [note]: { kind: 'result', stepId: save.id, fieldId: title }, [parent]: { kind: 'record_ids', tableId: requests, record: { kind: 'result', stepId: save.id } }, [total]: { kind: 'result', stepId: save.id, fieldId: doubled } } }, { id: 'branch', type: 'branch', condition: { op: 'gte', left: { kind: 'form', formId: form.id, fieldId: amount }, right: { kind: 'literal', value: 1000 } }, then: [{ id: 'large', type: 'notify', message: { kind: 'literal', value: 'Крупная заявка' } }], else: [{ id: 'small', type: 'notify', message: { kind: 'literal', value: 'Обычная заявка' } }] }, { id: 'open', type: 'open_screen', screenId: detailId, record: { kind: 'result', stepId: save.id } }]
    app = configure.configureBuilderV2FormWorkflow(app, form.id, { ...action.flow, name: 'Сохранить и открыть заявку', steps: transform ? transform(steps) : steps })
    await data.db.insert(data.apps).values({ id: app.id, workspaceId, name: app.name, slug: app.slug, theme: app.theme, draft: app })
    return { app, formId: form.id, scope: { formId: form.id, screenId }, detailId, saveId: save.id }
  }
  async function input(f: Awaited<ReturnType<typeof fixture>>, budget = 1250) {
    const result = await actions.inspectWorkingBuilderV2FormAction(f.app.id, { ...f.scope, mode: 'initial' })
    if (!result.ok || !('state' in result)) throw new Error(JSON.stringify(result))
    const state = result.state as BuilderV2WorkingFormState
    return { ...f.scope, requestId: `submit_${crypto.randomUUID().replaceAll('-', '')}`, revision: state.revision, fingerprint: state.fingerprint, values: { [title]: `Проверка ${newId('row')}`, [amount]: budget, [done]: false } }
  }
  const records = () => data.db.select().from(data.rows).where(and(inArray(data.rows.tableId, [requests, audits]), isNull(data.rows.deletedAt)))
  const logs = (appId: string) => data.db.select().from(data.builderWorkflowRuns).where(eq(data.builderWorkflowRuns.appId, appId))
  it('marks the personal first-save lesson only after commit and leaves failures, inspections and other authors untouched',async()=>{
    const learning=await import('@/app/builder-learning-actions'),f=await fixture(),failed=await fixture(steps=>[...steps,{id:'late-learning',type:'require',condition:{op:'eq',left:{kind:'literal',value:1},right:{kind:'literal',value:2}},message:'Отмена'}])
    for(const app of[f.app,failed.app])await learning.builderLearningAction(app.id,'start')
    const request=await input(f);expect(await learning.readBuilderLearningAction(f.app.id)).toMatchObject({ok:true,progress:{save:'pending'}})
    expect(await actions.submitBuilderV2FormAction(failed.app.id,await input(failed))).toMatchObject({ok:false})
    expect(await learning.readBuilderLearningAction(failed.app.id)).toMatchObject({ok:true,progress:{save:'pending'}})
    await learning.builderLearningAction(f.app.id,'pause')
    expect(await actions.submitBuilderV2FormAction(f.app.id,request)).toMatchObject({ok:true})
    const first=await learning.readBuilderLearningAction(f.app.id);expect(first).toMatchObject({ok:true,progress:{save:'done',paused:true}})
    expect(await actions.submitBuilderV2FormAction(f.app.id,request)).toMatchObject({ok:true,repeated:true});expect(await learning.readBuilderLearningAction(f.app.id)).toEqual(first)
    identity.member={...member,userId:other,email:`${other}@example.invalid`,role:'editor'}
    expect(await learning.readBuilderLearningAction(f.app.id)).toMatchObject({ok:true,progress:null})
  })
  it('queues browser effects from saved form results only after commit, preserves zero and replays without a second write',async()=>{
    const f=await fixture(steps=>[steps[0]!,{id:'copy',type:'copy_value',value:{kind:'result',stepId:steps[0]!.id,fieldId:amount}},{id:'link',type:'open_url',value:{kind:'literal',value:'/features'}},{id:'back',type:'go_back'}]),request=await input(f,0),first=await actions.submitBuilderV2FormAction(f.app.id,request)
    expect(first).toMatchObject({ok:true,effects:[{type:'copy_value',value:'0'},{type:'open_url',url:'/features'},{type:'go_back',screenId:f.app.homeScreenId}]})
    expect(await actions.submitBuilderV2FormAction(f.app.id,request)).toMatchObject({...first,repeated:true});expect(await logs(f.app.id)).toHaveLength(1)
  })
  it('discards queued browser effects and earlier writes after an unsafe dynamic link or late failure',async()=>{
    for(const tail of [[{id:'url',type:'open_url' as const,value:{kind:'result' as const,stepId:'placeholder',fieldId:title}}],[{id:'late',type:'require' as const,condition:{op:'eq' as const,left:{kind:'literal' as const,value:0},right:{kind:'literal' as const,value:1}},message:'Не выполнено'}]]){
      const f=await fixture(steps=>[steps[0]!,{id:'copy',type:'copy_value',value:{kind:'literal',value:'Проверка'}},...tail.map(step=>step.type==='open_url'?{...step,value:{kind:'result' as const,stepId:steps[0]!.id,fieldId:title}}:step)]),request=await input(f),before=(await records()).length
      const result=await actions.submitBuilderV2FormAction(f.app.id,{...request,values:{...request.values,[title]:'javascript:alert(1)'}})
      expect(result).toMatchObject({ok:false});expect(result).not.toHaveProperty('effects');expect(await records()).toHaveLength(before);expect(await logs(f.app.id)).toMatchObject([{status:'failed'}])
    }
  })
  it('executes both writes, computed result bindings, one branch and navigation, with one durable outcome for concurrent retries', async () => {
    const f = await fixture(), request = await input(f), before = (await records()).length
    const [first, second] = await Promise.all([actions.submitBuilderV2FormAction(f.app.id, request), actions.submitBuilderV2FormAction(f.app.id, request)])
    if (!first?.ok || !second?.ok) throw new Error(JSON.stringify([first, second]))
    expect(first.rowId).toBe(second.rowId); expect([first.repeated, second.repeated].sort()).toEqual([false, true])
    expect(first.effects).toEqual([{ type: 'notify', message: 'Крупная заявка' }, { type: 'open_screen', screenId: f.detailId, recordId: first.rowId }])
    expect(second.effects).toEqual(first.effects); expect(second.trace).toEqual(first.trace)
    const rows = await records(), audit = rows.find(row => row.tableId === audits && (row.data as Record<string, unknown>)[parent] instanceof Array && ((row.data as Record<string, unknown>)[parent] as string[]).includes(first.rowId))!
    expect(rows).toHaveLength(before + 2); expect(audit.data).toMatchObject({ [note]: request.values[title], [parent]: [first.rowId], [total]: 2500 })
    expect(first.trace).toEqual(expect.arrayContaining([expect.objectContaining({ stepId: 'large', status: 'done' }), expect.objectContaining({ stepId: 'small', status: 'skipped' })]))
    expect(await logs(f.app.id)).toHaveLength(1); expect(live.publishTable).toHaveBeenCalledTimes(2)
    expect(await data.db.select().from(data.rowChanges).where(inArray(data.rowChanges.rowId, [first.rowId, audit.id]))).toHaveLength(2)
  })
  it('rolls back earlier rows, histories, quota and queued messages when a later condition fails, retaining only the failed execution journal', async () => {
    const f = await fixture(steps => [...steps.slice(0, 3), { id: 'stop', type: 'require', condition: { op: 'gt', left: { kind: 'result', stepId: (steps[0] as Extract<AppV2Step, {type:'create_row'}>).id, fieldId: amount }, right: { kind: 'literal', value: 9999 } }, message: 'Бюджет слишком мал' }, ...steps.slice(3)]), request = await input(f), before = (await records()).length
    const result = await actions.submitBuilderV2FormAction(f.app.id, request)
    expect(result).toMatchObject({ ok: false, error: 'Бюджет слишком мал', trace: expect.arrayContaining([expect.objectContaining({ stepId: 'stop', status: 'failed' }), expect.objectContaining({ stepId: 'audit', status: 'rolled_back' })]) })
    expect(result).not.toHaveProperty('effects'); expect(await records()).toHaveLength(before); expect(live.publishTable).not.toHaveBeenCalled()
    expect(await data.db.select().from(data.builderActionRuns).where(eq(data.builderActionRuns.appId, f.app.id))).toHaveLength(0)
    expect(await logs(f.app.id)).toEqual([expect.objectContaining({ status: 'failed', error: 'Бюджет слишком мал' })])
    const [usage] = await data.db.select().from(data.workspaceUsage).where(eq(data.workspaceUsage.workspaceId, workspaceId)); expect(usage!.rows).toBe(before)
  })
  it('checks permissions on the later table and does not leak a write from the first step', async () => {
    const f = await fixture(), request = await input(f), before = (await records()).length
    const app = { ...f.app, policy: { ...f.app.policy, tables: f.app.policy.tables.map(rule => rule.tableId === audits ? { ...rule, grants: rule.grants.filter(grant => !grant.create) } : rule) } }
    await data.db.update(data.apps).set({ draft: app }).where(eq(data.apps.id, app.id))
    const result = await actions.submitBuilderV2FormAction(app.id, { ...request, revision: builderV2Revision(app) })
    expect(result).toMatchObject({ ok: false, trace: expect.arrayContaining([expect.objectContaining({ stepId: 'audit', status: 'failed' })]) })
    expect(await records()).toHaveLength(before); expect(live.publishTable).not.toHaveBeenCalled()
  })
  it('chooses the other branch and snapshots results while updating a previously created record', async () => {
    const f = await fixture(steps => [steps[0]!, { id: 'rename', type: 'update_row', tableId: requests, target: { kind: 'result', stepId: steps[0]!.id }, values: { [title]: { kind: 'literal', value: 'После изменения' } } }, ...steps.slice(1)]), result = await actions.submitBuilderV2FormAction(f.app.id, await input(f, 0))
    if (!result.ok) throw new Error(JSON.stringify(result))
    expect((await data.db.select().from(data.rows).where(eq(data.rows.id, result.rowId)))[0]!.data).toMatchObject({ [title]: 'После изменения', [amount]: 0, [done]: false })
    expect(result.effects?.[0]).toEqual({ type: 'notify', message: 'Обычная заявка' })
    expect(result.trace).toEqual(expect.arrayContaining([expect.objectContaining({ stepId: 'small', status: 'done' }), expect.objectContaining({ stepId: 'large', status: 'skipped' })]))
  })
  it('validates choices and related records in additional writes, including a real foreign row id', async () => {
    for (const values of [{ [parent]: { kind: 'literal' as const, value: [foreignRow] } }, { [choice]: { kind: 'literal' as const, value: 'missing_choice' } }]) {
      const f = await fixture(steps => steps.map(step => step.id === 'audit' && step.type === 'create_row' ? { ...step, values: { ...step.values, ...values } } : step)), before = (await records()).length
      expect(await actions.submitBuilderV2FormAction(f.app.id, await input(f))).toMatchObject({ ok: false })
      expect(await records()).toHaveLength(before); expect(await logs(f.app.id)).toEqual([expect.objectContaining({ status: 'failed' })])
    }
  })
  it('does not execute a supported prefix when any nested step is unsupported and rejects an inaccessible destination before commit', async () => {
    const f = await fixture(), request = await input(f), before = (await records()).length
    const baseFlow = f.app.workflows.find(flow => flow.input.formId === f.formId)!
    const bad: AppV2 = { ...f.app, workflows: f.app.workflows.map(flow => flow.id === baseFlow.id ? { ...flow, steps: [...flow.steps, { id: 'unsupported', type: 'branch', condition: { op: 'not_empty', value: { kind: 'literal', value: 'yes' } }, then: [], else: [{ id: 'external', type: 'delete_row', tableId:requests,target:{kind:'current'},confirm:false }] }] } : flow) }
    await data.db.update(data.apps).set({ draft: bad }).where(eq(data.apps.id, bad.id))
    expect(await actions.submitBuilderV2FormAction(bad.id, { ...request, revision: builderV2Revision(bad) })).toMatchObject({ ok: false })
    expect(await logs(f.app.id)).toHaveLength(0)
    const blocked: AppV2 = { ...f.app, roles: [...f.app.roles, { id: 'denied', name: 'Другая роль' }], screens: f.app.screens.map(screen => screen.id === f.detailId ? { ...screen, audience: { kind: 'roles', roleIds: ['denied'] } } : screen) }
    await data.db.update(data.apps).set({ draft: blocked }).where(eq(data.apps.id, blocked.id))
    expect(await actions.submitBuilderV2FormAction(blocked.id, { ...request, revision: builderV2Revision(blocked) })).toMatchObject({ ok: false, trace: expect.arrayContaining([expect.objectContaining({ stepId: 'open', status: 'failed' })]) })
    expect(await records()).toHaveLength(before)
  })
  it('scopes and paginates execution history by app, workspace and verified user, including equal timestamps', async () => {
    const f = await fixture(), at = new Date('2026-11-03T00:00:00Z')
    await data.db.insert(data.builderWorkflowRuns).values(Array.from({ length: 13 }, (_, i) => ({ id: newId('run'), workspaceId, appId: f.app.id, userId, requestId: `sample_${i}`, workflowId: f.app.workflows.find(flow => flow.input.formId === f.formId)!.id, workflowName: 'Сохранение', eventNodeId: f.formId, definitionRevision: builderV2Revision(f.app), status: 'succeeded' as const, trace: [], createdAt: at })))
    const first = await history.readBuilderV2WorkflowRunsAction(f.app.id)
    if (!first.ok) throw new Error(first.error)
    expect(first.runs).toHaveLength(10)
    const second = await history.readBuilderV2WorkflowRunsAction(f.app.id, first.next)
    if (!second.ok) throw new Error(second.error)
    expect(second.runs).toHaveLength(3); expect(new Set([...first.runs, ...second.runs].map(run => run.id)).size).toBe(13)
    identity.member = { ...member, userId: other, email: `${other}@example.invalid`, role: 'editor' }
    expect(await history.readBuilderV2WorkflowRunsAction(f.app.id)).toMatchObject({ ok: true, runs: [] })
    identity.member = { ...member, workspaceId: foreignWorkspace }
    expect(await history.readBuilderV2WorkflowRunsAction(f.app.id)).toMatchObject({ ok: false })
    identity.member = member
    expect(await history.readBuilderV2WorkflowRunsAction(f.app.id, { at: at.toISOString(), id: 'run_a', userId: other })).toMatchObject({ ok: false })
  })
  it('rolls back the first row when the second write reaches the real row quota', async () => {
    const f = await fixture(), request = await input(f), before = (await records()).length, count = planOf('free').limits.rows - before - 1
    const seeded = Array.from({ length: count }, (_, i) => ({ id: newId('row'), tableId: requests, position: `quota_${i}`, data: { [title]: 'Заполнение лимита', [amount]: 0 } }))
    await data.db.insert(data.rows).values(seeded); await data.db.update(data.workspaces).set({ plan: 'free' }).where(eq(data.workspaces.id, workspaceId))
    const { recountWorkspace } = await import('./usage'); await recountWorkspace(workspaceId)
    try {
      const result = await actions.submitBuilderV2FormAction(f.app.id, request)
      expect(result).toMatchObject({ ok: false, trace: expect.arrayContaining([expect.objectContaining({ stepId: 'audit', status: 'failed' })]) })
      expect(await records()).toHaveLength(before + count)
      const [usage] = await data.db.select().from(data.workspaceUsage).where(eq(data.workspaceUsage.workspaceId, workspaceId)); expect(usage!.rows).toBe(before + count)
    } finally { await data.db.delete(data.rows).where(inArray(data.rows.id, seeded.map(row => row.id))); await data.db.update(data.workspaces).set({ plan: 'business' }).where(eq(data.workspaces.id, workspaceId)); await recountWorkspace(workspaceId) }
    expect(await actions.submitBuilderV2FormAction(f.app.id, request)).toMatchObject({ ok: true, repeated: false })
    expect((await logs(f.app.id)).map(log => log.status).sort()).toEqual(['failed', 'succeeded'])
  })
})
