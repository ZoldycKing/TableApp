'use client'

import { squash } from './outbox-queue'
import {
  deviceId,
  forget,
  listQueue,
  remember,
  type QueuedMutation,
  type RejectedMutation,
} from './outbox-store'

/**
 * Отправщик очереди.
 *
 * Онлайн и офлайн здесь — одно и то же: правка всегда ложится в очередь,
 * а отправщик её увозит. В сети очередь живёт полторы секунды, без сети —
 * сколько понадобится. Отдельного «офлайн-режима» нет, поэтому редкий путь
 * не может сломаться по-особенному: он не редкий.
 */

const DEBOUNCE_MS = 1500
const MAX_BATCH = 200
const BACKOFF_MS = [2000, 5000, 15000, 30000, 60000]

export type SyncRow = {
  id: string
  data: Record<string, unknown>
  position: string
  version: number
  deleted: boolean
}

export type SyncOutcome = {
  rows: SyncRow[]
  rejected: RejectedMutation[]
  pending: number
  cursor: string
}

type Listener = (outcome: SyncOutcome) => void

export class OutboxSender {
  private timer: number | null = null
  private failures = 0
  private sending = false
  private listeners = new Set<Listener>()

  constructor(
    private readonly tableId: string,
    private cursor: string | null = null,
  ) {}

  onResult(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Просыпаемся по трём поводам: правка, возврат сети, возврат на вкладку. */
  start(): () => void {
    const wake = () => this.schedule(0)
    window.addEventListener('online', wake)
    const onVisible = () => {
      if (document.visibilityState === 'visible') wake()
    }
    document.addEventListener('visibilitychange', onVisible)

    void this.flush()

    return () => {
      window.removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', onVisible)
      if (this.timer !== null) window.clearTimeout(this.timer)
    }
  }

  schedule(delay = DEBOUNCE_MS): void {
    if (this.timer !== null) window.clearTimeout(this.timer)
    this.timer = window.setTimeout(() => {
      this.timer = null
      void this.flush()
    }, delay)
  }

  async flush(): Promise<void> {
    if (this.sending) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return

    this.sending = true
    try {
      const queued = await listQueue(this.tableId)
      const batch = squash(queued).slice(0, MAX_BATCH)

      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tableId: this.tableId,
          deviceId: deviceId(),
          since: this.cursor,
          mutations: batch,
        }),
      })

      if (!response.ok) throw new Error(`Сервер ответил ${response.status}`)

      const result = (await response.json()) as {
        applied: string[]
        rejected: { id: string; reason?: string; current?: unknown }[]
        rows: SyncRow[]
        cursor: string
      }

      /*
       * Из очереди убираем всё, что уехало: и применённое, и отклонённое.
       * Отклонённое не пропадает — оно переезжает в список на разбор,
       * иначе очередь будет вечно возить правку, которую сервер не примет.
       */
      const byId = new Map(queued.map((item) => [item.id, item]))
      const rejected: RejectedMutation[] = result.rejected.map((item) => ({
        ...(byId.get(item.id) ?? ({ id: item.id, tableId: this.tableId, queuedAt: Date.now() } as QueuedMutation)),
        reason: item.reason ?? 'Правка не применена',
        current: item.current,
        rejectedAt: Date.now(),
      }))

      await remember(rejected)
      await forget([...result.applied, ...result.rejected.map((item) => item.id)])

      this.cursor = result.cursor
      this.failures = 0

      const pending = (await listQueue(this.tableId)).length
      const outcome: SyncOutcome = { rows: result.rows, rejected, pending, cursor: result.cursor }
      for (const listener of this.listeners) listener(outcome)

      // Очередь была длиннее одной пачки — продолжаем, не дожидаясь правок.
      if (pending > 0) this.schedule(0)
    } catch {
      // Сеть пропала или сервер недоступен: очередь остаётся нетронутой,
      // повторяем с растущей задержкой, чтобы не долбить сервер.
      const wait = BACKOFF_MS[Math.min(this.failures, BACKOFF_MS.length - 1)]!
      this.failures += 1
      this.schedule(wait)
    } finally {
      this.sending = false
    }
  }
}
