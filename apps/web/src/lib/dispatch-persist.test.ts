import { describe, expect, it } from 'vitest'
import { parseCellValue, type Field } from '@tableapp/schema'
import type { AppV2Actor, AppV2Json, AppV2Record } from '@tableapp/schema/app-v2'
import { buildTemplate } from './templates/build'
import { findTemplate } from './templates/catalog'
import { buildDispatchV2App } from './templates/dispatch-v2'
import { guardDispatchCreate, guardDispatchUpdate, progressValues, seriesMutations } from './dispatch-persist'

const actor = (roleIds: string[], email: string): AppV2Actor => ({ authenticated: true, roleIds, id: 'usr', email, company: '', name: 'Сергей' })

function installed() {
  const built = buildTemplate({ template: findTemplate('zayavki')!, workspaceId: 'wsp_persist' })
  const app = buildDispatchV2App(built, { id: 'app_persist', workspaceId: 'wsp_persist', name: 'Заявки', slug: 'zayavki', email: 'owner@example.invalid' })
  return { app, dispatch: app.dispatch! }
}

describe('published field-service writes', () => {
  it('lets the assigned technician store the timer and checklist, and refuses the price', () => {
    const { app, dispatch } = installed()
    const row: AppV2Record = { id: 'job', tableId: dispatch.jobsTableId, values: { [dispatch.job.masterEmail]: 'sergey@example.invalid', [dispatch.job.what]: 'Насос' } }
    const master = actor(['staff'], 'sergey@example.invalid')
    const values = progressValues(dispatch.job, { status: dispatch.statuses.onSite, onSiteAt: '2026-11-17T07:00:00.000Z', actualMinutes: 38, checklist: '[{"label":"Фильтр","done":true}]' })
    expect(values[dispatch.job.onSiteAt!]).toBe('2026-11-17T07:00:00.000Z')
    expect(values[dispatch.job.actualMinutes!]).toBe(38)
    expect(guardDispatchUpdate(app, master, row, values).ok).toBe(true)
    expect(guardDispatchUpdate(app, master, row, { [dispatch.job.price]: 1 }).ok).toBe(false)
    expect(guardDispatchUpdate(app, actor(['staff'], 'andrey@example.invalid'), row, values).ok).toBe(false)
  })

  it('plans the following visits when a series is created and only the chosen visit when editing one', () => {
    const { app, dispatch } = installed()
    const owner = actor(['owner'], 'owner@example.invalid')
    const checklist = dispatch.job.checklist!
    const seriesKey = dispatch.job.seriesId!
    const seed: AppV2Record = {
      id: 'seed', tableId: dispatch.jobsTableId,
      values: { [dispatch.job.what]: 'Обслуживание кондиционера', [dispatch.job.when]: '2026-11-17T06:00:00.000Z', [dispatch.job.date]: '2026-11-17T06:00:00.000Z', [dispatch.job.status]: dispatch.statuses.assigned, [checklist]: '[{"label":"Фильтр","done":true}]' },
    }
    const created = seriesMutations({
      dispatch, seed, rule: 'weekly', until: null, count: 5, repeatChoiceId: 'weekly', seriesId: 'series-ac', scope: 'series',
      siblings: [{ id: 'seed', seriesId: '', when: seed.values[dispatch.job.when], status: 'Назначена' }],
    })
    expect(created.creates).toHaveLength(4)
    expect(created.creates.map(item => item[dispatch.job.when])).toEqual([
      '2026-11-24T06:00:00.000Z', '2026-12-01T06:00:00.000Z', '2026-12-08T06:00:00.000Z', '2026-12-15T06:00:00.000Z',
    ])
    expect(created.creates.every(item => item[seriesKey] === 'series-ac' && item[checklist] === '[{"label":"Фильтр","done":false}]')).toBe(true)
    expect(guardDispatchCreate(app, owner, dispatch.jobsTableId, created.creates[0]!).ok).toBe(true)
    const one = seriesMutations({
      dispatch, seed: { ...seed, values: { ...seed.values, [seriesKey]: 'series-ac' } }, rule: 'weekly', until: null, count: 5,
      repeatChoiceId: 'weekly', seriesId: 'series-ac', scope: 'one',
      siblings: [{ id: 'seed', seriesId: 'series-ac', when: seed.values[dispatch.job.when], status: 'Назначена' }, { id: 'next', seriesId: 'series-ac', when: '2026-11-24T06:00:00.000Z', status: 'Назначена' }],
    })
    expect(one.creates).toEqual([])
    expect(one.updates.map(item => item.id)).toEqual(['seed'])
  })

  it('writes only values the job columns accept, including an empty end date', () => {
    const built = buildTemplate({ template: findTemplate('zayavki')!, workspaceId: 'wsp_persist' })
    const app = buildDispatchV2App(built, { id: 'app_persist', workspaceId: 'wsp_persist', name: 'Заявки', slug: 'zayavki', email: 'owner@example.invalid' })
    const dispatch = app.dispatch!
    const fields = built.fields.filter(field => field.tableId === dispatch.jobsTableId) as Field[]
    const repeatField = fields.find(field => field.id === dispatch.job.repeat)
    const repeatChoiceId = repeatField?.type === 'single_select' ? repeatField.options.choices.find(choice => choice.name === 'Еженедельно')!.id : ''
    const stored = built.rows.find(row => row.tableId === dispatch.jobsTableId && row.data[dispatch.job.masterEmail!] === 'sergey@example.invalid')!
    const plan = seriesMutations({
      dispatch, seed: { id: stored.id, tableId: stored.tableId, values: stored.data as Record<string, AppV2Json> },
      rule: 'weekly', until: null, count: 4, repeatChoiceId, seriesId: 'series-pump', scope: 'series',
      siblings: [{ id: stored.id, seriesId: '', when: stored.data[dispatch.job.when!], status: 'На месте' }],
    })
    const repeatUntil = dispatch.job.repeatUntil!
    expect(plan.updates[0]?.values[repeatUntil]).toBeNull()
    const accept = (values: Record<string, unknown>) => {
      for (const [id, value] of Object.entries(values)) parseCellValue(fields.find(field => field.id === id)!, value)
    }
    expect(() => plan.updates.forEach(update => accept(update.values))).not.toThrow()
    expect(() => plan.creates.forEach(accept)).not.toThrow()
    expect(plan.creates).toHaveLength(3)
  })
})
