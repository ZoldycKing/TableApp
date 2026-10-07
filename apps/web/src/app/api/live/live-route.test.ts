import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Поток изменений: подписка и уборка.
 *
 * Проверяется то, что в браузере не увидеть: закрылась вкладка — слушатель
 * обязан исчезнуть вместе с таймером. Забытый слушатель живёт до перезапуска
 * процесса и держит память; забытый таймер раз в двадцать пять секунд ходит
 * в базу за правами того, кто давно ушёл.
 *
 * Права подменены: здесь проверяется уборка, а не доступ — доступ проверяется
 * своим набором и в браузере.
 */

const authorize = vi.fn()

vi.mock('@/lib/authorize', () => ({
  authorizeTable: (...args: unknown[]) => authorize(...args),
}))

afterEach(() => {
  vi.restoreAllMocks()
  authorize.mockReset()
})

describe('подписка на поток', () => {
  it('без доступа поток не открывается', async () => {
    authorize.mockResolvedValue({ ok: false, error: 'Объект не найден или принадлежит другому воркспейсу' })

    const { GET } = await import('./[tableId]/route')
    const { listenerCount } = await import('@/lib/live')

    const response = await GET(new Request('http://localhost/api/live/tbl_x'), {
      params: Promise.resolve({ tableId: 'tbl_x' }),
    })

    expect(response.status).toBe(403)
    expect(listenerCount('tbl_x')).toBe(0)
  })

  it('закрытая вкладка снимает слушателя и останавливает таймер', async () => {
    authorize.mockResolvedValue({ ok: true, member: { workspaceId: 'wsp_1', userId: 'usr_1' } })

    const { GET } = await import('./[tableId]/route')
    const { listenerCount, publishTable } = await import('@/lib/live')

    const controller = new AbortController()
    const response = await GET(new Request('http://localhost/api/live/tbl_live', { signal: controller.signal }), {
      params: Promise.resolve({ tableId: 'tbl_live' }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(listenerCount('tbl_live')).toBe(1)

    // Событие доходит, пока вкладка открыта.
    const reader = response.body!.getReader()
    const hello = await reader.read()
    expect(new TextDecoder().decode(hello.value)).toContain('подключено')

    publishTable('tbl_live', 'rows')
    const event = await reader.read()
    expect(new TextDecoder().decode(event.value)).toContain('"kind":"rows"')

    // Вкладку закрыли.
    controller.abort()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(listenerCount('tbl_live')).toBe(0)
    // Публикация после ухода никого не трогает и ничего не роняет.
    expect(() => publishTable('tbl_live', 'rows')).not.toThrow()
  })
})
