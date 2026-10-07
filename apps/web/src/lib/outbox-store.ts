'use client'

import type { Mutation } from './sync-merge'

/**
 * Очередь правок на устройстве.
 *
 * Лежит в IndexedDB, а не в памяти: телефон закрывает фоновую вкладку без
 * предупреждения, и всё, что не на диске, исчезает вместе с ней — именно
 * тогда, когда человек в офлайне и очередь дороже всего.
 */

const DB_NAME = 'tableapp-outbox'
const DB_VERSION = 1
const QUEUE = 'queue'
const REJECTED = 'rejected'

export type QueuedMutation = Mutation & { tableId: string; queuedAt: number }

export type RejectedMutation = QueuedMutation & {
  reason: string
  current?: unknown
  rejectedAt: number
}

let connection: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (connection) return connection

  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(REJECTED)) db.createObjectStore(REJECTED, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return connection
}

async function run<T>(store: string, mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const request = body(tx.objectStore(store))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function enqueue(mutation: QueuedMutation): Promise<void> {
  await run(QUEUE, 'readwrite', (store) => store.put(mutation))
}

export async function listQueue(tableId?: string): Promise<QueuedMutation[]> {
  const all = await run<QueuedMutation[]>(QUEUE, 'readonly', (store) => store.getAll() as IDBRequest<QueuedMutation[]>)
  const mine = tableId ? all.filter((item) => item.tableId === tableId) : all
  // Порядок правок — это смысл: создание строки должно уехать раньше правок в неё.
  return mine.sort((a, b) => a.queuedAt - b.queuedAt)
}

export async function forget(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE, 'readwrite')
    for (const id of ids) tx.objectStore(QUEUE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Отклонённые переживают перезагрузку: иначе правка пропадёт молча. */
export async function remember(rejected: readonly RejectedMutation[]): Promise<void> {
  if (rejected.length === 0) return
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REJECTED, 'readwrite')
    for (const item of rejected) tx.objectStore(REJECTED).put(item)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function listRejected(tableId?: string): Promise<RejectedMutation[]> {
  const all = await run<RejectedMutation[]>(REJECTED, 'readonly', (store) => store.getAll() as IDBRequest<RejectedMutation[]>)
  const mine = tableId ? all.filter((item) => item.tableId === tableId) : all
  return mine.sort((a, b) => b.rejectedAt - a.rejectedAt)
}

export async function resolveRejected(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REJECTED, 'readwrite')
    for (const id of ids) tx.objectStore(REJECTED).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Идентификатор устройства: одна почта на двух телефонах — две очереди. */
export function deviceId(): string {
  const key = 'tableapp-device'
  try {
    const saved = localStorage.getItem(key)
    if (saved) return saved
    const fresh = `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
    localStorage.setItem(key, fresh)
    return fresh
  } catch {
    // Приватный режим без хранилища — устройство живёт до перезагрузки.
    return `dev_${Math.random().toString(36).slice(2)}`
  }
}
