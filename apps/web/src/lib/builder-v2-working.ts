import { apps, rows } from '@tableapp/db'
import { canOpenAppV2Screen, matchesAppV2Audience } from '@tableapp/schema/app-v2'
import { readAppDefinition, validateAppV2Definition } from '@tableapp/schema/app-definition'
import { and, eq, isNull } from 'drizzle-orm'
import { loadBuilderV2Catalog, builderV2Revision } from './builder-v2'
import { builderV2MemberActor } from './builder-v2-actor'
import { RowWriteError } from './row-mutations'
import type { Member } from './session'
import type { Transaction } from './db-transaction'
import { builderV2WorkingPath,builderV2ActionContext } from './builder-v2-working-scope'

/** Private execution only. This does not expose draft execution to app users. */
export async function workingBuilderV2Screen(tx: Transaction, appId: string, member: Member, screenId: string, lock = false) {
  const query = tx.select().from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, member.workspaceId)))
  const [record] = lock ? await query.for('share') : await query
  const read = readAppDefinition(record?.draft)
  if (!record || !read.ok || read.formatVersion !== 2 || read.app.id !== appId || read.app.workspaceId !== member.workspaceId) throw new RowWriteError('denied', 'Действие недоступно')
  const { catalog, tables } = await loadBuilderV2Catalog(member.workspaceId, tx), checked = validateAppV2Definition(read.app, catalog)
  if (!checked.ok) throw new RowWriteError('invalid', 'Настройки приложения изменились. Вернитесь в редактор.')
  const app = checked.app, actor = builderV2MemberActor(app, member), screen = app.screens.find(screen => screen.id === screenId)
  if (!screen || !canOpenAppV2Screen(app, actor, screen.id)) throw new RowWriteError('denied', 'Этот экран недоступен вашей роли')
  return {app,actor,screen,tables,revision:builderV2Revision(record.draft)}
}
export async function workingBuilderV2Node(tx: Transaction, appId: string, member: Member, screenId: string, nodeId: string, lock = false, button = false) {
  const current=await workingBuilderV2Screen(tx,appId,member,screenId,lock),{app,actor,screen}=current,node=app.nodes.find(node=>node.id===nodeId)
  if(!node)throw new RowWriteError('denied','Действие недоступно')
  const ancestors = button?builderV2ActionContext(app,screen.id,nodeId)?.path:builderV2WorkingPath(app, screen.id, nodeId)
  if (!ancestors || ancestors.some(node => node.visibleTo && !matchesAppV2Audience(node.visibleTo, actor))) throw new RowWriteError('denied', 'Действие недоступно на этом экране')
  if (!button&&ancestors.some(node => node.visibleWhen)) throw new RowWriteError('invalid', 'Рабочие действия с условиями видимости пока не поддерживаются')
  return {...current,node}
}
export async function workingBuilderV2Record(tx: Transaction, tableId: string, rowId: string | undefined, lock = false, includeDeleted=false) {
  if (!rowId) throw new RowWriteError('invalid', 'Сначала откройте запись из списка')
  const query = tx.select().from(rows).where(and(eq(rows.tableId, tableId), eq(rows.id, rowId), includeDeleted?undefined:isNull(rows.deletedAt)))
  const [row] = lock ? await query.for('update') : await query
  if (!row) throw new RowWriteError('missing', 'Запись удалена или больше недоступна')
  return row
}
