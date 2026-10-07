'use server'

import {
  db,
  fields as fieldsTable,
  rowChanges,
  rows as rowsTable,
} from '@tableapp/db'
import { compileTableFormulas, computeDerivedRow, stripDerived } from '@tableapp/formula'
import type { App, Field, ProductionConfig } from '@tableapp/schema'
import { explainToCustomer, newId, normalizeFieldOptions, parseCellValue, positionBetween } from '@tableapp/schema'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { permits } from '@/lib/app-roles'
import { currentAppAccess, type AppViewer } from '@/lib/app-session'
import { loadApp } from '@/lib/app-write-access'
import { assertCanIncreaseUsage, isPlanLimitError } from '@/lib/limits'
import { needFor, rowsToCreate, shortagesOf, type Need, type Norm } from '@/lib/production'
import { rulesFor, stampOwner } from '@/lib/row-access'

/**
 * Сохранение выпуска.
 *
 * Одна операция, которая пишет в три места: строку выпуска, по строке журнала
 * на каждый материал и связь материала с его новыми движениями. Всё это —
 * в одной транзакции, потому что наполовину выполненная операция здесь
 * означает не «часть работы», а разошедшийся учёт: выпуск в истории есть,
 * а материалы не списаны. Обнаружится это через месяц, когда пластик
 * кончится раньше, чем говорит остаток.
 *
 * Расход считается **один раз, здесь**, и записывается числами в журнал.
 * Не формулой, которая пересчитается завтра: смена нормы не должна переписать
 * прошлое. Выпуск, сделанный по норме 0,012, списал 240 кг — и это
 * исторический факт, а не мнение сегодняшнего справочника.
 *
 * Общего способа описывать такие производные записи в TableApp пока нет,
 * и заводить его ради одного шаблона не стали. Поэтому действие знает про
 * производство по имени — но знает ровно в одном месте, а что где лежит,
 * читает из настройки приложения.
 */

export type SavedProduction = {
  ok: true
  /** Что списалось: показываем человеку сразу после сохранения. */
  wrote: { material: string; amount: number; unit: string }[]
  quantity: number
  product: string
  /** Повтор той же отправки: строки не задвоились. */
  repeated: boolean
}

export type ProductionInput = {
  /**
   * Идентификатор строки выпуска, выпущенный на устройстве.
   *
   * Он же защита от двойной отправки: человек нажал «Сохранить» дважды или
   * браузер повторил запрос — второй раз придёт тот же идентификатор,
   * и вторая строка не появится. Без этого двойное нажатие списывало бы
   * материалы дважды.
   */
  runId: string
  productId: string
  quantity: number
  defects: number
  /** День выпуска. Пусто — сегодня. */
  date: string | null
  shiftId: string | null
  note: string
}

async function loadFields(tableId: string): Promise<Field[]> {
  const rows = await db
    .select()
    .from(fieldsTable)
    .where(eq(fieldsTable.tableId, tableId))
    .orderBy(asc(fieldsTable.position))
  return rows.map(
    (row) =>
      ({ ...row, options: normalizeFieldOptions(row.type as Field['type'], row.options) }) as unknown as Field,
  )
}

/** Связь хранится массивом даже когда она одна. */
function first(value: unknown): string | null {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null
}

/**
 * Нормы, действующие на этот продукт **сейчас**.
 *
 * Отбираются здесь, а не в чистом расчёте: тот про базу ничего не знает
 * и знать не должен. Снятая отметка «Действует» выводит норму из будущих
 * выпусков и не трогает прошлые.
 */
async function normsFor(config: ProductionConfig, productId: string): Promise<Norm[]> {
  const rows = await db
    .select({ data: rowsTable.data })
    .from(rowsTable)
    .where(and(eq(rowsTable.tableId, config.tables.norms), isNull(rowsTable.deletedAt)))

  const out: Norm[] = []
  for (const row of rows) {
    const data = row.data as Record<string, unknown>
    if (first(data[config.norm.product]) !== productId) continue
    if (data[config.norm.active] === false) continue
    const materialId = first(data[config.norm.material])
    const perUnit = Number(data[config.norm.perUnit])
    if (!materialId || !Number.isFinite(perUnit)) continue
    out.push({ materialId, perUnit })
  }
  return out
}

type MaterialRow = {
  id: string
  name: string
  unit: string
  stock: number
  links: string[]
  /** Остальные значения строки: при дописывании связи их нельзя потерять. */
  data: Record<string, unknown>
}

/** Материалы с остатком: остаток считается тем же путём, что показан на экране. */
async function materialsOf(config: ProductionConfig): Promise<Map<string, MaterialRow>> {
  const columns = await loadFields(config.tables.materials)
  const rows = await db
    .select({ id: rowsTable.id, data: rowsTable.data })
    .from(rowsTable)
    .where(and(eq(rowsTable.tableId, config.tables.materials), isNull(rowsTable.deletedAt)))

  const movements = await db
    .select({ id: rowsTable.id, data: rowsTable.data })
    .from(rowsTable)
    .where(and(eq(rowsTable.tableId, config.tables.movements), isNull(rowsTable.deletedAt)))

  const qtyOf = new Map(
    movements.map((row) => [row.id, Number((row.data as Record<string, unknown>)[config.movement.qty]) || 0]),
  )
  const unitChoices = (columns.find((field) => field.id === config.material.unit)?.options ?? {}) as {
    choices?: { id: string; name: string }[]
  }

  const out = new Map<string, MaterialRow>()
  for (const row of rows) {
    const data = row.data as Record<string, unknown>
    const links = Array.isArray(data[config.material.movements])
      ? (data[config.material.movements] as string[])
      : []
    const opening = Number(data[config.material.opening]) || 0
    const delta = links.reduce((sum, id) => sum + (qtyOf.get(id) ?? 0), 0)

    out.set(row.id, {
      id: row.id,
      name: String(data[config.material.name] ?? 'Без названия'),
      unit: unitChoices.choices?.find((choice) => choice.id === data[config.material.unit])?.name ?? '',
      stock: opening + delta,
      links,
      data,
    })
  }
  return out
}

export type ConsumptionPreview = {
  ok: true
  lines: { materialId: string; material: string; unit: string; need: number; stock: number; missing: number }[]
}

/**
 * Что спишется, если сохранить.
 *
 * Считается на сервере тем же расчётом, что и само сохранение. Посчитать это
 * в браузере было бы быстрее, но тогда формул стало бы две, и однажды они
 * разошлись бы — человек увидел бы на экране одно, а в журнале другое.
 */
export async function previewConsumptionAction(
  slug: string,
  productId: string,
  quantity: number,
): Promise<ConsumptionPreview | { ok: false; error: string }> {
  const ready = await open(slug)
  if (!ready.ok) return ready
  const { config } = ready

  const needs = needFor(quantity, await normsFor(config, productId))
  const materials = await materialsOf(config)
  const short = new Map(shortagesOf(needs, new Map([...materials].map(([id, m]) => [id, m.stock]))).map((item) => [item.materialId, item]))

  return {
    ok: true,
    lines: needs.map((need) => {
      const material = materials.get(need.materialId)
      return {
        materialId: need.materialId,
        material: material?.name ?? 'Материал удалён',
        unit: material?.unit ?? '',
        need: need.amount,
        stock: material?.stock ?? 0,
        missing: short.get(need.materialId)?.missing ?? 0,
      }
    }),
  }
}

type Ready = { ok: true; app: App; config: ProductionConfig; viewer: AppViewer | null; visitor: Awaited<ReturnType<typeof currentAppAccess>>['visitor'] }

/**
 * Одна дверь: приложение опубликовано, настроено под производство, человек
 * вправе писать **в ту таблицу**, куда собирается.
 *
 * Таблица указывается явно, потому что права у них разные: выпуск вводит
 * и начальник производства, а ручное движение склада — только тот, кому
 * открыта его форма. Право считается по экранам приложения, поэтому
 * подменить его в запросе нечем.
 */
async function open(
  slug: string,
  into: 'production' | 'movements' = 'production',
): Promise<Ready | { ok: false; error: string }> {
  const app = await loadApp(slug)
  if (!app) return { ok: false, error: 'Приложение не опубликовано' }

  const config = app.production
  if (!config) return { ok: false, error: 'В этом приложении нет производственного учёта' }

  const { visitor, viewer } = await currentAppAccess(app)
  if (!permits(app, config.tables[into], 'create', visitor)) {
    const what = into === 'production' ? 'Вводить выпуск' : 'Записывать движения склада'
    return {
      ok: false,
      error: visitor.authenticated ? `${what} вам не разрешено` : 'Чтобы записать, войдите',
    }
  }

  return { ok: true, app, config, viewer, visitor }
}

export type SavedMovement = {
  ok: true
  material: string
  unit: string
  amount: number
  /** Остаток после движения: ради него всё и делается. */
  stock: number
  repeated: boolean
}

export type MovementInput = {
  /** Идентификатор строки с устройства: защита от двойной отправки. */
  movementId: string
  materialId: string
  kindId: string | null
  /** Со знаком: приход положительный, списание отрицательное. */
  amount: number
  date: string | null
  reason: string
}

/**
 * Ручное движение склада: приход, списание, корректировка.
 *
 * Отдельным действием, а не обычной формой, по одной причине: остаток
 * материала — это свёртка по связи «Материал → Движения», а обратную сторону
 * связи движок не ведёт. Обычная форма создала бы строку журнала, которой
 * свёртка не видит: приход записан, остаток прежний. Заметили бы это
 * не сразу, а когда остаток разошёлся бы с полкой.
 */
export async function saveMovementAction(
  slug: string,
  input: MovementInput,
): Promise<SavedMovement | { ok: false; error: string }> {
  const ready = await open(slug, 'movements')
  if (!ready.ok) return ready
  const { config, viewer, visitor } = ready

  if (!Number.isFinite(input.amount) || input.amount === 0) {
    return { ok: false, error: 'Укажите количество: приход со знаком плюс, списание со знаком минус' }
  }

  const movementFields = await loadFields(config.tables.movements)
  const kindField = movementFields.find((field) => field.id === config.movement.kind)
  const choices =
    kindField && kindField.type === 'single_select' ? kindField.options.choices : []

  if (!input.kindId || !choices.some((choice) => choice.id === input.kindId)) {
    return { ok: false, error: 'Выберите тип движения' }
  }
  /*
   * «Производство» ставит только сохранение выпуска. Разреши его здесь —
   * и в журнале появились бы списания по выпуску, за которыми выпуска нет:
   * отбор по типу перестал бы что-либо значить.
   */
  if (input.kindId === config.movementKindId) {
    return {
      ok: false,
      error: 'Тип «Производство» ставится сам при вводе выпуска — выберите приход, списание или корректировку',
    }
  }

  const materials = await materialsOf(config)
  const material = materials.get(input.materialId)
  if (!material) return { ok: false, error: 'Выберите материал' }

  const materialFields = await loadFields(config.tables.materials)
  const when = input.date ?? new Date().toISOString()
  const workspaceId = await workspaceOf(config.tables.movements)

  try {
    const repeated = await db.transaction(async (tx) => {
      if (workspaceId) {
        await assertCanIncreaseUsage({
          workspaceId,
          resource: 'rows',
          amount: 1,
          origin: 'runtime',
          tx,
        })
      }

      const values = clean(
        {
          [config.movement.date]: when,
          [config.movement.material]: [material.id],
          [config.movement.kind]: input.kindId,
          [config.movement.qty]: input.amount,
          [config.movement.reason]: input.reason,
        },
        movementFields,
      )
      const data = computeDerivedRow(
        values,
        movementFields,
        new Map(),
        compileTableFormulas(movementFields),
      )

      const inserted = await tx
        .insert(rowsTable)
        .values({
          id: input.movementId,
          tableId: config.tables.movements,
          data: stripDerived(data, movementFields),
          position: await nextPosition(tx, config.tables.movements),
        })
        .onConflictDoNothing()
        .returning({ id: rowsTable.id })

      // Тот же идентификатор — та же строка: второе нажатие ничего не пишет.
      if (inserted.length === 0) return true

      await tx.insert(rowChanges).values({
        id: newId('change'),
        tableId: config.tables.movements,
        rowId: input.movementId,
        op: 'create',
        after: data,
        actorId: viewer?.id ?? null,
        actorKind: 'app_user',
      })

      // Связь материала — то, ради чего это действие и существует.
      material.links = [...material.links, input.movementId]
      await tx
        .update(rowsTable)
        .set({ data: withLinks(material, config, materialFields), updatedAt: new Date() })
        .where(eq(rowsTable.id, material.id))

      return false
    })

    revalidatePath(`/a/${slug}`)
    return {
      ok: true,
      repeated,
      material: material.name,
      unit: material.unit,
      amount: input.amount,
      stock: repeated ? material.stock : material.stock + input.amount,
    }
  } catch (error) {
    if (isPlanLimitError(error)) {
      return { ok: false, error: visitor.enrolled ? explainToCustomer() : error.message }
    }
    throw error
  }
}

export async function saveProductionAction(
  slug: string,
  input: ProductionInput,
): Promise<SavedProduction | { ok: false; error: string }> {
  const ready = await open(slug)
  if (!ready.ok) return ready
  const { app, config, viewer, visitor } = ready

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, error: 'Укажите, сколько произвели: число должно быть больше нуля' }
  }
  const defects = Number.isFinite(input.defects) && input.defects > 0 ? input.defects : 0
  if (defects > input.quantity) {
    // Брака больше, чем выпуска, не бывает: это опечатка, и лучше поймать её
    // до того, как она уедет в сводку директора.
    return { ok: false, error: 'Брак не может быть больше выпуска' }
  }

  const materials = await materialsOf(config)
  const needs = needFor(input.quantity, await normsFor(config, input.productId))

  const runFields = await loadFields(config.tables.production)
  const movementFields = await loadFields(config.tables.movements)
  const materialFields = await loadFields(config.tables.materials)

  const productName = await titleOf(config, input.productId)
  const when = input.date ?? new Date().toISOString()
  const reason = `Выпуск: ${productName}, ${input.quantity.toLocaleString('ru-RU')}`

  try {
    const repeated = await write({
      app,
      config,
      input,
      defects,
      when,
      reason,
      needs,
      materials,
      runFields,
      movementFields,
      materialFields,
      viewer,
      visitor,
    })

    revalidatePath(`/a/${slug}`)
    return {
      ok: true,
      repeated,
      quantity: input.quantity,
      product: productName,
      wrote: needs.map((need) => ({
        material: materials.get(need.materialId)?.name ?? 'Материал',
        amount: need.amount,
        unit: materials.get(need.materialId)?.unit ?? '',
      })),
    }
  } catch (error) {
    if (isPlanLimitError(error)) {
      return { ok: false, error: visitor.enrolled ? explainToCustomer() : error.message }
    }
    throw error
  }
}

/**
 * Запись: всё или ничего.
 *
 * Внутри одной транзакции — место под строки, сам выпуск, движения склада,
 * связь материалов с движениями и журнал изменений. Сорвётся любая из частей,
 * и не останется ни одной: выпуск без списаний хуже, чем несохранённый выпуск,
 * потому что первый человек считает сделанным.
 */
async function write(args: {
  app: App
  config: ProductionConfig
  input: ProductionInput
  defects: number
  when: string
  reason: string
  needs: Need[]
  materials: Map<string, MaterialRow>
  runFields: Field[]
  movementFields: Field[]
  materialFields: Field[]
  viewer: AppViewer | null
  visitor: Ready['visitor']
}): Promise<boolean> {
  const { app, config, input, needs, materials } = args
  const workspaceId = await workspaceOf(config.tables.production)

  return db.transaction(async (tx) => {
    /*
     * Место проверяем на **всю** операцию: выпуск плюс по строке на материал.
     * Проверить только выпуск значило бы пропустить его при полном складе
     * и получить списания, которым не хватило места.
     */
    if (workspaceId) {
      await assertCanIncreaseUsage({
        workspaceId,
        resource: 'rows',
        amount: rowsToCreate(needs),
        origin: 'runtime',
        tx,
      })
    }

    const runRules = rulesFor(app, config.tables.production, args.visitor)
    const runValues = clean(
      {
        [config.run.date]: args.when,
        [config.run.product]: [input.productId],
        [config.run.qty]: input.quantity,
        [config.run.defects]: args.defects,
        ...(input.shiftId ? { [config.run.shift]: input.shiftId } : {}),
        ...(input.note ? { [config.run.note]: input.note } : {}),
      },
      args.runFields,
    )

    const runData = computeDerivedRow(
      stampOwner(runRules, args.viewer, runValues),
      args.runFields,
      new Map(),
      compileTableFormulas(args.runFields),
    )

    /*
     * Тот же идентификатор — та же строка. Второе нажатие «Сохранить»
     * не создаёт ничего: `do nothing` возвращает пусто, и мы уходим,
     * не тронув ни журнал склада, ни остатки.
     */
    const inserted = await tx
      .insert(rowsTable)
      .values({
        id: input.runId,
        tableId: config.tables.production,
        data: stripDerived(runData, args.runFields),
        position: await nextPosition(tx, config.tables.production),
      })
      .onConflictDoNothing()
      .returning({ id: rowsTable.id })

    if (inserted.length === 0) return true

    await tx.insert(rowChanges).values({
      id: newId('change'),
      tableId: config.tables.production,
      rowId: input.runId,
      op: 'create',
      after: runData,
      actorId: args.viewer?.id ?? null,
      actorKind: 'app_user',
    })

    if (needs.length === 0) return false

    const movementRows = []
    const changes = []
    const positions = await positionsFor(tx, config.tables.movements, needs.length)
    const formulas = compileTableFormulas(args.movementFields)

    for (const [index, need] of needs.entries()) {
      const id = newId('row')
      const values = clean(
        {
          [config.movement.date]: args.when,
          [config.movement.material]: [need.materialId],
          [config.movement.kind]: config.movementKindId,
          // Со знаком минус: остаток — это сумма движений, и списание
          // обязано уменьшать её само, без разбора типа.
          [config.movement.qty]: -need.amount,
          [config.movement.run]: [input.runId],
          [config.movement.reason]: args.reason,
        },
        args.movementFields,
      )
      const data = computeDerivedRow(values, args.movementFields, new Map(), formulas)

      movementRows.push({
        id,
        tableId: config.tables.movements,
        data: stripDerived(data, args.movementFields),
        position: positions[index]!,
      })
      changes.push({
        id: newId('change'),
        tableId: config.tables.movements,
        rowId: id,
        op: 'create' as const,
        after: data,
        actorId: args.viewer?.id ?? null,
        actorKind: 'app_user' as const,
      })

      // Обратная сторона связи в TableApp не ведётся сама — ведём здесь.
      // Без неё свёртка считает по старому списку, и остаток не сдвинется.
      const material = materials.get(need.materialId)
      if (material) material.links = [...material.links, id]
    }

    await tx.insert(rowsTable).values(movementRows)
    await tx.insert(rowChanges).values(changes)

    for (const need of needs) {
      const material = materials.get(need.materialId)
      if (!material) continue
      await tx
        .update(rowsTable)
        .set({
          data: withLinks(material, config, args.materialFields),
          updatedAt: new Date(),
        })
        .where(eq(rowsTable.id, material.id))
    }

    return false
  })
}

/** Значения по типам колонок: присланное мимо типа отбрасывается, а не пишется как есть. */
function clean(values: Record<string, unknown>, fields: Field[]): Record<string, unknown> {
  const byId = new Map(fields.map((field) => [field.id, field]))
  const out: Record<string, unknown> = {}
  for (const [fieldId, value] of Object.entries(values)) {
    const field = byId.get(fieldId)
    if (!field) continue
    try {
      out[fieldId] = parseCellValue(field, value)
    } catch {
      // Значение, не подходящее типу, не пишется.
    }
  }
  return out
}

/**
 * Строка материала с дописанной связью.
 *
 * Остальные значения переносятся как были: пишем одно поле, а не всю строку
 * заново, иначе правка склада затирала бы то, что человек изменил параллельно.
 */
function withLinks(
  material: MaterialRow,
  config: ProductionConfig,
  fields: Field[],
): Record<string, unknown> {
  const field = fields.find((item) => item.id === config.material.movements)
  const value = field ? parseCellValue(field, material.links) : material.links
  return { ...material.data, [config.material.movements]: value }
}

async function nextPosition(tx: { select: typeof db.select }, tableId: string): Promise<string> {
  const rows = await tx
    .select({ position: rowsTable.position })
    .from(rowsTable)
    .where(and(eq(rowsTable.tableId, tableId), isNull(rowsTable.deletedAt)))
    .orderBy(asc(rowsTable.position))
  return positionBetween(rows[rows.length - 1]?.position ?? null, null)
}

async function positionsFor(
  tx: { select: typeof db.select },
  tableId: string,
  count: number,
): Promise<string[]> {
  let last = await nextPosition(tx, tableId)
  const out = [last]
  for (let i = 1; i < count; i += 1) {
    last = positionBetween(last, null)
    out.push(last)
  }
  return out
}

async function titleOf(config: ProductionConfig, productId: string): Promise<string> {
  const [row] = await db
    .select({ data: rowsTable.data })
    .from(rowsTable)
    .where(eq(rowsTable.id, productId))
    .limit(1)
  if (!row) return 'Изделие'
  const data = row.data as Record<string, unknown>
  const first = Object.values(data).find((value) => typeof value === 'string' && value.trim() !== '')
  void config
  return typeof first === 'string' ? first : 'Изделие'
}

async function workspaceOf(tableId: string): Promise<string | null> {
  const { tables } = await import('@tableapp/db')
  const [row] = await db
    .select({ workspaceId: tables.workspaceId })
    .from(tables)
    .where(eq(tables.id, tableId))
    .limit(1)
  return row?.workspaceId ?? null
}
