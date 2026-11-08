import { describe, expect, it } from 'vitest'
import { cloneBlock, executeFlow, findBlock, moveBlock, removeBlock, reorderBlocks, restorePrototype, seedPrototype } from './model'

describe('isolated builder prototype', () => {
  it('restores a valid document and rejects broken or unknown persisted graphs', () => {
    const value = seedPrototype()
    expect(restorePrototype(JSON.stringify(value))).toEqual(value)
    expect(restorePrototype('{')).toBeNull()
    expect(restorePrototype(JSON.stringify({ ...value, version: 2 }))).toBeNull()
    value.document.pages[0]!.blocks[1]!.children[0]!.id = 'welcome'
    expect(restorePrototype(JSON.stringify(value))).toBeNull()
  })
  it('copies nested blocks with independent identifiers and removes only the selected subtree', () => {
    const blocks = seedPrototype().document.pages[0]!.blocks, copy = cloneBlock(blocks[1]!)
    expect(copy.children[0]!.id).not.toBe(blocks[1]!.children[0]!.id)
    expect(findBlock(removeBlock(blocks, 'numbers'), 'task-count')).toBeUndefined()
    expect(findBlock(blocks, 'task-count')).toBeTruthy()
    expect(moveBlock(blocks, 'task-count', -1)[1]!.children[0]!.id).toBe('task-count')
    expect(reorderBlocks(blocks, 'tasks-list', 'welcome')[0]!.id).toBe('tasks-list')
  })
  it('opens tasks using their own table and completes only the selected task', () => {
    const value = seedPrototype(), list = findBlock(value.document.pages[0]!.blocks, 'tasks-list')!
    const detail = value.document.pages.find(page => page.id === list.targetPage)!
    expect(detail.blocks.every(block => block.source === 'tasks')).toBe(true)
    const result = executeFlow(value.document, value.data, detail.blocks[1]!.flowId, { source: 'tasks', rowId: 'task-1', role: 'owner', requestId: 'task-complete' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows.tasks[0]!.status).toBe('Готово')
    expect(result.data.rows.requests).toEqual(value.data.rows.requests)
  })
  it('changes the selected record and appends history once for the same request', () => {
    const value = seedPrototype(), context = { source: 'requests' as const, rowId: 'request-1', role: 'staff' as const, requestId: 'one' }
    const result = executeFlow(value.document, value.data, 'complete', context)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows.requests[0]!.status).toBe('Готово')
    expect(result.data.history).toHaveLength(1)
    expect(value.data.rows.requests[0]!.status).toBe('В работе')
    const repeated = executeFlow(value.document, result.data, 'complete', context)
    expect(repeated.ok && repeated.data.history).toHaveLength(1)
  })
  it('rolls back earlier staged changes when a later step fails', () => {
    const value = seedPrototype()
    value.document.flows[0]!.steps.push({ id: 'bad-target', type: 'navigate', pageId: 'deleted' })
    const before = structuredClone(value.data)
    expect(executeFlow(value.document, value.data, 'complete', { source: 'requests', rowId: 'request-1', role: 'owner', requestId: 'failed' }).ok).toBe(false)
    expect(value.data).toEqual(before)
  })
  it('rejects changing another employees record even when its ID is supplied', () => {
    const value = seedPrototype()
    const result = executeFlow(value.document, value.data, 'complete', { source: 'requests', rowId: 'request-2', role: 'staff', requestId: 'forbidden' })
    expect(result.ok).toBe(false)
    expect(value.data.history).toEqual([])
  })
  it('creates from form values and uses the new record for history and navigation', () => {
    const value = seedPrototype()
    const result = executeFlow(value.document, value.data, 'create', { source: 'requests', form: { title: 'Проверить принтер', amount: 1800 }, role: 'staff', requestId: 'new' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows.requests).toHaveLength(4)
    expect(result.data.history[0]!.title).toBe('Проверить принтер')
    expect(result.rowId).toBe(result.data.rows.requests[3]!.id)
    expect(result.pageId).toBe('detail')
    expect(executeFlow(value.document, value.data, 'create', { source: 'requests', form: { title: '' }, role: 'owner', requestId: 'empty' }).ok).toBe(false)
  })
})
