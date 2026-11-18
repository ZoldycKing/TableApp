import { apps, db, fields, rows as rowsTable, tables } from '@tableapp/db'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Transaction } from './db-transaction'
import { workspaceOfTable } from './limits'

/**
 * Что уходит вместе с выпуском.
 *
 * Выпуск и его списания — одна запись учёта, разложенная по двум таблицам.
 * Удалить выпуск и оставить списания значит получить движения, у которых
 * нет основания: материалы списаны неизвестно подо что, а остаток показывает
 * расход, которого не было. Обратный порядок не лучше — выпуск без списаний.
 *
 * Поэтому удаление выпуска подхватывает его движения, и делает это **на общем
 * пути удаления строки**, а не в одном приложении: строку удаляют и из
 * таблицы, и из приложения, и обе двери должны вести к одному результату.
 *
 * Модуль намеренно узкий: он знает про производственный учёт по имени, потому
 * что общего способа описывать зависимые записи в Scatta пока нет. Появится
 * такой способ — это станет его частным случаем.
 */

type ProductionShape = {
  tables?: { production?: unknown; movements?: unknown }
  movement?: { run?: unknown }
}

/** Настройка производства из приложения: читается мягко, чужие поля не мешают. */
function configOf(value: unknown): { production: string; movements: string; run: string } | null {
  if (!value || typeof value !== 'object') return null
  const shape = value as { production?: ProductionShape }
  const production = shape.production
  if (!production) return null

  const runTable = production.tables?.production
  const movementsTable = production.tables?.movements
  const runField = production.movement?.run
  if (typeof runTable !== 'string' || typeof movementsTable !== 'string' || typeof runField !== 'string') {
    return null
  }
  return { production: runTable, movements: movementsTable, run: runField }
}

export type DependentRows = {
  tableId: string
  rows: { id: string; data: Record<string, unknown> }[]
}

/**
 * Строки, которые должны уйти вместе с этой.
 *
 * Пусто — обычный случай: почти все таблицы ни от чего не зависят, и лишнего
 * запроса тут не делается. Поиск идёт по приложениям того же пространства:
 * настройка производства лежит рядом с приложением, а не в коде, потому что
 * таблицы и колонки у каждого свои.
 */
export async function dependentRows(tableId: string, rowId: string, tx?: Transaction, lock = true): Promise<DependentRows | null> {
  const runner = tx ?? db
  const workspaceId = await workspaceOfTable(tableId, runner)
  if (!workspaceId) return null

  const found = await runner
    .select({ draft: apps.draft, published: apps.published })
    .from(apps)
    .where(eq(apps.workspaceId, workspaceId))

  let config: { production: string; movements: string; run: string } | null = null
  for (const record of found) {
    /*
     * Смотрим и опубликованное, и черновик. Приложение могли ещё не
     * опубликовать, но таблицы шаблона уже живут и строки в них уже пишутся —
     * связь между выпуском и списаниями от публикации не зависит.
     */
    const candidate = configOf(record.published) ?? configOf(record.draft)
    if (candidate && candidate.production === tableId) {
      const [owned] = await runner.select({ id: fields.id }).from(fields)
        .innerJoin(tables, eq(fields.tableId, tables.id))
        .where(and(eq(tables.workspaceId, workspaceId), eq(tables.id, candidate.movements), eq(fields.id, candidate.run))).limit(1)
      if (!owned) continue
      config = candidate
      break
    }
  }
  if (!config) return null

  /*
   * Отбор делает база: связь хранится массивом идентификаторов, и `@>`
   * находит строки, в чьём массиве есть нужный. Прочитать весь журнал
   * и отфильтровать его в памяти было бы верно ровно до первого склада,
   * где движений десятки тысяч.
   */
  const query = runner
    .select({ id: rowsTable.id, data: rowsTable.data })
    .from(rowsTable)
    .where(
      and(
        eq(rowsTable.tableId, config.movements),
        isNull(rowsTable.deletedAt),
        sql`${rowsTable.data} -> ${config.run} @> ${JSON.stringify([rowId])}::jsonb`,
      ),
    ).orderBy(asc(rowsTable.id))
  const movements = tx && lock ? await query.for('update') : await query

  if (movements.length === 0) return null
  return {
    tableId: config.movements,
    rows: movements.map((row) => ({ id: row.id, data: row.data as Record<string, unknown> })),
  }
}
