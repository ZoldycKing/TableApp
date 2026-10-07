import {
  db,
  fields as fieldsTable,
  importRuns,
  rowChanges,
  rows as rowsTable,
  tables,
  views as viewsTable,
} from '@tableapp/db'
import { SHEET_LIMITS } from '@tableapp/import'
import type { Field, UsageKind } from '@tableapp/schema'
import {
  defaultViewConfig,
  newId,
  normalizeFieldOptions,
  parseCellValue,
  positionBetween,
  positionSequence,
} from '@tableapp/schema'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { limitRefusal, reserveInTx } from './limits'
import { mapRow, resolvePairs } from './import-mapping'
import { noteBulkChange, recountWorkspace } from './usage'

/**
 * Запись одного листа в базу.
 *
 * Отдельно от серверного действия намеренно. Здесь всё, что должно быть
 * верным и под нагрузкой: единица импорта — лист целиком, повтор не задваивает
 * данные, место в тарифе занимается до записи и возвращается, если запись
 * не состоялась. Проверить это кликами нельзя — нужны два одновременных
 * вызова, а `'use server'` файл в тест не затащить: он тянет за собой
 * `revalidatePath` и куки запроса.
 *
 * Поэтому права остаются в действии, а сюда приходит уже проверенный
 * участник. Принадлежность таблицы пространству проверяется и здесь:
 * идентификатор приходит из браузера, и доверять ему нельзя даже после
 * проверки уровнем выше.
 */

export type Destination =
  | { kind: 'new'; name: string }
  | { kind: 'existing'; tableId: string; mapping: Record<string, string> }

export type SheetOutcome =
  | {
      ok: true
      tableId: string | null
      tableName: string
      added: number
      /** Этот лист уже был импортирован этим же запуском: повтор ничего не писал. */
      repeat: boolean
    }
  | { ok: false; error: string }

export type ImportSheetInput = {
  /** Один запуск импорта. Ключ приходит от клиента и живёт, пока открыт экран. */
  runId: string
  /** Имя листа книги или файла CSV: вторая половина ключа повтора. */
  sheet: string
  fields: Field[]
  rows: Record<string, unknown>[]
  destination: Destination
}

/** Кто пишет. Права проверены уровнем выше, здесь они уже факт. */
export type Importer = { workspaceId: string; userId: string }

/**
 * Записать один лист.
 *
 * Лист — единица всего: он импортируется целиком либо не импортируется вовсе.
 * Половина листа не остаётся ни при ошибке (транзакция), ни при отказе
 * по тарифу (место занимается до записи и возвращается при откате), ни при
 * повторе (ключ запуска).
 */
export async function runSheetImport(input: ImportSheetInput, by: Importer): Promise<SheetOutcome> {
  const runId = input.runId?.trim()
  const sheet = input.sheet?.trim()
  if (!runId || !sheet) return { ok: false, error: 'Не хватает ключа запуска импорта' }

  /*
   * Потолки листа проверяются и здесь, а не только при чтении книги: строки
   * приходят из браузера, и между чтением и записью с ними могло случиться
   * что угодно. Предпросмотр — не разрешение.
   */
  if (input.fields.length === 0) return { ok: false, error: 'В листе нет колонок' }
  if (input.rows.length === 0) return { ok: false, error: 'В листе нет строк' }
  if (input.fields.length > SHEET_LIMITS.columns) {
    return { ok: false, error: `Колонок больше предела: ${input.fields.length} из ${SHEET_LIMITS.columns}` }
  }
  if (input.rows.length > SHEET_LIMITS.rows) {
    return { ok: false, error: `Строк больше предела: ${input.rows.length} из ${SHEET_LIMITS.rows}` }
  }

  return input.destination.kind === 'new'
    ? createTable({ ...input, runId, sheet, name: input.destination.name }, by)
    : appendRows({ ...input, runId, sheet, ...input.destination }, by)
}

/**
 * Этот лист уже импортирован этим запуском.
 *
 * Бросается внутри транзакции, чтобы её откатить: к моменту проверки ключа
 * таблица и строки уже записаны, и оставить их значило бы сделать ровно то,
 * от чего ключ и защищает, — второй комплект данных.
 */
class AlreadyImported extends Error {}

type Reservation = { resource: UsageKind; amount: number }

/** Лист не поместился в тариф: бросается внутри транзакции, чтобы её откатить. */
class NoRoom extends Error {
  constructor(readonly resource: UsageKind, readonly amount: number) {
    super('нет места в тарифе')
  }
}

/**
 * Записать лист, заняв место в тарифе той же транзакцией.
 *
 * Место и данные держит одна транзакция: не записалось — не занято, и второй
 * импорт, пришедший одновременно, ждёт на замке счётчика и видит правду.
 * Раньше место занималось отдельным запросом до записи, и на границе тарифа
 * два одновременных импорта проезжали оба: пересчёт у второго насчитывал
 * ещё не дописанные строки первого и затирал его бронь.
 *
 * Пересчёт идёт **между** попытками, а не под замком: позванный изнутри
 * транзакции, он ушёл бы отдельным соединением и дождался бы нашей же
 * незакрытой транзакции. Поэтому попытки две: первая верит снимку, вторая —
 * пересчитанной правде. Так лечится и расхождение счётчика: уехавший вверх
 * снимок не блокирует работу навсегда.
 */
async function withRoom<T>(
  workspaceId: string,
  wanted: readonly Reservation[],
  write: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  let last: NoRoom | null = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const value = await db.transaction(async (tx) => {
        for (const item of wanted) {
          const room = await reserveInTx(tx, {
            workspaceId,
            resource: item.resource,
            amount: item.amount,
          })
          if (!room) throw new NoRoom(item.resource, item.amount)
        }
        return write(tx)
      })
      return { ok: true, value }
    } catch (error) {
      if (!(error instanceof NoRoom)) throw error
      last = error
      // Снимок мог разойтись с правдой: пересчитываем начисто и пробуем ещё раз.
      if (attempt === 0) await recountWorkspace(workspaceId)
    }
  }

  const refusal = await limitRefusal(workspaceId, last!.resource, last!.amount)
  return { ok: false, error: refusal.message }
}

/** Ключ повтора: он же ответ на «мы это уже делали?». */
async function claim(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  values: {
    workspaceId: string
    runId: string
    sheet: string
    tableId: string
    tableName: string
    mode: 'create' | 'append'
    added: number
    actorId: string
  },
): Promise<boolean> {
  const done = await tx
    .insert(importRuns)
    .values({ id: newId('import'), ...values })
    .onConflictDoNothing({ target: [importRuns.workspaceId, importRuns.runId, importRuns.sheet] })
    .returning({ id: importRuns.id })
  return done.length > 0
}

/** Что было записано в прошлый раз: ответ на повтор. */
async function previous(workspaceId: string, runId: string, sheet: string): Promise<SheetOutcome> {
  const [done] = await db
    .select()
    .from(importRuns)
    .where(
      and(
        eq(importRuns.workspaceId, workspaceId),
        eq(importRuns.runId, runId),
        eq(importRuns.sheet, sheet),
      ),
    )
    .limit(1)

  if (!done) return { ok: false, error: 'Повтор не нашёл прошлой записи — попробуйте ещё раз' }
  return { ok: true, tableId: done.tableId, tableName: done.tableName, added: done.added, repeat: true }
}

async function createTable(
  input: ImportSheetInput & { runId: string; sheet: string; name: string },
  by: Importer,
): Promise<SheetOutcome> {
  const workspaceId = by.workspaceId
  const name = input.name.trim() || input.sheet.trim() || 'Без названия'

  const tableId = newId('table')
  const fieldPositions = positionSequence(input.fields.length)
  const preparedFields = input.fields.map((field, index) => ({
    id: newId('field'),
    tableId,
    name: field.name.trim() || `Колонка ${index + 1}`,
    type: field.type,
    options: field.options,
    description: null,
    position: fieldPositions[index]!,
  }))

  // Идентификаторы полей перевыпускаются на сервере, поэтому значения строк
  // переносятся по позиции колонки, а не по присланному id.
  const idByOldId = new Map(input.fields.map((field, index) => [field.id, preparedFields[index]!.id]))
  const rowPositions = positionSequence(input.rows.length)
  const preparedRows = input.rows.map((data, index) => {
    const mapped: Record<string, unknown> = {}
    for (const [oldId, value] of Object.entries(data)) {
      const newFieldId = idByOldId.get(oldId)
      if (!newFieldId) continue
      const field = preparedFields.find((item) => item.id === newFieldId)!
      try {
        mapped[newFieldId] = parseCellValue(field as unknown as Field, value)
      } catch {
        mapped[newFieldId] = null
      }
    }
    return { id: newId('row'), tableId, data: mapped, position: rowPositions[index]! }
  })

  /*
   * И таблица, и строки сразу: наполовину загруженный файл хуже
   * незагруженного, потому что человек не знает, что доехало, а повторная
   * загрузка задваивает строки.
   */
  const wanted: Reservation[] = [
    { resource: 'tables', amount: 1 },
    { resource: 'rows', amount: preparedRows.length },
  ]

  let repeat = false
  try {
    const done = await withRoom(workspaceId, wanted, async (tx) => {
      await tx.insert(tables).values({
        id: tableId,
        workspaceId,
        name,
        icon: 'table',
        position: positionBetween(null, null),
        primaryFieldId: preparedFields[0]?.id ?? null,
      })
      await tx.insert(fieldsTable).values(preparedFields)
      await tx.insert(rowsTable).values(preparedRows)
      await tx.insert(viewsTable).values({
        id: newId('view'),
        tableId,
        name: 'Все записи',
        type: 'grid',
        config: defaultViewConfig('grid', newId('filter')),
        position: positionBetween(null, null),
      })

      /*
       * Ключ запуска ставится последним: он ссылается на таблицу, а её
       * до этой строки ещё не существует. Порядок на защиту не влияет —
       * второй запрос с тем же ключом дождётся первого на уникальном индексе,
       * получит «уже есть» и уйдёт в откат вместе со всем, что успел записать.
       */
      const mine = await claim(tx, {
        workspaceId,
        runId: input.runId,
        sheet: input.sheet,
        tableId,
        tableName: name,
        mode: 'create',
        added: preparedRows.length,
        actorId: by.userId,
      })
      if (!mine) throw new AlreadyImported()
    })
    if (!done.ok) return { ok: false, error: done.error }
  } catch (error) {
    if (error instanceof AlreadyImported) repeat = true
    else throw error
  }

  if (repeat) return previous(workspaceId, input.runId, input.sheet)

  await noteBulkChange(workspaceId)
  return { ok: true, tableId, tableName: name, added: preparedRows.length, repeat: false }
}

async function appendRows(
  input: ImportSheetInput & {
    runId: string
    sheet: string
    tableId: string
    mapping: Record<string, string>
  },
  by: Importer,
): Promise<SheetOutcome> {
  const workspaceId = by.workspaceId

  // Чужая таблица: идентификатор приходит из браузера, и проверка уровнем
  // выше не повод верить ему здесь.
  const [table] = await db
    .select({ name: tables.name, workspaceId: tables.workspaceId })
    .from(tables)
    .where(eq(tables.id, input.tableId))
    .limit(1)
  if (!table || table.workspaceId !== workspaceId) return { ok: false, error: 'Таблица не найдена' }

  const targetRows = await db.select().from(fieldsTable).where(eq(fieldsTable.tableId, input.tableId))
  const targets = new Map(
    targetRows.map((field) => [
      field.id,
      { ...field, options: normalizeFieldOptions(field.type as Field['type'], field.options) } as unknown as Field,
    ]),
  )

  const pairs = resolvePairs({ sourceFields: input.fields, targetFields: targets, mapping: input.mapping })
  if (pairs.length === 0) return { ok: false, error: 'Не выбрана ни одна колонка' }

  const [last] = await db
    .select({ position: rowsTable.position })
    .from(rowsTable)
    .where(and(eq(rowsTable.tableId, input.tableId), isNull(rowsTable.deletedAt)))
    .orderBy(desc(rowsTable.position))
    .limit(1)

  let position: string | null = last?.position ?? null
  const prepared = input.rows.map((source) => {
    position = positionBetween(position, null)
    return { id: newId('row'), tableId: input.tableId, data: mapRow(source, pairs), position }
  })

  const wanted: Reservation[] = [{ resource: 'rows', amount: prepared.length }]

  let repeat = false
  try {
    const done = await withRoom(workspaceId, wanted, async (tx) => {
      const mine = await claim(tx, {
        workspaceId,
        runId: input.runId,
        sheet: input.sheet,
        tableId: input.tableId,
        tableName: table.name,
        mode: 'append',
        added: prepared.length,
        actorId: by.userId,
      })
      if (!mine) {
        repeat = true
        return
      }

      await tx.insert(rowsTable).values(prepared)
      await tx.insert(rowChanges).values(
        prepared.map((row) => ({
          id: newId('change'),
          tableId: input.tableId,
          rowId: row.id,
          op: 'create',
          actorId: by.userId,
          actorKind: 'member',
          after: row.data,
        })),
      )
    })
    if (!done.ok) return { ok: false, error: done.error }
  } catch (error) {
    throw error
  }

  if (repeat) return previous(workspaceId, input.runId, input.sheet)

  // Импорт меняет расход пачкой: снимок пересчитываем сразу, не дожидаясь,
  // пока кто-нибудь откроет страницу расхода.
  await noteBulkChange(workspaceId)
  return { ok: true, tableId: input.tableId, tableName: table.name, added: prepared.length, repeat: false }
}
