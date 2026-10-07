const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3101'
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) throw new Error('Readiness probe must be local')
let ready = false
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    ready = (await fetch(`${base}/pricing`, { signal: AbortSignal.timeout(2000) })).status === 200
    if (ready) break
  } catch { /* Server may still be starting. */ }
  await new Promise((done) => setTimeout(done, 500))
}
if (!ready) throw new Error('Web server did not become ready')
console.log('Local web server is ready')
