import { apps, fields as fieldsTable } from '@tableapp/db'
import { newId, type Field } from '@tableapp/schema'
import type { AppV2, AppV2Audience } from '@tableapp/schema/app-v2'
import { and, eq } from 'drizzle-orm'
import type { Transaction } from './db-transaction'
import { PROKAT_DEFAULT_HOLD_AFTER_START_MINUTES } from './prokat-logic'

type Runner = { select: Transaction['select']; update: Transaction['update']; insert: Transaction['insert'] }

const MOSCOW = { timeZone: 'Europe/Moscow' } as const
const ownerAudience: AppV2Audience = { kind: 'roles', roleIds: ['owner'] }

/**
 * Ensures older published Прокат kits have «Не забрали», holdUntil/statusReason,
 * business holdAfterStartMinutes, settings screen, and per-item hold override field.
 * Idempotent — safe to call from the worker and desk actions.
 */
export async function ensureProkatHoldKit(
  runner: Runner,
  app: AppV2,
): Promise<AppV2> {
  const prokat = app.prokat
  if (!prokat) return app

  let next = app
  let kit = { ...prokat, booking: { ...prokat.booking }, item: { ...prokat.item }, statuses: { ...prokat.statuses } }
  let dirty = false
  let screensDirty = false

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

  const existingBookingFields = await runner.select().from(fieldsTable).where(eq(fieldsTable.tableId, kit.bookingsTableId))
  const bookingByName = new Map(existingBookingFields.map(field => [field.name, field]))

  const ensureBookingField = async (name: string, type: Field['type'], options: Record<string, unknown>) => {
    const found = bookingByName.get(name)
    if (found) return found.id
    const id = newId('field')
    await runner.insert(fieldsTable).values({
      id,
      tableId: kit.bookingsTableId,
      name,
      type,
      options,
      position: `z${String(existingBookingFields.length + bookingByName.size).padStart(3, '0')}`,
    }).onConflictDoNothing()
    bookingByName.set(name, { id, name } as typeof existingBookingFields[number])
    dirty = true
    return id
  }

  if (!kit.booking.holdUntil) {
    const holdUntil = await ensureBookingField('Держать до', 'datetime', MOSCOW)
    kit = { ...kit, booking: { ...kit.booking, holdUntil } }
    dirty = true
  }
  if (!kit.booking.statusReason) {
    const statusReason = await ensureBookingField('Причина статуса', 'long_text', {})
    kit = { ...kit, booking: { ...kit.booking, statusReason } }
    dirty = true
  }
  if (kit.holdAfterStartMinutes === undefined) {
    kit = { ...kit, holdAfterStartMinutes: PROKAT_DEFAULT_HOLD_AFTER_START_MINUTES }
    dirty = true
  }

  const existingItemFields = await runner.select().from(fieldsTable).where(eq(fieldsTable.tableId, kit.itemsTableId))
  const itemByName = new Map(existingItemFields.map(field => [field.name, field]))
  if (!kit.item.holdAfterStartMinutes) {
    const found = itemByName.get('Держать бронь после начала')
    let fieldId = found?.id
    if (!fieldId) {
      fieldId = newId('field')
      await runner.insert(fieldsTable).values({
        id: fieldId,
        tableId: kit.itemsTableId,
        name: 'Держать бронь после начала',
        type: 'number',
        options: { format: 'decimal', precision: 0 },
        position: `z${String(existingItemFields.length + itemByName.size).padStart(3, '0')}`,
      }).onConflictDoNothing()
      dirty = true
    }
    kit = { ...kit, item: { ...kit.item, holdAfterStartMinutes: fieldId } }
    dirty = true
  }

  const settingsId = kit.settingsScreenId ?? newId('screen')
  const hasSettingsScreen = next.screens.some(screen => screen.id === settingsId)
  if (!kit.settingsScreenId || !hasSettingsScreen) {
    kit = { ...kit, settingsScreenId: settingsId }
    dirty = true
    if (!hasSettingsScreen) {
      next = {
        ...next,
        screens: [
          ...next.screens,
          {
            id: settingsId,
            name: 'Настройки проката',
            menuLabel: 'Настройки',
            icon: 'settings',
            navigation: true,
            audience: ownerAudience,
            contextTableId: null,
            rootIds: [],
            events: { enter: null },
          },
        ],
      }
      screensDirty = true
    }
  }

  if (!dirty && !screensDirty) return next

  next = { ...next, prokat: kit }
  const [row] = await runner.select({ published: apps.published, draft: apps.draft }).from(apps)
    .where(eq(apps.id, app.id)).limit(1)
  const patchDefinition = (definition: unknown) => {
    if (!definition || typeof definition !== 'object') return definition
    const current = definition as AppV2
    if (!current.prokat) return definition
    const mergedKit = {
      ...current.prokat,
      ...kit,
      booking: { ...current.prokat.booking, ...kit.booking },
      item: { ...current.prokat.item, ...kit.item },
      statuses: { ...current.prokat.statuses, ...kit.statuses },
    }
    let screens = current.screens
    if (screensDirty && kit.settingsScreenId && !screens.some(screen => screen.id === kit.settingsScreenId)) {
      screens = [
        ...screens,
        {
          id: kit.settingsScreenId,
          name: 'Настройки проката',
          menuLabel: 'Настройки',
          icon: 'settings',
          navigation: true,
          audience: ownerAudience,
          contextTableId: null,
          rootIds: [],
          events: { enter: null },
        },
      ]
    }
    return { ...current, prokat: mergedKit, screens }
  }
  await runner.update(apps).set({
    published: patchDefinition(row?.published) as AppV2,
    draft: patchDefinition(row?.draft) as AppV2,
  }).where(eq(apps.id, app.id))
  return next
}
