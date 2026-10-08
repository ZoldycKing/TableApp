import { subscribeTable, type LiveEvent } from './live'

/** One connection owns its subscription, timer and abort listener. */
export function tableLiveStream(tableId: string | string[], signal: AbortSignal, authorize: () => Promise<boolean>, heartbeatMs = 25_000, appStream = false) {
  let stop = () => {}
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let active = true, checking = false
      let unsubscribe = () => {}
      let timer: ReturnType<typeof setInterval> | undefined
      stop = () => {
        if (!active) return
        active = false
        if (timer !== undefined) clearInterval(timer)
        unsubscribe()
        signal.removeEventListener('abort', stop)
        try { controller.close() } catch { /* Already cancelled by the reader. */ }
      }
      const encoder = new TextEncoder()
      const send = (payload: string) => {
        if (!active) return
        try { controller.enqueue(encoder.encode(payload)) } catch { stop() }
      }
      if (signal.aborted) { stop(); return }
      const ids = typeof tableId === 'string' ? [tableId] : [...new Set(tableId)]
      const listeners = ids.map(id => subscribeTable(id, (event: LiveEvent) => {
        if (!appStream) { send(`data: ${JSON.stringify(event)}\n\n`); return }
        // Published apps receive no table IDs or row data. Recheck revoked access.
        void authorize().then(allowed => {
          if (!active) return
          send('data: {"changed":true}\n\n')
          if (!allowed) stop()
        }).catch(stop)
      }))
      unsubscribe = () => listeners.forEach(remove => remove())
      signal.addEventListener('abort', stop, { once: true })
      timer = setInterval(() => {
        if (!active || checking) return
        checking = true
        void (async () => {
          try {
            if (!await authorize()) {
              if (appStream) send('data: {"changed":true}\n\n')
              stop(); return
            }
            send(': жив\n\n')
          } catch { stop() } finally { checking = false }
        })()
      }, heartbeatMs)
      send(': подключено\n\n')
    },
    cancel() { stop() },
  })
}
