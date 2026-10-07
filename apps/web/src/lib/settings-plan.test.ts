import { describe, expect, it } from 'vitest'
import { fieldSettingsPlan, viewSettingsPlan } from './settings-plan'

const view = { id: 'view', tableId: 'table', name: 'View', position: 'a1', type: 'grid', config: {} }
describe('conservative legacy settings migration', () => {
  it('adds missing defaults without losing values or unknown keys', () => {
    const plan = fieldSettingsPlan('number', { precision: 3, format: 'currency', currency: 'EUR', extension: 'keep' })
    expect(plan).toMatchObject({ ok: true, changed: true, value: { precision: 3, currency: 'EUR', extension: 'keep', showThousandsSeparator: true } })
    if (plan.ok) expect(fieldSettingsPlan('number', plan.value)).toMatchObject({ ok: true, changed: false })
  })
  it('never guesses required relation or lookup references', () => {
    expect(fieldSettingsPlan('relation', {})).toEqual({ ok: false })
    expect(fieldSettingsPlan('lookup', { relationFieldId: 'relation' })).toEqual({ ok: false })
    expect(fieldSettingsPlan('unknown', {})).toEqual({ ok: false })
  })
  it('repairs an invalid legacy timezone without changing other datetime options', () => {
    expect(fieldSettingsPlan('datetime', { timeZone: 'not/a-zone', timeFormat: '12' })).toMatchObject({ ok: true,
      value: { timeZone: 'Europe/Moscow', timeFormat: '12' } })
  })
  it('recognises the date masks used by older production templates', () => {
    expect(fieldSettingsPlan('created_time', { dateFormat: 'dd.MM.yyyy HH:mm' })).toMatchObject({ ok: true, value: { dateFormat: 'ru' } })
    expect(fieldSettingsPlan('date', { dateFormat: 'dd.MM.yyyy' })).toMatchObject({ ok: true, value: { dateFormat: 'ru' } })
  })
  it('fills missing view defaults and is idempotent', () => {
    const plan = viewSettingsPlan({ ...view, config: { extension: 1 } })
    expect(plan).toMatchObject({ ok: true, changed: true, value: { sorts: [], hiddenFieldIds: [], extension: 1 } })
    if (plan.ok) expect(viewSettingsPlan({ ...view, config: plan.value })).toMatchObject({ ok: true, changed: false })
  })
  it('preserves filters and never turns malformed filters into unrestricted access', () => {
    const filter = { id: 'filter', conjunction: 'and', conditions: [{ id: 'condition', fieldId: 'secret', op: 'is', value: 'x' }] }
    expect(viewSettingsPlan({ ...view, config: { filter } })).toMatchObject({ ok: true, value: { filter } })
    expect(viewSettingsPlan({ ...view, config: { filter: null, columnWidths: { field: 150 } } }))
      .toMatchObject({ ok: true, value: { fieldWidths: { field: 150 }, filter: { conditions: [] } } })
    for (const config of [{ filter: { conditions: 'bad' } }, { filter: [] }, [], null]) {
      expect(viewSettingsPlan({ ...view, config })).toEqual({ ok: false })
    }
  })
})
