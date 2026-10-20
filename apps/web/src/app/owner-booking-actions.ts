'use server'

import { apps } from '@tableapp/db'
import { appSchema, newId } from '@tableapp/schema'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import type { BookingSetupInput } from './booking-actions'
import { authorizeApp } from '@/lib/authorize'
import { isValidEmail, normalizeEmail } from '@/lib/auth'
import { bookingService } from '@/lib/booking'
import { loadBookingData } from '@/lib/booking-store'
import { createRow, lockRowUsage, RowWriteError, writeRows } from '@/lib/row-mutations'
import { isPlanLimitError } from '@/lib/limits'
import { moduleForTable, setModuleGrant, workflowRole } from '@/lib/module-access'

/** Owner preparation writes real rows and draft access; an existing publication is never replaced here. */
export async function setupOwnerBookingMasterAction(appId: string, input: BookingSetupInput) {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  if (!input || typeof input !== 'object' ||
    !['name', 'email', 'start', 'end', 'breakStart', 'breakEnd', 'timeZone'].every(key => typeof input[key as keyof BookingSetupInput] === 'string') ||
    !input.name.trim() || input.name.length > 100 || !isValidEmail(input.email) || input.email.length > 254 ||
    !Array.isArray(input.serviceIds) || !input.serviceIds.length || input.serviceIds.length > 100 || input.serviceIds.some(id => typeof id !== 'string' || id.length > 100) ||
    !Array.isArray(input.weekdays) || !input.weekdays.length || input.weekdays.length > 7 || input.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    return { ok: false as const, error: 'Укажите имя, почту, услуги и рабочие дни мастера.' }
  }
  const clock = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : -1
  const start = clock(input.start), end = clock(input.end), fromBreak = clock(input.breakStart), toBreak = clock(input.breakEnd)
  const hasBreak = Boolean(input.breakStart || input.breakEnd)
  if (start < 0 || end <= start || hasBreak && (fromBreak <= start || toBreak <= fromBreak || toBreak >= end)) {
    return { ok: false as const, error: 'Конец смены должен быть позже начала. Оба времени перерыва должны находиться внутри смены.' }
  }
  try {
    await writeRows(auth.member.workspaceId, async context => {
      // Keep the same lock order as row operations and published schedule setup.
      await lockRowUsage(context)
      const [record] = await context.tx.select().from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, auth.member.workspaceId))).for('update')
      if (!record) throw new RowWriteError('denied', 'Приложение не найдено в выбранном бизнесе.')
      const draft = appSchema.parse(record.draft), config = draft.booking
      if (!config) throw new RowWriteError('invalid', 'В этом приложении нет записи по времени.')
      const data = await loadBookingData(config, auth.member.workspaceId, context.tx)
      const services = input.serviceIds.map(id => data && bookingService(config, data, id))
      if (!data || services.some(service => !service)) throw new RowWriteError('invalid', 'Выберите доступные услуги с ценой и длительностью.')
      if (data.timeZone !== input.timeZone) throw new RowWriteError('conflict', 'Часовой пояс изменился. Обновите страницу и проверьте время.')
      const windowMinutes = hasBreak ? Math.max(fromBreak - start, end - toBreak) : end - start
      if (services.some(service => service && Number(service.data[config.service.minutes]) > windowMinutes)) throw new RowWriteError('invalid', 'Одна из услуг не помещается в рабочий период. Увеличьте смену или измените перерыв.')
      const email = normalizeEmail(input.email)
      if (data.masters.some(master => String(master.data[config.master.email]).trim().toLowerCase() === email)) throw new RowWriteError('invalid', 'Мастер с этой почтой уже есть. Откройте его запись для изменения графика.')
      const staffRole = workflowRole(draft, config.tables.visits, 'staff')
      if (!draft.roles.some(role => role.id === staffRole)) throw new RowWriteError('invalid', 'В приложении не настроена роль мастера. Проверьте доступ.')
      const actor = { id: auth.member.userId, kind: 'member' as const }
      const masterId = newId('row')
      await createRow(context, config.tables.masters, {
        [config.master.name]: input.name.trim(), [config.master.email]: email,
        [config.master.services]: [...new Set(input.serviceIds)], [config.master.active]: true,
      }, actor, { id: masterId })
      const windows = hasBreak ? [[input.start, input.breakStart], [input.breakEnd, input.end]] : [[input.start, input.end]]
      for (const day of new Set(input.weekdays)) for (const [from, to] of windows) await createRow(context, config.tables.schedule, {
        [config.schedule.master]: [masterId], [config.schedule.weekday]: config.weekdays[day],
        [config.schedule.start]: from, [config.schedule.end]: to, [config.schedule.closed]: false,
        [config.schedule.name]: `${input.name.trim()} — ${['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][day]}: ${from}–${to}`,
      }, actor)
      const existing = draft.allowlist.find(entry => normalizeEmail(entry.email) === email)
      // Never downgrade an existing administrator or another explicitly assigned role.
      if (draft.moduleAccess) {
        const module = moduleForTable(draft, config.tables.visits)
        if (!module) throw new RowWriteError('invalid', 'Не найден раздел записи по времени.')
        const assigned = draft.moduleAccess.grants.some(grant => normalizeEmail(grant.email) === email && grant.moduleId === module.id)
        if (!assigned) draft.moduleAccess = setModuleGrant(draft.moduleAccess, email, module.id, staffRole)
      } else if (!existing) draft.allowlist = [...draft.allowlist, { email, roleId: staffRole, company: '' }]
      if (!appSchema.safeParse(draft).success) throw new RowWriteError('invalid', 'Не удалось добавить рабочую роль. Проверьте роли и лимит адресов в настройках доступа.')
      await context.tx.update(apps).set({ draft, allowlist: draft.allowlist, updatedAt: new Date() }).where(eq(apps.id, appId))
    })
  } catch (error) {
    if (error instanceof RowWriteError || isPlanLimitError(error)) return { ok: false as const, error: error.message }
    throw error
  }
  revalidatePath('/', 'layout')
  return { ok: true as const }
}
