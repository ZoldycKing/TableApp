import { strict as assert } from 'node:assert'
import { createReadinessFixture, removeReadinessFixture, sql } from './readiness-fixture.mts'
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3101'
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname))
const fixture = await createReadinessFixture(8)
try {
  const missing = await fetch(`${base}/auth`, { redirect: 'manual' })
  assert.equal(missing.status, 307); assert.match(missing.headers.get('location')!, /^\/login\?error=/)
  const login = await fetch(`${base}/auth?token=${fixture.token}`, { redirect: 'manual' })
  assert.equal(login.status, 307); assert.equal(login.headers.get('location'), '/app')
  const session = login.headers.getSetCookie().find((value) => value.startsWith('tableapp_session='))!
  assert.ok(session); assert.match(session, /httponly/i); assert.match(session, /secure/i)
  const page = await fetch(`${base}/t/${fixture.ids.table}`, { headers: { cookie: session.split(';')[0]! }, redirect: 'manual' })
  assert.equal(page.status, 200); assert.ok((await page.text()).includes('Проверочная запись 1'))
  const replay = await fetch(`${base}/auth?token=${fixture.token}`, { redirect: 'manual' })
  assert.match(replay.headers.get('location')!, /^\/login\?error=/)
  const appMissing = await fetch(`${base}/a/not-a-real-app/auth`, { redirect: 'manual' })
  assert.match(appMissing.headers.get('location')!, /^\/a\/not-a-real-app\?error=/)
  console.log(JSON.stringify({ status: 'passed', checked: ['relative auth redirects', 'session cookie', 'authenticated table', 'replayed token', 'app redirect'] }))
} finally { await removeReadinessFixture(fixture); await sql.end() }
