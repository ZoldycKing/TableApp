import { db, fields } from '@tableapp/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { appReadPolicy, policyDigest } from '@/lib/app-read-policy'
import { permits, writableFields } from '@/lib/app-roles'
import { currentAppAccess } from '@/lib/app-session'
import { assertTableAllowed, loadApp } from '@/lib/app-write-access'
import { authorizeTable } from '@/lib/authorize'
import { canEdit } from '@/lib/session'
import { isOwnerField, rulesFor, stampOwner } from '@/lib/row-access'
import { MAX_SYNC_BODY_BYTES, syncPayloadSchema } from '@/lib/sync-protocol'
import { readSyncPage, validateSyncCursor } from '@/lib/sync-read'
import { applySyncMutation } from '@/lib/sync-write'
import { compileTableFormulas, computeDerivedRow } from '@tableapp/formula'
import { normalizeFieldOptions, systemRowData, type Field } from '@tableapp/schema'
import { loadRelatedRows } from '@/lib/queries'
import { memberTableFields,projectMemberData,tablePermission } from '@/lib/table-permissions'

export async function POST(request: Request) {
  let raw: unknown
  try {
    const reader = request.body?.getReader()
    if (!reader) throw new Error('empty')
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_SYNC_BODY_BYTES) {
        await reader.cancel()
        return NextResponse.json({ error: 'Слишком большой запрос' }, { status: 413 })
      }
      chunks.push(value)
    }
    raw = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return NextResponse.json({ error: 'Тело запроса не разобрано' }, { status: 400 })
  }
  if (raw && typeof raw === 'object' && 'mutations' in raw && Array.isArray(raw.mutations) && raw.mutations.length > 200) {
    return NextResponse.json({ error: 'За раз принимается не больше 200 правок' }, { status: 413 })
  }
  const parsed = syncPayloadSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Некорректный запрос синхронизации' }, { status: 400 })
  const { tableId, deviceId, appSlug, since, mutations } = parsed.data
  if (mutations.some((mutation) => mutation.tableId !== undefined && mutation.tableId !== tableId)) {
    return NextResponse.json({ error: 'Правки относятся к другой таблице' }, { status: 400 })
  }

  let actor: { id: string | null; kind: string; deviceId: string }
  let workspaceId: string
  let policy: Parameters<typeof readSyncPage>[3]
  let access: Parameters<typeof applySyncMutation>[3]
  if (appSlug) {
    const app = await loadApp(appSlug)
    if (!app || await assertTableAllowed(app, tableId)) return NextResponse.json({ error: 'Приложение или таблица недоступны' }, { status: 403 })
    const { visitor, viewer } = await currentAppAccess(app)
    if (!visitor.authenticated || !viewer) return NextResponse.json({ error: 'Нужен вход в приложение' }, { status: 403 })
    workspaceId = app.workspaceId
    actor = { id: viewer.id, kind: 'app_user', deviceId }
    policy = await appReadPolicy(app, tableId, visitor, viewer)
    const rules = rulesFor(app, tableId, visitor)
    const writable = { create: writableFields(app, tableId, visitor, 'create'), update: writableFields(app, tableId, visitor, 'update') }
    access = { guard: policy.canRead, may: (op) => app.inventory?.tables.movements !== tableId && permits(app, tableId, op, visitor),
      mayField: (op, id) => op === 'delete' || writable[op === 'create' ? 'create' : 'update'].has(id),
      stamp: (data) => stampOwner(rules, viewer, data), locked: (id) => isOwnerField(rules, id) }
  } else {
    const auth = await authorizeTable(tableId, false)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 })
    workspaceId = auth.member.workspaceId
    actor = { id: auth.member.userId, kind: 'member', deviceId }
    const allColumns = (await db.select().from(fields).where(eq(fields.tableId, tableId)))
      .map((field) => ({ ...field, options: normalizeFieldOptions(field.type as Field['type'], field.options) }) as unknown as Field)
    const columns=memberTableFields(allColumns,auth.member)
    const allowedFields=new Set(columns.map(field=>field.id))
    const related = await loadRelatedRows(columns, workspaceId,auth.member)
    const formulas = compileTableFormulas(columns)
    policy = { readable:{fields:allowedFields},fingerprint: policyDigest([auth.member.role,auth.member.tableAccess, columns,
      [...related].map(([id, records]) => [id, [...records]])]), canRead: () => true,
      project: (data, row) => projectMemberData(computeDerivedRow(systemRowData({ ...(row ?? { id: '' }), data }, columns), columns, related, formulas),columns) }
    access = { guard: () => true, may: () => tablePermission(auth.member,tableId)==='edit', mayField: (_op,id) => tablePermission(auth.member,tableId)==='edit'&&allowedFields.has(id),
      stamp: (data) => data, locked: () => false }
  }
  const scope = policyDigest([workspaceId, tableId, appSlug ?? null, actor])
  // Validate the cursor before applying any writes from a malformed request.
  if (mutations.length) {
    try { await validateSyncCursor(workspaceId, tableId, scope, since) }
    catch { return NextResponse.json({ error: 'Курсор синхронизации недействителен. Начните заново' }, { status: 400 }) }
  }
  const results = []
  for (const mutation of mutations) results.push(await applySyncMutation(mutation, tableId, actor, access))
  // A continuation keeps its original upper bound. New writes arrive in the
  // following cycle; an initial request includes the writes just committed.
  let page: Awaited<ReturnType<typeof readSyncPage>>
  try { page = await readSyncPage(workspaceId, tableId, scope, policy, since) }
  catch (error) {
    if (mutations.length) throw error // A failed response after committed writes is retryable, not a bad request.
    return NextResponse.json({ error: 'Курсор синхронизации недействителен. Начните заново' }, { status: 400 })
  }
  return NextResponse.json({ ...page,
    applied: results.filter((result) => result.status === 'applied' || result.status === 'duplicate').map((result) => result.id),
    rejected: results.filter((result) => result.status === 'conflict' || result.status === 'dropped').map((result) => {
      // Never include a conflict value if this field is no longer readable.
      const mutation = mutations.find((item) => item.id === result.id)
      const readable = !('readable' in policy) || (mutation?.op === 'update' && (policy as Awaited<ReturnType<typeof appReadPolicy>>).readable.fields.has(mutation.fieldId))
      return { ...result, current: readable ? result.current : undefined }
    }),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
