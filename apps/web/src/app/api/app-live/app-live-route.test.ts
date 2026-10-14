import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ANONYMOUS, asRole } from '@/lib/app-roles'
import { inventoryFixture } from '@/lib/templates/inventory-fixture.test-utils'
import { listenerCount, publishTable } from '@/lib/live'
import { GET } from './[slug]/route'

const mocks = vi.hoisted(() => ({ app: vi.fn(), access: vi.fn(), runtime: vi.fn(), metadata: vi.fn() }))
vi.mock('@/lib/app-write-access', () => ({ loadApp: mocks.app }))
vi.mock('@/lib/app-session', () => ({ currentAppAccess: mocks.access }))
vi.mock('@/lib/app-runtime', () => ({ loadPublishedApp: mocks.runtime }))
vi.mock('@/lib/runtime-page-data', () => ({ loadRuntimePageMetadata: mocks.metadata }))
const controllers: AbortController[] = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => { controllers.splice(0).forEach(controller => controller.abort()); vi.useRealTimers(); vi.clearAllMocks() })
function request() {
  const controller = new AbortController(); controllers.push(controller)
  return new Request('http://localhost/api/app-live/warehouse', { signal: controller.signal })
}
function setup() {
  const fixture = inventoryFixture()
  mocks.app.mockResolvedValue(fixture.app)
  mocks.access.mockResolvedValue({ visitor: asRole('staff'), viewer: null })
  mocks.runtime.mockResolvedValue(fixture.runtime)
  mocks.metadata.mockResolvedValue({ primaryByTable: new Map(Object.keys(fixture.runtime.tables).map(id => [id, null])) })
  return fixture
}
describe('published app notification access', () => {
  it('rejects unpublished apps and unauthorized visitors before subscribing', async () => {
    const { runtime } = setup()
    mocks.app.mockResolvedValueOnce(null)
    expect((await GET(request(), { params: Promise.resolve({ slug: 'warehouse' }) })).status).toBe(404)
    mocks.access.mockResolvedValue({ visitor: ANONYMOUS, viewer: null })
    expect((await GET(request(), { params: Promise.resolve({ slug: 'warehouse' }) })).status).toBe(403)
    expect(Object.keys(runtime.tables).every(id => listenerCount(id) === 0)).toBe(true)
  })
  it('projects the tables once and checks permissions on every event without reloading all rows', async () => {
    const { runtime } = setup()
    const response = await GET(request(), { params: Promise.resolve({ slug: 'warehouse' }) })
    expect(response.headers.get('cache-control')).toBe('no-store, no-transform')
    const reader = response.body!.getReader(); await reader.read()
    const table = Object.keys(runtime.tables)[0]!
    publishTable(table, 'rows')
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: {"changed":true}\n\n')
    expect(mocks.access).toHaveBeenCalledTimes(2)
    expect(mocks.runtime).toHaveBeenCalledTimes(1)
    await reader.cancel()
  })
  it('refreshes and closes when a published role definition changes, even with the same table IDs', async () => {
    const { app, runtime } = setup()
    const response = await GET(request(), { params: Promise.resolve({ slug: 'warehouse' }) })
    const reader = response.body!.getReader(); await reader.read()
    mocks.app.mockResolvedValue({ ...app, roles: app.roles.map(role => ({ ...role, name: 'Изменено' })) })
    await vi.advanceTimersByTimeAsync(25_000)
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"changed":true')
    expect((await reader.read()).done).toBe(true)
    expect(Object.keys(runtime.tables).every(id => listenerCount(id) === 0)).toBe(true)
  })
  it('observes related-only dependencies without exposing their identifiers or rows', async () => {
    const { runtime } = setup(), relatedTable = 'private_related_dependency'
    mocks.metadata.mockResolvedValue({ primaryByTable: new Map([...Object.keys(runtime.tables), relatedTable].map(id => [id, null])) })
    const response = await GET(request(), { params: Promise.resolve({ slug: 'warehouse' }) })
    const reader = response.body!.getReader(); await reader.read()
    expect(listenerCount(relatedTable)).toBe(1)
    publishTable(relatedTable, 'rows')
    const event = new TextDecoder().decode((await reader.read()).value)
    expect(event).toBe('data: {"changed":true}\n\n')
    expect(event).not.toContain(relatedTable)
    expect(mocks.runtime).toHaveBeenCalledTimes(1)
    await reader.cancel()
    expect(listenerCount(relatedTable)).toBe(0)
  })
})
