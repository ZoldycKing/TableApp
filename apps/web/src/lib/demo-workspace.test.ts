import { describe, expect, it, vi } from 'vitest'
vi.mock('@tableapp/db', () => { throw new Error('Interactive demo imported the database') })
import { loadDemoWorkspace } from './demo-runtime'
import { editDemoOrder, projectDemoWorkspace } from './demo-workspace'

describe('local demo order edits', () => {
  it('updates the staff and client projections without modifying the source fixture', () => {
    const data = loadDemoWorkspace(), before = structuredClone(data.rows)
    const status = data.fields.find(field => field.id === data.order.status)!
    if (status.type !== 'single_select') throw new Error('fixture')
    const ready = status.options.choices.find(choice => choice.name === 'Готов к выдаче')!
    const result = editDemoOrder(data, data.rows, 'staff', { tableId: data.order.tableId, rowId: data.order.rowId, values: { [status.id]: ready.id } })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    for (const role of ['staff', 'client']) {
      const runtime = projectDemoWorkspace(data, role, result.rows)
      expect(runtime.tables[data.order.tableId]!.rows.find(row => row.id === data.order.rowId)!.data[status.id]).toBe(ready.id)
    }
    expect(data.rows).toEqual(before)
    expect(loadDemoWorkspace().rows).toEqual(before)
  })
  it('keeps customer row boundaries and does not let the customer change the order status', () => {
    const data = loadDemoWorkspace()
    const client = projectDemoWorkspace(data, 'client'), staff = projectDemoWorkspace(data, 'staff')
    expect(client.tables[data.order.tableId]!.rows.length).toBeLessThan(staff.tables[data.order.tableId]!.rows.length)
    expect(projectDemoWorkspace(data, 'anonymous').tables[data.order.tableId]?.rows ?? []).toHaveLength(0)
    expect(editDemoOrder(data, data.rows, 'client', { tableId: data.order.tableId, rowId: data.order.rowId, values: { [data.order.status]: 'invented' } }).ok).toBe(false)
  })
  it('rejects invalid input atomically and ignores fields outside the demonstrated form', () => {
    const data = loadDemoWorkspace(), before = structuredClone(data.rows)
    expect(editDemoOrder(data, data.rows, 'staff', { tableId: data.order.tableId, rowId: data.order.rowId, values: { [data.order.status]: 'invented' } }).ok).toBe(false)
    expect(editDemoOrder(data, data.rows, 'staff', { tableId: data.order.tableId, rowId: data.order.rowId, values: { [data.order.amount]: 'not a number' } }).ok).toBe(false)
    const result = editDemoOrder(data, data.rows, 'staff', { tableId: data.order.tableId, rowId: data.order.rowId, values: { [data.order.amount]: 9200, [data.order.email]: 'other@example.ru' } })
    if (!result.ok) throw new Error(result.error)
    const next = result.rows.find(row => row.id === data.order.rowId)!
    expect(next.data[data.order.amount]).toBe(9200)
    expect(next.data[data.order.email]).toBe(before.find(row => row.id === data.order.rowId)!.data[data.order.email])
    expect(data.rows).toEqual(before)
    expect(() => projectDemoWorkspace({ ...data, app: { ...data.app, workspaceId: 'real-tenant' } }, 'staff')).toThrow('synthetic')
  })
})
