import { apps, attachments, businessCustomerApps, businessCustomers, conversationMessages as messages, conversationNotes as notes, conversationRevisions as revisions,
  conversations, db, rows, tables, workspaces } from '@tableapp/db'
import { appSchema, newId, type Attachment } from '@tableapp/schema'
import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { appAccessFor, currentAppAccess } from './app-session'
import { currentMember } from './session'
import { appReadPolicy } from './app-read-policy'
import { validateAppReferences } from './app-references'
import { canEnter } from './app-roles'
import { hasRole, moduleForTable, workflowRole } from './module-access'
import { legacyAppModules } from './app-modules'
import { conversationResource } from './conversation-resource'
import { conversationContextTitle } from './conversation-context'
import { removeTrackedAttachment } from './file-upload'
import { RowWriteError, writeRows } from './row-mutations'
import type { Transaction } from './db-transaction'
import type { ConversationPage } from './conversation-types'
import { GENERAL_CONVERSATION_TABLE } from './conversation-types'
import { generalConversationAccess } from './general-conversation-access'

type Runner = typeof db | Transaction
const denied = () => new RowWriteError('denied', 'Переписка недоступна или обращение не найдено')
const validReference = (value: string) => typeof value === 'string' && value.length > 0 && value.length <= 200
const validRequest = (value: string) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)
function bodyText(value: string) {
  if (typeof value !== 'string' || value.length > 4000) throw new RowWriteError('invalid', 'Сообщение должно содержать не больше 4000 символов')
  return value.trim()
}

/** Resolve tenant, parent, identity and live grants from the server on every operation. */
export async function conversationAccess(slug: string, tableId: string, rowId: string, runner: Runner = db, business = false) {
  if (typeof business !== 'boolean') throw denied()
  if (![slug, tableId, rowId].every(validReference)) throw denied()
  const [record] = await runner.select().from(apps).where(eq(apps.slug, slug)).limit(1)
  const parsed = appSchema.safeParse(record?.published)
  if (!record || !parsed.success) throw denied()
  const app = { ...parsed.data, id: record.id, workspaceId: record.workspaceId, slug: record.slug }
  if (tableId === GENERAL_CONVERSATION_TABLE) {
    if (await validateAppReferences(app)) throw denied()
    return generalConversationAccess(app, rowId, runner, business)
  }
  if (!conversationResource(app, tableId) || await validateAppReferences(app)) throw denied()
  const [parent] = await runner.select({ row: rows }).from(rows).innerJoin(tables, eq(rows.tableId, tables.id))
    .where(and(eq(rows.id, rowId), eq(rows.tableId, tableId), eq(tables.workspaceId, app.workspaceId), isNull(rows.deletedAt))).limit(1)
  if (!parent) throw denied()
  const member = business ? await currentMember() : null
  if(member&&member.role!=='owner'&&member.tableAccess!=null)throw denied()
  const [space] = await runner.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, app.workspaceId))
  const owner = Boolean(member && member.workspaceId === app.workspaceId && member.role === 'owner' && space?.ownerId === member.userId)
  if (business && (!member || member.workspaceId !== app.workspaceId)) throw denied()
  const access = owner ? null : business ? await appAccessFor(app, member!.email) : await currentAppAccess(app)
  const module = moduleForTable(app, tableId) ?? legacyAppModules(app).find(module => module.source.type === 'booking'
    ? app.booking?.tables.visits === tableId : module.source.type === 'customer' && module.source.tableId === tableId)
  if (!module) throw denied()
  const email = String((parent.row.data as Record<string, unknown>)[conversationResource(app, tableId)!.emailFieldId] ?? '').trim().toLowerCase()
  if (!email || email.length > 254 || !email.includes('@')) throw denied()
  let staff = owner, manager = owner, readableData = parent.row.data as Record<string, unknown>
  if (!owner) {
    if (!access?.viewer || !access.visitor.authenticated || !canEnter(app, access.visitor)) throw denied()
    manager = hasRole(access.visitor, workflowRole(app, tableId, 'manager'))
    staff = manager || hasRole(access.visitor, workflowRole(app, tableId, 'staff')) || module.source.type === 'booking' && hasRole(access.visitor, workflowRole(app, tableId, 'master'))
    const policy = await appReadPolicy(app, tableId, access.visitor, access.viewer)
    if (!policy.canRead(parent.row.data as Record<string, unknown>, parent.row)) throw denied()
    readableData = policy.project(parent.row.data as Record<string, unknown>, parent.row)
    if (!staff && (access.visitor.roleId !== 'client' || access.viewer.email.trim().toLowerCase() !== email)) throw denied()
    // Platform membership alone never grants access to client correspondence.
    if (business && !staff) throw denied()
  }
  const [profile] = await runner.select().from(businessCustomers).where(and(eq(businessCustomers.workspaceId, app.workspaceId), eq(businessCustomers.email, email)))
  // Verified identities survive app deletion and changes between customer/work roles.
  // Authorization still uses the explicitly selected authentication circuit.
  const actorEmail = owner ? member!.email : access!.viewer!.email
  const actorId = `person_${createHash('sha256').update(`${app.workspaceId}:${actorEmail.trim().toLowerCase()}`).digest('hex')}`
  return { kind: 'record' as const, app, parent: parent.row, readableData, access, module, customerId: profile?.id ?? null, email, staff, manager, owner, actorId,
    uploadId: owner ? member!.userId : access!.viewer!.id,
    authorKind: owner ? 'business' : staff ? 'staff' : 'client',
    authorName: (owner ? member!.name ?? 'Владелец бизнеса' : access!.viewer!.name ?? (staff ? 'Сотрудник' : 'Клиент')).slice(0, 80) }
}
type Access = Awaited<ReturnType<typeof conversationAccess>>
async function threadFor(access: Access, runner: Runner, create = false) {
  if (!access.customerId && create) {
    await runner.insert(businessCustomers).values({ id: newId('businessCustomer'), workspaceId: access.app.workspaceId, email: access.email }).onConflictDoNothing()
    const [profile] = await runner.select({ id: businessCustomers.id }).from(businessCustomers).where(and(eq(businessCustomers.workspaceId, access.app.workspaceId), eq(businessCustomers.email, access.email)))
    access.customerId = profile!.id
  }
  if (!access.customerId) return null
  const where = and(eq(conversations.workspaceId, access.app.workspaceId), eq(conversations.kind, access.kind),
    eq(conversations.customerId, access.customerId), access.kind === 'record'
      ? and(eq(conversations.tableId, access.parent.tableId), eq(conversations.rowId, access.parent.id)) : undefined)
  let [thread] = await runner.select().from(conversations).where(where)
  if (!thread && create) {
    if (!access.app.communications?.enabled) throw new RowWriteError('invalid', 'Новые переписки временно отключены. Свяжитесь с бизнесом.')
    ;[thread] = await runner.insert(conversations).values({ id: `con_${newId('row').slice(4)}`, workspaceId: access.app.workspaceId, appId: access.app.id,
      kind: access.kind, moduleId: access.module?.id ?? null, tableId: access.parent?.tableId ?? null, rowId: access.parent?.id ?? null, customerId: access.customerId }).onConflictDoNothing().returning()
    if (!thread) [thread] = await runner.select().from(conversations).where(where)
  }
  if (thread && (thread.kind !== access.kind || thread.moduleId !== (access.module?.id ?? null))) throw denied()
  if (thread && create && access.kind === 'general') await runner.insert(businessCustomerApps)
    .values({ workspaceId: access.app.workspaceId, customerId: access.customerId, appId: access.app.id }).onConflictDoNothing()
  return thread ?? null
}

const fileDTO = (file: typeof attachments.$inferSelect): Attachment => ({
  id: file.id, key: file.key, name: file.name, mime: file.mime, size: file.size,
  width: file.width, height: file.height,
  scanStatus: (file.scanStatus as Attachment['scanStatus']) || 'clean',
})
export async function readConversation(slug: string, tableId: string, rowId: string, before?: number, business = false): Promise<ConversationPage> {
  if (before !== undefined && (!Number.isSafeInteger(before) || before <= 0)) throw denied()
  const access = await conversationAccess(slug, tableId, rowId, db, business), thread = await threadFor(access, db)
  const base = { conversationId: thread?.id ?? null, enabled: Boolean(access.app.communications?.enabled), closed: Boolean(thread?.closedAt), staff: access.staff, canManage: access.manager,
    contextTitle: access.kind === 'general' ? 'Вопрос бизнесу' : await conversationContextTitle(access.app, tableId, access.readableData, access.access) }
  if (!thread) return { ...base, messages: [], nextBefore: null, notes: [] }
  const found = await db.select().from(messages).where(and(eq(messages.workspaceId, access.app.workspaceId), eq(messages.conversationId, thread.id),
    before === undefined ? undefined : lt(messages.sequence, before))).orderBy(desc(messages.sequence)).limit(51)
  const page = found.slice(0, 50).reverse(), ids = page.filter(message => !message.deletedAt).map(message => message.id)
  const files = ids.length ? await db.select().from(attachments).where(and(eq(attachments.workspaceId, access.app.workspaceId), eq(attachments.conversationId, thread.id), inArray(attachments.messageId, ids), eq(attachments.state, 'ready'))) : []
  // A client response never queries the notes table.
  const privateNotes = access.staff && before === undefined ? await db.select().from(notes).where(and(eq(notes.workspaceId, access.app.workspaceId), eq(notes.conversationId, thread.id))).orderBy(desc(notes.createdAt), desc(notes.id)).limit(50) : []
  return { ...base, nextBefore: found.length > 50 ? page[0]!.sequence : null,
    messages: page.map(message => ({ id: message.id, sequence: message.sequence, body: message.deletedAt ? '' : message.body,
      author: message.authorName, mine: message.authorId === access.actorId, version: message.version, createdAt: message.createdAt.toISOString(),
      edited: Boolean(message.editedAt), deleted: Boolean(message.deletedAt), files: files.filter(file => file.messageId === message.id).map(fileDTO),
      canModerate: !message.deletedAt && (access.owner || message.authorId === access.actorId && (message.authorKind === 'client' || access.staff)),
      canViewRevisions: access.owner || message.authorId === access.actorId && (message.authorKind === 'client' || access.staff) })),
    notes: privateNotes.reverse().map(note => ({ id: note.id, body: note.body, author: note.authorName, createdAt: note.createdAt.toISOString() })) }
}

async function limits(access: Access, threadId: string, tx: Transaction) {
  const [totals] = await tx.select({ value: sql<number>`(select count(*) from conversation_messages where workspace_id=${access.app.workspaceId}) + (select count(*) from conversation_notes where workspace_id=${access.app.workspaceId})` }).from(workspaces).where(eq(workspaces.id, access.app.workspaceId))
  const [threadCount] = await tx.select({ value: sql<number>`count(*)` }).from(messages).where(eq(messages.conversationId, threadId))
  if (Number(totals?.value) >= 100000 || Number(threadCount?.value) >= 2000) throw new RowWriteError('invalid', 'Достигнут лимит переписки. Свяжитесь с бизнесом другим способом.')
  const [recent] = await tx.select({ value: sql<number>`(select count(*) from conversation_messages where workspace_id=${access.app.workspaceId} and author_id=${access.actorId} and created_at>now()-interval '1 minute') + (select count(*) from conversation_notes where workspace_id=${access.app.workspaceId} and author_id=${access.actorId} and created_at>now()-interval '1 minute')` }).from(workspaces).where(eq(workspaces.id, access.app.workspaceId))
  if (Number(recent?.value) >= 20) throw new RowWriteError('invalid', 'Слишком много сообщений. Подождите минуту.')
}
export async function sendConversation(slug: string, tableId: string, rowId: string, input: { body: string; requestId: string; fileIds?: string[]; internal?: boolean }, business = false) {
  if (!input || typeof input !== 'object' || input.internal !== undefined && typeof input.internal !== 'boolean') throw new RowWriteError('invalid', 'Некорректное сообщение')
  const body = bodyText(input.body), fileIds = input.fileIds ?? []
  if (!validRequest(input.requestId) || !Array.isArray(fileIds) || fileIds.length > 5 || fileIds.some(id => !validReference(id)) || new Set(fileIds).size !== fileIds.length || (!body && !fileIds.length)) throw new RowWriteError('invalid', 'Напишите сообщение или приложите файл')
  const initial = await conversationAccess(slug, tableId, rowId, db, business)
  return writeRows(initial.app.workspaceId, async ({ tx, changed }) => {
    const access = await conversationAccess(slug, tableId, rowId, tx, business), thread = await threadFor(access, tx, true)
    if (input.internal && (!access.staff || fileIds.length)) throw denied()
    const target = input.internal ? notes : messages
    const [previous] = await tx.select({ id: target.id }).from(target).where(and(eq(target.conversationId, thread!.id), eq(target.authorId, access.actorId), eq(target.requestId, input.requestId.toLowerCase())))
    if (previous) return previous
    if (access.kind === 'general' && !access.app.communications?.enabled) throw new RowWriteError('invalid', 'Новые сообщения временно отключены. Свяжитесь с бизнесом другим способом.')
    if (thread!.closedAt && access.kind === 'general' && !access.staff && !input.internal) {
      await tx.update(conversations).set({ closedAt: null }).where(eq(conversations.id, thread!.id))
      thread!.closedAt = null
    }
    if (thread!.closedAt) throw new RowWriteError('invalid', 'Переписка закрыта. Ответственный может возобновить её.')
    await limits(access, thread!.id, tx)
    const common = { id: `msg_${newId('row').slice(4)}`, workspaceId: access.app.workspaceId, conversationId: thread!.id, authorId: access.actorId,
      authorName: access.authorName, body, requestId: input.requestId.toLowerCase() }
    if (input.internal) {
      await tx.insert(notes).values(common)
    } else {
      const files = fileIds.length ? await tx.select().from(attachments).where(and(eq(attachments.workspaceId, access.app.workspaceId), inArray(attachments.id, fileIds))).for('update') : []
      if (files.length !== fileIds.length || files.some(file => file.state !== 'ready' || file.scanStatus === 'infected' || file.scanStatus === 'pending' || file.uploadedBy !== access.uploadId || file.conversationId !== thread!.id || file.messageId || file.referenced || file.rowId || file.tableId || file.fieldId)) throw new RowWriteError('denied', 'Вложение недоступно. Загрузите файл заново.')
      await tx.insert(messages).values({ ...common, authorKind: access.authorKind })
      if (fileIds.length) await tx.update(attachments).set({ messageId: common.id, referenced: true }).where(inArray(attachments.id, fileIds))
    }
    if (access.kind === 'record') changed.add(tableId)
    return { id: common.id }
  })
}

export async function changeConversationMessage(slug: string, tableId: string, rowId: string, messageId: string, version: number, body: string | null, business = false) {
  if (!validReference(messageId) || !Number.isSafeInteger(version) || version < 0) throw denied()
  const text = body === null ? null : bodyText(body)
  if (text === '') throw new RowWriteError('invalid', 'Введите текст сообщения')
  const initial = await conversationAccess(slug, tableId, rowId, db, business)
  return writeRows(initial.app.workspaceId, async ({ tx, changed }) => {
    const access = await conversationAccess(slug, tableId, rowId, tx, business), thread = await threadFor(access, tx)
    if (!thread) throw denied()
    const [message] = await tx.select().from(messages).where(and(eq(messages.workspaceId, access.app.workspaceId), eq(messages.conversationId, thread.id), eq(messages.id, messageId))).for('update')
    const authored = message && message.authorId === access.actorId && (message.authorKind === 'client' || access.staff)
    if (!message || !authored && !access.owner) throw denied()
    if (text !== null && !authored) throw denied()
    if (message.version !== version || message.deletedAt) throw new RowWriteError('conflict', 'Сообщение изменилось. Обновите переписку.')
    if (version >= 20) throw new RowWriteError('invalid', 'Достигнут лимит правок сообщения')
    await tx.insert(revisions).values({ id: newId('change'), workspaceId: access.app.workspaceId, messageId, version: message.version,
      body: message.body, operation: text === null ? 'delete' : 'edit', actorId: access.actorId })
    await tx.update(messages).set({ body: text ?? '', version: version + 1, editedAt: new Date(), deletedAt: text === null ? new Date() : null }).where(eq(messages.id, messageId))
    if (access.kind === 'record') changed.add(tableId)
    return { id: messageId }
  })
}
export async function conversationMessageHistory(slug: string, tableId: string, rowId: string, messageId: string, business = false) {
  const access = await conversationAccess(slug, tableId, rowId, db, business), thread = await threadFor(access, db)
  if (!thread || !validReference(messageId)) throw denied()
  const [message] = await db.select().from(messages).where(and(eq(messages.conversationId, thread.id), eq(messages.id, messageId)))
  if (!message || !access.owner && (message.authorId !== access.actorId || message.authorKind !== 'client' && !access.staff)) throw denied()
  return (await db.select().from(revisions).where(eq(revisions.messageId, messageId)).orderBy(asc(revisions.version))).map(revision => ({ version: revision.version, body: revision.body, operation: revision.operation, createdAt: revision.createdAt.toISOString() }))
}
export async function closeConversation(slug: string, tableId: string, rowId: string, closed: boolean, business = false) {
  if (typeof closed !== 'boolean') throw denied()
  const initial = await conversationAccess(slug, tableId, rowId, db, business)
  return writeRows(initial.app.workspaceId, async ({ tx, changed }) => {
    const access = await conversationAccess(slug, tableId, rowId, tx, business), thread = await threadFor(access, tx)
    if (!thread || !access.manager) throw denied()
    await tx.update(conversations).set({ closedAt: closed ? new Date() : null }).where(eq(conversations.id, thread.id))
    if (access.kind === 'record') changed.add(tableId)
    return { id: thread.id }
  })
}
export async function prepareConversationUpload(slug: string, tableId: string, rowId: string, business = false) {
  const initial = await conversationAccess(slug, tableId, rowId, db, business)
  return writeRows(initial.app.workspaceId, async ({ tx }) => {
    const access = await conversationAccess(slug, tableId, rowId, tx, business), thread = await threadFor(access, tx, true)
    if (access.kind === 'general' && !access.app.communications?.enabled) throw new RowWriteError('invalid', 'Новые сообщения временно отключены. Свяжитесь с бизнесом другим способом.')
    // A client's next general message reopens the question; staging its file must not do so.
    if (thread!.closedAt && (access.kind !== 'general' || access.staff)) throw new RowWriteError('invalid', 'Переписка закрыта')
    await limits(access, thread!.id, tx)
    return { workspaceId: access.app.workspaceId, conversationId: thread!.id, uploadedBy: access.uploadId, origin: access.owner ? 'manual' as const : 'runtime' as const }
  })
}

/** Drop an unsent staged attachment from the composer so it does not linger until cleanup. */
export async function discardConversationUpload(slug: string, tableId: string, rowId: string, fileId: string, business = false) {
  if (!validReference(fileId)) throw denied()
  const initial = await conversationAccess(slug, tableId, rowId, db, business)
  const claimed = await writeRows(initial.app.workspaceId, async ({ tx }) => {
    const access = await conversationAccess(slug, tableId, rowId, tx, business), thread = await threadFor(access, tx)
    if (!thread) throw denied()
    const [file] = await tx.select().from(attachments).where(and(
      eq(attachments.id, fileId),
      eq(attachments.workspaceId, access.app.workspaceId),
      eq(attachments.conversationId, thread.id),
      eq(attachments.uploadedBy, access.uploadId),
      isNull(attachments.messageId),
      eq(attachments.referenced, false),
      isNull(attachments.tableId),
      isNull(attachments.rowId),
      isNull(attachments.fieldId),
    )).for('update')
    if (!file || file.state === 'deleting') throw denied()
    await tx.update(attachments).set({ state: 'deleting' }).where(eq(attachments.id, file.id))
    return { id: file.id, key: file.key, workspaceId: file.workspaceId }
  })
  await removeTrackedAttachment(claimed.id, claimed.workspaceId, claimed.key)
  return { id: claimed.id }
}
/** Pending files belong only to their uploader; attached files follow current conversation permissions. */
export async function canReadConversationFile(file: typeof attachments.$inferSelect, business = false) {
  if (!file.conversationId) return false
  const [thread] = await db.select().from(conversations).where(and(eq(conversations.id, file.conversationId), eq(conversations.workspaceId, file.workspaceId)))
  if (!thread) return false
  if (file.messageId) {
    const [message] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.id, file.messageId), eq(messages.conversationId, thread.id), eq(messages.workspaceId, file.workspaceId), isNull(messages.deletedAt)))
    if (!message) return false
  }
  const candidates = await db.select({ slug: apps.slug }).from(apps).where(eq(apps.workspaceId, file.workspaceId))
  for (const app of candidates) {
    try {
      const access = await conversationAccess(app.slug, thread.kind === 'general' ? GENERAL_CONVERSATION_TABLE : thread.tableId!, thread.kind === 'general' ? thread.customerId : thread.rowId!, db, business)
      if (access.kind === thread.kind && (access.module?.id ?? null) === thread.moduleId && access.customerId === thread.customerId && (file.messageId || file.uploadedBy === access.uploadId)) return true
    } catch (error) { if (!(error instanceof RowWriteError)) throw error }
  }
  return false
}
