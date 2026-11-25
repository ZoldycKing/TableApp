import { apps, fields as fieldsTable } from '@tableapp/db'
import { newId, type Field } from '@tableapp/schema'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { and, eq } from 'drizzle-orm'
import type { Transaction } from './db-transaction'
import { PROKAT_DEFAULT_HOLD_AFTER_START_MINUTES } from './prokat-logic'

type Runner = { select: Transaction['select']; update: Transaction['update']; insert: Transaction['insert'] }

const MOSCOW = { timeZone: 'Europe/Moscow' } as const

/**
 * Ensures older published Прокат kits have «Не забрали», holdUntil/statusReason fields,
 * and holdAfterStartMinutes. Idempotent — safe to call from the worker and desk actions.
 */
export async function ensureProkatHoldKit(
  runner: Runner,
  app: AppV2,
): Promise<AppV2> {
  const prokat = app.prokat
  if (!prokat) return app

  let next = app
  let kit = { ...prokat }
  let dirty = false

  const [statusField] = await runner.select().from(fieldsTable)
    .where(and(eq(fieldsTable.id, kit.booking.status), eq(fieldsTable.tableId, kit.bookingsTableId)))
    .limit(1)
  if (statusField?.type === 'single_select') {
    const options = (statusField.options ?? {}) as { choices?: { id: string; name: string; color?: string }[]; defaultChoiceId?: string }
    const choices = [...(options.choices ?? [])]
    let notPickedUpId = kit.statuses.notPickedUp
      ?? choices.find(choice => choice.name === 'Не забрали')?.id
    if (!notPickedUpId) {
      notPickedUpId = newId('choice')
      choices.push({ id: notPickedUpId, name: 'Не забрали', color: 'red' })
      await runner.update(fieldsTable).set({
        options: { ...options, choices },
        updatedAt: new Date(),
      }).where(eq(fieldsTable.id, statusField.id))
      dirty = true
    } else if (!choices.some(choice => choice.id === notPickedUpId)) {
      choices.push({ id: notPickedUpId, name: 'Не забрали', color: 'red' })
      await runner.update(fieldsTable).set({
        options: { ...options, choices },
        updatedAt: new Date(),
      }).where(eq(fieldsTable.id, statusField.id))
      dirty = true
    }
    if (kit.statuses.notPickedUp !== notPickedUpId) {
      kit = { ...kit, statuses: { ...kit.statuses, notPickedUp: notPickedUpId } }
      dirty = true
    }
  }

  const existing = await runner.select().from(fieldsTable).where(eq(fieldsTable.tableId, kit.bookingsTableId))
  const byName = new Map(existing.map(field => [field.name, field]))

  const ensureField = async (name: string, type: Field['type'], options: Record<string, unknown>) => {
    const found = byName.get(name)
    if (found) return found.id
    const id = newId('field')
    await runner.insert(fieldsTable).values({
      id,
      tableId: kit.bookingsTableId,
      name,
      type,
      options,
      position: `z${String(existing.length + byName.size).padStart(3, '0')}`,
    }).onConflictDoNothing()
    byName.set(name, { id, name } as typeof existing[number])
    dirty = true
    return id
  }

  if (!kit.booking.holdUntil) {
    const holdUntil = await ensureField('Держать до', 'datetime', MOSCOW)
    kit = { ...kit, booking: { ...kit.booking, holdUntil } }
    dirty = true
  }
  if (!kit.booking.statusReason) {
    const statusReason = await ensureField('Причина статуса', 'long_text', {})
    kit = { ...kit, booking: { ...kit.booking, statusReason } }
    dirty = true
  }
  if (kit.holdAfterStartMinutes === undefined) {
    kit = { ...kit, holdAfterStartMinutes: PROKAT_DEFAULT_HOLD_AFTER_START_MINUTES }
    dirty = true
  }

  if (!dirty) return next

  next = { ...next, prokat: kit }
  const [row] = await runner.select({ published: apps.published, draft: apps.draft }).from(apps)
    .where(eq(apps.id, app.id)).limit(1)
  const patchDefinition = (definition: unknown) => {
    if (!definition || typeof definition !== 'object') return definition
    const current = definition as AppV2
    if (!current.prokat) return definition
    return { ...current, prokat: { ...current.prokat, ...kit, booking: { ...current.prokat.booking, ...kit.booking }, statuses: { ...current.prokat.statuses, ...kit.statuses } } }
  }
  await runner.update(apps).set({
    published: patchDefinition(row?.published) as AppV2,
    draft: patchDefinition(row?.draft) as AppV2,
  }).where(eq(apps.id, app.id))
  return next
}
