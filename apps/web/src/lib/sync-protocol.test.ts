import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor, syncPayloadSchema } from './sync-protocol'

const payload = { tableId: 'tbl_test', deviceId: 'device' }
describe('sync wire protocol', () => {
  it('round trips bounded revision cursors and restarts legacy timestamps', () => {
    const cursor = { v: 2 as const, scope: 'a'.repeat(64), policy: 'b'.repeat(64), seen: 0, after: 500, until: 1004, snapshot: true }
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor)
    expect(decodeCursor('2099-01-01T00:00:00.000Z')).toBeNull()
    expect(decodeCursor(null)).toBeNull()
  })
  it('rejects corrupt, unsafe and unexpected cursor fields', () => {
    for (const value of ['bad', 'v2.bad', 'v2.' + Buffer.from(JSON.stringify({ v: 2, scope: 'a'.repeat(64),
      policy: 'b'.repeat(64), seen: Number.MAX_SAFE_INTEGER + 1, after: 0 })).toString('base64url')]) {
      expect(() => decodeCursor(value)).toThrow()
    }
  })
  it('requires update values but accepts explicit null values', () => {
    const mutation = { id: 'edit', op: 'update', rowId: 'row', fieldId: 'field' }
    expect(syncPayloadSchema.safeParse({ ...payload, mutations: [mutation] }).success).toBe(false)
    expect(syncPayloadSchema.safeParse({ ...payload, mutations: [{ ...mutation, next: null }] }).success).toBe(true)
  })
  it('rejects extra fields and non-object create values', () => {
    expect(syncPayloadSchema.safeParse({ ...payload, admin: true }).success).toBe(false)
    expect(syncPayloadSchema.safeParse({ ...payload, mutations: [{ id: 'create', op: 'create', rowId: 'row', next: [] }] }).success).toBe(false)
  })
})
