'use server'

import { revalidatePath } from 'next/cache'
import { currentAppAccess } from '@/lib/app-session'
import { loadApp } from '@/lib/app-write-access'
import { canOpenScreen } from '@/lib/app-roles'
import { canAccessRow, rulesFor } from '@/lib/row-access'
import { RowWriteError, updateRow, writeRows } from '@/lib/row-mutations'
import { customerWorkflows } from '@tableapp/schema'

export async function customerDecisionAction(slug: string, rowId: string, baseVersion: number, decision: 'cancel' | 'approve' | 'decline', tableId?: string) {
  if (!['cancel', 'approve', 'decline'].includes(decision) || !Number.isSafeInteger(baseVersion)) return { ok: false, error: 'Обновите карточку и повторите действие' }
  const app = await loadApp(slug)
  if (!app?.customer) return { ok: false, error: 'Клиентский кабинет недоступен' }
  const config = customerWorkflows(app).find(config => tableId ? config.tableId === tableId : config === app.customer)
  if (!config) return { ok: false, error: 'Клиентский раздел недоступен' }
  const { visitor, viewer } = await currentAppAccess(app)
  const detail = app.screens.find(screen => screen.id === config.detailScreenId)
  if (!viewer || visitor.roleId !== 'client' || !detail || !canOpenScreen(detail, visitor)) return { ok: false, error: 'Это действие вам недоступно' }
  const rules = rulesFor(app, config.tableId, visitor)
  if (!rules.length) return { ok: false, error: 'Клиентский кабинет недоступен' }
  try {
    await writeRows(app.workspaceId, context => updateRow(context, config.tableId, rowId, (_fields, row) => {
      const data = row.data as Record<string, unknown>
      const status = String(data[config.statusFieldId] ?? '')
      if (decision === 'cancel') {
        if (!config.cancellableStatuses.includes(status)) throw new RowWriteError('invalid', 'На этом этапе отмена через кабинет недоступна. Свяжитесь с бизнесом.')
        return { [config.statusFieldId]: config.cancelStatus }
      }
      const approval = config.approval
      if (!approval || status !== approval.waitingStatus) throw new RowWriteError('conflict', 'Стоимость или статус изменились. Обновите карточку.')
      const price = data[approval.priceFieldId]
      if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) throw new RowWriteError('invalid', 'Стоимость пока не указана')
      return { [config.statusFieldId]: decision === 'approve' ? approval.approvedStatus : approval.declinedStatus, [approval.approvedPriceFieldId]: decision === 'approve' ? price : null }
    }, { id: viewer.id, kind: 'customer_decision' }, { baseVersion, guard: data => canAccessRow(rules, viewer, data) }))
  } catch (error) {
    if (error instanceof RowWriteError) return { ok: false, error: error.message }
    throw error
  }
  revalidatePath(`/a/${slug}`)
  return { ok: true }
}
