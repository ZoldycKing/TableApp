import { authorizeTable } from '@/lib/authorize'
import { subscribeTable, type LiveEvent } from '@/lib/live'

/**
 * Поток изменений таблицы.
 *
 * Открывается на вкладке редактора и живёт, пока вкладка открыта. По нему
 * едет только факт «таблица изменилась»; данные браузер перечитывает обычным
 * путём, со всеми проверками прав.
 *
 * Права проверяются дважды: при подписке и на каждом сигнале жизни.
 * Второе важнее первого — доступ отзывают у открытой вкладки, и поток,
 * проверивший права один раз на входе, продолжал бы говорить человеку,
 * что в чужой таблице что-то происходит.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Раз в двадцать пять секунд: прокси обрывают тихие соединения на минуте. */
const HEARTBEAT_MS = 25_000

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tableId: string }> },
): Promise<Response> {
  const { tableId } = await params

  // Читателю достаточно права читать: поток ничего не меняет.
  const auth = await authorizeTable(tableId, false)
  if (!auth.ok) return new Response(auth.error, { status: 403 })

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let alive = true

      const send = (payload: string) => {
        if (!alive) return
        try {
          controller.enqueue(encoder.encode(payload))
        } catch {
          alive = false
        }
      }

      const push = (event: LiveEvent) => send(`data: ${JSON.stringify(event)}\n\n`)

      // Первое сообщение сразу: браузер считает соединение установленным
      // и не держит «подключаемся» до первого изменения.
      send(`: подключено\n\n`)

      const unsubscribe = subscribeTable(tableId, push)

      const beat = setInterval(() => {
        void (async () => {
          const still = await authorizeTable(tableId, false)
          if (!still.ok) {
            // Доступ отозвали: закрываем поток. Браузер попробует переподключиться
            // и получит отказ — на экране это станет видно обычным путём.
            stop()
            return
          }
          send(`: жив\n\n`)
        })()
      }, HEARTBEAT_MS)

      const stop = () => {
        if (!alive) return
        alive = false
        clearInterval(beat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // Уже закрыт браузером — это обычный конец, а не ошибка.
        }
      }

      _request.signal.addEventListener('abort', stop)
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      // Nginx иначе копит ответ в буфере и поток не доходит до браузера.
      'x-accel-buffering': 'no',
    },
  })
}
