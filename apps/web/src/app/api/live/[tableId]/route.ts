import { authorizeTable } from '@/lib/authorize'
import { tableLiveStream } from '@/lib/table-live-stream'

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

  const stream = tableLiveStream(tableId, _request.signal, async () => (await authorizeTable(tableId, false)).ok, HEARTBEAT_MS)

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
