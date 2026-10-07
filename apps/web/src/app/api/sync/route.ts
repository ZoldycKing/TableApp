import {
  db,
  fields as fieldsTable,
  mutations as mutationsTable,
  rowChanges,
  rows as rowsTable,
} from '@tableapp/db'
import { newId, normalizeFieldOptions, parseCellValue, positionBetween, type Field } from '@tableapp/schema'
import { compile, computeRow, type Compiled } from '@tableapp/formula'
import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mayAddRowTo, noteRemoved, workspaceOfTable } from '@/lib/limits'
import { explainToCustomer } from '@tableapp/schema'
import { permits, writableFields } from '@/lib/app-roles'
import { currentAppAccess } from '@/lib/app-session'
import { assertTableAllowed, loadApp } from '@/lib/app-write-access'
import { authorizeTable } from '@/lib/authorize'
import { canAccessRow, isOwnerField, rulesFor, stampOwner } from '@/lib/row-access'
import { decideMutation, MISSING_ROW, type Decision, type Mutation, type RowState } from '@/lib/sync-merge'

/**
 * Приём очереди правок с устройства.
 *
 * Отдельный адрес, а не Server Action: у экшена идентификатор привязан
 * к сборке, и очередь, пролежавшая офлайн через выкатку, стала бы
 * недействительной — ровно в тот момент, когда она нужнее всего.
 *
 * Возвращает три вещи сразу: что применилось, что не применилось и почему,
 * и свежие строки таблицы. Иначе человек разобрал бы спорную ячейку
 * и остался смотреть на картину часовой давности.
 */

const MAX_BATCH = 200

type Result = { id: string; status: Decision['status']; reason?: string; current?: unknown }

type Actor = { id: string | null; kind: string; deviceId: string }

/** Можно ли этому человеку трогать конкретную строку. */
type RowGuard = (data: Record<string, unknown>) => boolean

type Access =
  | {
      ok: true
      actor: Actor
      guard: RowGuard
      /**
       * Разрешено ли это действие роли. Проверяется на каждую правку, а не
       * один раз на пачку: право создавать заявку не даёт права править чужие.
       */
      may: (op: Mutation['op']) => boolean
      /** Можно ли роли записать это поле: право выводится из форм приложения. */
      mayField: (op: Mutation['op'], fieldId: string) => boolean
      /** Проставить владельца новой строки — иначе автор её не увидит. */
      stamp: (data: Record<string, unknown>) => Record<string, unknown>
      /** Поле владельца правками с устройства не меняется: хозяина не сменить. */
      locked: (fieldId: string) => boolean
    }
  | { ok: false; error: string }

const ALLOW_ALL: RowGuard = () => true
const ANY_OP = () => true
const NO_STAMP = (data: Record<string, unknown>) => data
const NOTHING_LOCKED = () => false

async function memberAccess(tableId: string, deviceId: string): Promise<Access> {
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return { ok: false, error: auth.error }
  return {
    ok: true,
    actor: { id: auth.member.userId, kind: 'member', deviceId },
    guard: ALLOW_ALL,
    may: ANY_OP,
    mayField: ANY_OP,
    stamp: NO_STAMP,
    locked: NOTHING_LOCKED,
  }
}

/**
 * Сотрудник приложения. Проверяем три вещи: приложение опубликовано, таблица
 * входит в его экраны, и строка доступна именно этому человеку — правило
 * на строки то же самое, что при обычной работе в приложении.
 */
async function staffAccess(slug: string, tableId: string, deviceId: string): Promise<Access> {
  const app = await loadApp(slug)
  if (!app) return { ok: false, error: 'Приложение не опубликовано' }

  const { visitor, viewer } = await currentAppAccess(app)
  /*
   * Очередь отложенных правок — такой же путь записи, как форма на экране,
   * и права здесь те же. Проверяем и вход в очередь, и каждую правку по
   * отдельности: гость с открытой формой приёма заявок имеет право создать
   * запись — и ровно его, а не право менять чужие.
   */
  const may = (op: Mutation['op']) => permits(app, tableId, op, visitor)
  const writable = {
    create: writableFields(app, tableId, visitor, 'create'),
    update: writableFields(app, tableId, visitor, 'update'),
  }
  const mayField = (op: Mutation['op'], fieldId: string) =>
    op === 'delete' ? true : writable[op === 'create' ? 'create' : 'update'].has(fieldId)
  if (!may('create') && !may('update') && !may('delete')) {
    return {
      ok: false,
      error: visitor.authenticated ? 'Это действие вам недоступно' : 'Нужен вход в приложение',
    }
  }

  const rules = rulesFor(app, tableId, visitor)
  return {
    ok: true,
    actor: { id: viewer?.id ?? null, kind: 'app_user', deviceId },
    may,
    mayField,
    guard: (data) => canAccessRow(rules, viewer, data),
    stamp: (data) => stampOwner(rules, viewer, data),
    locked: (fieldId) => isOwnerField(rules, fieldId),
  }
}

/** Поля таблицы в разобранном виде: без них нечем проверять правки. */
async function loadFields(tableId: string): Promise<Field[]> {
  const rows = await db
    .select()
    .from(fieldsTable)
    .where(eq(fieldsTable.tableId, tableId))
    .orderBy(asc(fieldsTable.position))

  // Тем же способом, что и остальной код: строгий разбор схемой здесь не
  // подходит — настройки в базе могли быть записаны до появления умолчаний,
  // и поле молча исчезло бы из списка, а правка в него выглядела бы как
  // «поле удалили».
  return rows.map(
    (row) => ({ ...row, options: normalizeFieldOptions(row.type as Field['type'], row.options) }) as unknown as Field,
  )
}

function compileFormulas(fields: readonly Field[]): Map<string, Compiled> {
  const compiled = new Map<string, Compiled>()
  for (const field of fields) {
    if (field.type !== 'formula' || !field.options.expression.trim()) continue
    try {
      compiled.set(field.id, compile(field.options.expression, fields))
    } catch {
      // Сломанная формула не мешает применить остальные правки.
    }
  }
  return compiled
}

async function readRow(rowId: string, tableId: string): Promise<RowState> {
  const [found] = await db
    .select()
    .from(rowsTable)
    .where(and(eq(rowsTable.id, rowId), eq(rowsTable.tableId, tableId)))
    .limit(1)

  if (!found) return MISSING_ROW
  return {
    exists: true,
    deleted: found.deletedAt !== null,
    version: found.version,
    data: found.data as Record<string, unknown>,
  }
}

/**
 * Применение одной правки. Чтение текущего значения и запись — в одной
 * транзакции: между «сравнили» и «записали» иначе успеет вклиниться чужая
 * правка, и мы затрём её, формально соблюдя правило.
 */
async function applyOne(
  mutation: Mutation,
  tableId: string,
  fields: Field[],
  compiled: Map<string, Compiled>,
  actor: Actor,
  access: {
    guard: RowGuard
    may: (op: Mutation['op']) => boolean
    mayField: (op: Mutation['op'], fieldId: string) => boolean
    stamp: (data: Record<string, unknown>) => Record<string, unknown>
    locked: (fieldId: string) => boolean
  },
): Promise<Result> {
  const { guard, may, mayField, stamp, locked } = access
  return db.transaction(async (tx) => {
    const [applied] = await tx
      .select({ id: mutationsTable.id, status: mutationsTable.status, reason: mutationsTable.reason })
      .from(mutationsTable)
      .where(eq(mutationsTable.id, mutation.id))
      .limit(1)

    if (applied) {
      return { id: mutation.id, status: applied.status as Decision['status'], reason: applied.reason ?? undefined }
    }

    // Поле за полем: право создать заявку не даёт права проставить статус.
    const fieldsOfMutation =
      mutation.op === 'update'
        ? (mutation.fieldId ? [mutation.fieldId] : [])
        : Object.keys((mutation.next as Record<string, unknown> | undefined) ?? {})
    const deniedField = fieldsOfMutation.find((fieldId) => !mayField(mutation.op, fieldId))

    if (!may(mutation.op) || deniedField) {
      const reason = 'Это действие вам недоступно'
      await tx.insert(mutationsTable).values({
        id: mutation.id,
        deviceId: actor.deviceId,
        actorId: actor.id,
        actorKind: actor.kind,
        tableId,
        rowId: mutation.rowId,
        fieldId: mutation.fieldId ?? null,
        op: mutation.op,
        base: mutation.base ?? null,
        next: mutation.next ?? null,
        status: 'dropped',
        reason,
      })
      return { id: mutation.id, status: 'dropped' as const, reason }
    }

    const row = await readRow(mutation.rowId, tableId)

    // Строка, видимая час назад, могла уйти из доступа — проверяем сейчас.
    if (row.exists && !guard(row.data)) {
      await tx.insert(mutationsTable).values({
        id: mutation.id,
        deviceId: actor.deviceId,
        actorId: actor.id,
        actorKind: actor.kind,
        tableId,
        rowId: mutation.rowId,
        fieldId: mutation.fieldId ?? null,
        op: mutation.op,
        base: mutation.base ?? null,
        next: mutation.next ?? null,
        status: 'dropped',
        reason: 'Эта запись вам больше не доступна',
      })
      return { id: mutation.id, status: 'dropped' as const, reason: 'Эта запись вам больше не доступна' }
    }

    if (mutation.op === 'update' && mutation.fieldId && locked(mutation.fieldId)) {
      await tx.insert(mutationsTable).values({
        id: mutation.id,
        deviceId: actor.deviceId,
        actorId: actor.id,
        actorKind: actor.kind,
        tableId,
        rowId: mutation.rowId,
        fieldId: mutation.fieldId,
        op: mutation.op,
        base: mutation.base ?? null,
        next: mutation.next ?? null,
        status: 'dropped',
        reason: 'Владельца записи сменить нельзя',
      })
      return { id: mutation.id, status: 'dropped' as const, reason: 'Владельца записи сменить нельзя' }
    }

    const decision = decideMutation(mutation, row, fields, false)

    if (decision.status === 'applied') {
      if (mutation.op === 'create') {
        /*
         * Место проверяем и здесь: очередь приезжает с устройства, которое
         * работало без связи, и за это время потолок мог кончиться. Правка
         * отклоняется поштучно и с причиной — так же, как при конфликте:
         * человек увидит, что именно не доехало, а не потеряет всё молча.
         */
        /*
         * Очередь приезжает с устройства, которое работало без связи, и за
         * это время потолок мог кончиться. Правка отклоняется поштучно
         * и с причиной — так же, как при конфликте: человек увидит, что
         * именно не доехало, а не потеряет всё молча.
         */
        const runtime = actor.kind !== 'member'
        const allowed = await mayAddRowTo(tableId, runtime ? 'runtime' : 'manual')
        if (!allowed.ok) {
          const reason = runtime ? explainToCustomer() : allowed.error
          await tx.insert(mutationsTable).values({
            id: mutation.id,
            deviceId: actor.deviceId,
            actorId: actor.id,
            actorKind: actor.kind,
            tableId,
            rowId: mutation.rowId,
            fieldId: null,
            op: mutation.op,
            base: mutation.base ?? null,
            next: mutation.next ?? null,
            status: 'dropped',
            reason,
          })
          return { id: mutation.id, status: 'dropped' as const, reason }
        }

        const [last] = await tx
          .select({ position: rowsTable.position })
          .from(rowsTable)
          .where(and(eq(rowsTable.tableId, tableId), isNull(rowsTable.deletedAt)))
          .orderBy(desc(rowsTable.position))
          .limit(1)

        const clean: Record<string, unknown> = {}
        for (const field of fields) {
          const incoming = (mutation.next as Record<string, unknown> | undefined)?.[field.id]
          if (incoming === undefined) continue
          try {
            clean[field.id] = parseCellValue(field, incoming)
          } catch {
            // Значение не подходит типу — строка создаётся без него.
          }
        }

        await tx.insert(rowsTable).values({
          id: mutation.rowId,
          tableId,
          // Владелец проставляется сервером: иначе созданную офлайн строку
          // её же автор потом не увидит — правило на строки её отфильтрует.
          data: computeRow(stamp(clean), compiled),
          position: positionBetween(last?.position ?? null, null),
        })
      } else if (mutation.op === 'delete') {
        await tx.update(rowsTable).set({ deletedAt: new Date() }).where(eq(rowsTable.id, mutation.rowId))
        const owner = await workspaceOfTable(tableId)
        if (owner) await noteRemoved(owner, 'rows', 1, tx)
      } else if (decision.value !== undefined || mutation.fieldId) {
        const after = computeRow({ ...row.data, [mutation.fieldId!]: decision.value }, compiled)
        await tx
          .update(rowsTable)
          .set({ data: after, version: sql`${rowsTable.version} + 1`, updatedAt: new Date(), sample: false })
          .where(eq(rowsTable.id, mutation.rowId))
      }

      await tx.insert(rowChanges).values({
        id: newId('change'),
        tableId,
        rowId: mutation.rowId,
        op: mutation.op,
        // Пометка «из офлайна» нужна в журнале: иначе через месяц непонятно,
        // почему значение изменилось задним числом.
        before: mutation.op === 'create' ? null : { [mutation.fieldId ?? 'row']: mutation.base ?? null },
        after: mutation.op === 'delete' ? null : { [mutation.fieldId ?? 'row']: decision.value ?? mutation.next ?? null },
        actorId: actor.id,
        actorKind: actor.kind,
      })
    }

    await tx.insert(mutationsTable).values({
      id: mutation.id,
      deviceId: actor.deviceId,
      actorId: actor.id,
      actorKind: actor.kind,
      tableId,
      rowId: mutation.rowId,
      fieldId: mutation.fieldId ?? null,
      op: mutation.op,
      base: mutation.base ?? null,
      next: mutation.next ?? null,
      status: decision.status,
      reason: 'reason' in decision ? decision.reason : null,
      clientAt: mutation.clientAt ? new Date(mutation.clientAt) : null,
    })

    return {
      id: mutation.id,
      status: decision.status,
      reason: 'reason' in decision ? decision.reason : undefined,
      current: 'current' in decision ? decision.current : undefined,
    }
  })
}

export async function POST(request: Request) {
  let payload: {
    tableId?: string
    appSlug?: string
    deviceId?: string
    since?: string
    mutations?: Mutation[]
  }

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Тело запроса не разобрано' }, { status: 400 })
  }

  const { tableId, deviceId, since } = payload
  const incoming = Array.isArray(payload.mutations) ? payload.mutations : []

  if (!tableId || !deviceId) {
    return NextResponse.json({ error: 'Не указана таблица или устройство' }, { status: 400 })
  }
  if (incoming.length > MAX_BATCH) {
    // Очередь после часа офлайна бывает длинной: пусть устройство шлёт частями,
    // иначе одна транзакция держит блокировки слишком долго.
    return NextResponse.json({ error: `За раз принимается не больше ${MAX_BATCH} правок` }, { status: 413 })
  }

  /*
   * Два контура. Сотрудник приходит с адресом приложения: тогда права
   * считаются по приложению и правилам на строки, а не по членству
   * в пространстве. Слияние ниже — общее, расходится только вход.
   */
  const access = payload.appSlug
    ? await staffAccess(payload.appSlug, tableId, deviceId)
    : await memberAccess(tableId, deviceId)

  if (!access.ok) return NextResponse.json({ error: access.error }, { status: 403 })

  const fields = await loadFields(tableId)
  const compiled = compileFormulas(fields)
  const { actor, guard } = access

  const results: Result[] = []
  // По порядку устройства: создание строки должно примениться раньше правок в неё.
  for (const mutation of incoming) {
    results.push(await applyOne(mutation, tableId, fields, compiled, actor, access))
  }

  /*
   * Свежие строки тем же кругом. Курсор — время последнего изменения,
   * которое устройство уже видело: отдаём всё, что поменялось после него,
   * включая правки других людей и то, что мы только что применили сами.
   */
  const cursor = since ? new Date(since) : null
  const fresh = await db
    .select()
    .from(rowsTable)
    .where(
      cursor
        ? and(eq(rowsTable.tableId, tableId), gt(rowsTable.updatedAt, cursor))
        : eq(rowsTable.tableId, tableId),
    )
    .orderBy(asc(rowsTable.position))
    .limit(500)

  return NextResponse.json({
    applied: results.filter((item) => item.status === 'applied' || item.status === 'duplicate').map((item) => item.id),
    rejected: results.filter((item) => item.status === 'conflict' || item.status === 'dropped'),
    /*
     * Ответ проходит через ту же проверку строк, что и запись. Иначе
     * синхронизация стала бы обходным путём к чужим данным: сотрудник,
     * который в приложении видит только свои заявки, получил бы здесь все.
     * Недоступную строку отдаём как удалённую — устройство уберёт её у себя,
     * а содержимого не узнает.
     */
    rows: fresh.map((row) => {
      const visible = row.deletedAt === null && guard(row.data as Record<string, unknown>)
      if (!visible) return { id: row.id, data: {}, position: row.position, version: row.version, deleted: true }
      return {
        id: row.id,
        data: row.data,
        position: row.position,
        version: row.version,
        deleted: false,
      }
    }),
    cursor: new Date().toISOString(),
  })
}
