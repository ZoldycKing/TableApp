import { strict as assert } from 'node:assert'
import { and, eq, inArray } from 'drizzle-orm'
import { createReadinessFixture, removeReadinessFixture, db, sql, rows, workspaceUsage } from './readiness-fixture.mts'

const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3101'
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'Load check must target a local server')
const fixture = await createReadinessFixture()
const cookie = `tableapp_session=${fixture.session}; tableapp_workspace=${fixture.ids.workspace}`
const controllers = Array.from({ length: 20 }, () => new AbortController())
const streams = controllers.map(() => ({ connected: false, beats: 0, events: 0, ended: false, failed: false }))
const work: Promise<void>[] = []
const latency: Record<string, number[]> = { pages: [], writes: [], sync: [] }
const timed = async (kind: keyof typeof latency, action: () => Promise<void>) => {
  const started = performance.now(); await action(); latency[kind]!.push(performance.now() - started)
}
const sync = async (extra: Record<string, unknown> = {}) => {
  const response = await fetch(`${base}/api/sync`, { method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ tableId: fixture.ids.table, deviceId: 'readiness', mutations: [], ...extra }) })
  assert.equal(response.status, 200)
  return response.json()
}
try {
  work.push(...controllers.map(async (controller, index) => {
    const record = streams[index]!
    try {
      const response = await fetch(`${base}/api/live/${fixture.ids.table}`, { headers: { cookie }, signal: controller.signal })
      assert.equal(response.status, 200); assert.match(response.headers.get('content-type')!, /text\/event-stream/)
      const reader = response.body!.getReader(), decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) { record.ended = !controller.signal.aborted; break }
        buffer += decoder.decode(chunk.value, { stream: true })
        const frames = buffer.split('\n\n'); buffer = frames.pop()!
        for (const frame of frames) {
          if (frame.includes(': подключено')) record.connected = true
          if (frame.includes(': жив')) record.beats++
          if (frame.startsWith('data: ')) record.events++
        }
      }
    } catch { if (!controller.signal.aborted) record.failed = true }
  }))
  const openedAt = Date.now()
  while (!streams.every((stream) => stream.connected)) {
    assert.ok(Date.now() - openedAt < 15000 && !streams.some((stream) => stream.failed), 'SSE connections did not open')
    await new Promise((done) => setTimeout(done, 20))
  }
  const heldAt = Date.now()
  const first = await sync(), second = await sync({ since: first.cursor })
  assert.equal(first.rows.length, 500); assert.equal(second.rows.length, 100); assert.equal(second.hasMore, false)
  assert.equal(new Set([...first.rows, ...second.rows].map((row) => row.id)).size, 600)
  const pages = ['/', '/pricing', '/templates', '/features', '/templates/zakazy']
  await Promise.all([
    ...Array.from({ length: 10 }, async (_, index) => {
      for (let i = 0; i < 10; i++) await timed('pages', async () => {
        const response = await fetch(`${base}${pages[(index + i) % pages.length]}`, { signal: AbortSignal.timeout(15000) })
        assert.equal(response.status, 200); await response.arrayBuffer()
      })
    }),
    ...Array.from({ length: 20 }, (_, index) => timed('writes', async () => {
      const result = await sync({ mutations: [{ id: `readiness-edit-${index}`, op: 'update', rowId: fixture.recordIds[index],
        fieldId: fixture.ids.text, base: `Проверочная запись ${index + 1}`, next: `Изменение ${index + 1}` }] })
      assert.deepEqual(result.applied, [`readiness-edit-${index}`]); assert.equal(result.rejected.length, 0)
    })),
    ...Array.from({ length: 20 }, () => timed('sync', async () => {
      const result = await sync(); assert.equal(result.rows.length, 500); assert.equal(result.hasMore, true)
    })),
  ])
  const saved = await db.select().from(rows).where(and(eq(rows.tableId, fixture.ids.table), inArray(rows.id, fixture.recordIds.slice(0, 20))))
  assert.equal(saved.length, 20)
  for (const row of saved) {
    const index = fixture.recordIds.findIndex((id) => id === row.id)
    assert.equal((row.data as Record<string, unknown>)[fixture.ids.text], `Изменение ${index + 1}`)
    assert.equal(row.version, 1); assert.equal(row.updatedBy, fixture.ids.user)
  }
  const [usage] = await db.select().from(workspaceUsage).where(eq(workspaceUsage.workspaceId, fixture.ids.workspace))
  assert.equal(usage!.rows, 600)
  console.log(JSON.stringify({ phase: 'requests passed; holding streams', pages: 100, writes: 20, syncReads: 20, streams: 20 }))
  await new Promise((done) => setTimeout(done, Math.max(0, 60000 - (Date.now() - heldAt))))
  assert.ok(streams.every((stream) => !stream.failed && !stream.ended && stream.beats >= 2 && stream.events >= 20), 'SSE lost events, heartbeats or connections')
  for (const controller of controllers) controller.abort()
  await Promise.all(work)
  // The process must remain usable after all clients disconnect.
  await sync()
  const summary = Object.fromEntries(Object.entries(latency).map(([kind, values]) => {
    const sorted = values.sort((a, b) => a - b)
    return [kind, { count: sorted.length, medianMs: Math.round(sorted[Math.floor(sorted.length / 2)]!),
      p95Ms: Math.round(sorted[Math.ceil(sorted.length * .95) - 1]!), maxMs: Math.round(sorted.at(-1)!) }]
  }))
  console.log(JSON.stringify({ status: 'passed', rows: 600, concurrentStreams: 20, heldSeconds: 60,
    heartbeatRange: [Math.min(...streams.map((s) => s.beats)), Math.max(...streams.map((s) => s.beats))],
    eventRange: [Math.min(...streams.map((s) => s.events)), Math.max(...streams.map((s) => s.events))], latency: summary }))
} finally {
  controllers.forEach((controller) => controller.abort())
  await Promise.allSettled(work)
  await removeReadinessFixture(fixture)
  await sql.end()
}
