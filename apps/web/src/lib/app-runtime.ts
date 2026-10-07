import { apps, db, fields as fieldsTable, rows as rowsTable, tables, views as viewsTable } from '@tableapp/db'
import { compileTableFormulas, computeDerivedRow, relatedIndexFrom } from '@tableapp/formula'
import type { App, Field, View } from '@tableapp/schema'
import { appSchema, byPosition, normalizeFieldOptions } from '@tableapp/schema'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import {
  asRole,
  canOpenScreen,
  fieldPolicy,
  formFields,
  onlyReadable,
  rowReach,
  visibleScreensFor,
  type Visitor,
} from './app-roles'
import { applyView } from './apply-view'
import { computeDashboards, type DashboardResults } from './dashboard-data'
import { formatCell } from './format'
import { canAccessRow, rulesFor } from './row-access'
import type { RelatedTitles } from './queries'
import type { TableRow } from './table-store'

export type RuntimeTable = {
  id: string
  name: string
  primaryFieldId: string | null
  fields: Field[]
  rows: TableRow[]
}

/** Строки одного списка: уже отобранные и уже упорядоченные. */
export type ScreenRows = { rowIds: string[] }

export type RuntimeApp = {
  app: App
  views: Record<string, View>
  tables: Record<string, RuntimeTable>
  relatedTitles: RelatedTitles
  /**
   * Что показывает каждый список и каждая плитка — по идентификатору экрана.
   *
   * Отбор и порядок посчитаны здесь, на сервере, и наружу уходит их результат,
   * а не правило. Браузеру нечего решать: он берёт строки по этим
   * идентификаторам в этом порядке.
   *
   * Так было не всегда. Раньше отбор повторялся на устройстве, и это значило
   * две вещи сразу: строка, убранная владельцем из списка фильтром, всё равно
   * уезжала в браузер и лежала в исходном коде страницы; а колонку, по которой
   * шёл фильтр, приходилось отдавать вместе со строками — фильтр по
   * себестоимости делал себестоимость читаемой для всех, кому открыт список.
   */
  screens: Record<string, ScreenRows>
  /**
   * Готовые итоги блоков сводки по идентификатору блока.
   *
   * Считаются здесь, на сервере, а не в компоненте: число — такие же данные,
   * как и строки, из которых оно получено, и считать его в браузере значит
   * сначала отправить туда эти строки.
   */
  blocks: DashboardResults
}

/**
 * Представления, на которые ссылается приложение.
 *
 * Сводка считает свои блоки по тем же представлениям, что и списки: иначе
 * число в плитке и строки в списке отбирались бы по разным правилам.
 */
function referencedViews(app: App): string[] {
  const ids = new Set<string>()
  for (const screen of app.screens) {
    if (screen.type === 'list' || screen.type === 'tiles') {
      ids.add(screen.source.viewId)
      continue
    }
    if (screen.type === 'dashboard') {
      for (const block of screen.blocks) {
        if ('source' in block) ids.add(block.source.viewId)
      }
    }
  }
  return [...ids].filter(Boolean)
}

/** Таблицы, на которые опираются экраны приложения. */
function referencedTables(app: App, views: Record<string, View>): string[] {
  const ids = new Set<string>()
  for (const screen of app.screens) {
    if (screen.type === 'list' || screen.type === 'tiles') {
      const view = views[screen.source.viewId]
      if (view) ids.add(view.tableId)
      continue
    }
    if (screen.type === 'dashboard') {
      for (const block of screen.blocks) {
        if (!('source' in block)) continue
        const view = views[block.source.viewId]
        if (view) ids.add(view.tableId)
      }
      continue
    }
    ids.add(screen.tableId)
  }
  return [...ids]
}


export type AppMeta = {
  id: string
  name: string
  slug: string
  accent: string
  accessMode: string
  /** Полное определение: по нему считается роль посетителя ещё до загрузки данных. */
  app: App
}

/** Лёгкое описание приложения: нужно до загрузки данных, чтобы решить вопрос входа. */
export async function loadAppMeta(slug: string): Promise<AppMeta | null> {
  const [record] = await db.select().from(apps).where(eq(apps.slug, slug)).limit(1)
  if (!record?.published) return null
  const parsed = appSchema.safeParse(record.published)
  if (!parsed.success) return null
  return {
    id: record.id,
    name: parsed.data.name,
    slug: parsed.data.slug,
    accent: parsed.data.theme.accent,
    accessMode: parsed.data.accessMode,
    app: parsed.data,
  }
}

export async function loadPublishedApp(
  slug: string,
  visitor: Visitor,
): Promise<RuntimeApp | null> {
  const [record] = await db.select().from(apps).where(eq(apps.slug, slug)).limit(1)
  if (!record?.published) return null

  const parsed = appSchema.safeParse(record.published)
  if (!parsed.success) return null

  /*
   * Экраны, закрытые этой роли, отбрасываются до загрузки данных: то, что
   * человеку не положено, не прячется в интерфейсе, а вовсе не читается
   * из базы и не уезжает в браузер.
   */
  const visible = { ...parsed.data, screens: visibleScreensFor(parsed.data, visitor) }
  return loadRuntimeForApp(visible, visitor)
}

/**
 * Приложение для показа на сайте.
 *
 * Читается черновик, а не опубликованная версия: демонстрация не должна
 * требовать публикации, а неопубликованное приложение нельзя ни изменить
 * снаружи, ни найти по адресу. Экраны отбираются по роли той же функцией,
 * что на сервере, а `viewerEmail` позволяет показать кабинет глазами
 * конкретного клиента из примеров.
 */
/** Определение приложения для показа: нужен его список ролей до выбора роли. */
export async function loadDemoApp(slug: string): Promise<App | null> {
  const [record] = await db.select().from(apps).where(eq(apps.slug, slug)).limit(1)
  if (!record) return null
  const parsed = appSchema.safeParse(record.draft)
  return parsed.success ? parsed.data : null
}

export async function loadDemoRuntime(
  slug: string,
  visitor: Visitor,
): Promise<RuntimeApp | null> {
  const [record] = await db.select().from(apps).where(eq(apps.slug, slug)).limit(1)
  if (!record) return null

  const parsed = appSchema.safeParse(record.draft)
  if (!parsed.success) return null

  const visible = { ...parsed.data, screens: visibleScreensFor(parsed.data, visitor) }
  return loadRuntimeForApp(visible, visitor)
}

/** Черновик для предпросмотра в конструкторе: тот же рантайм, неопубликованное определение. */
export async function loadDraftRuntime(appId: string): Promise<RuntimeApp | null> {
  const [record] = await db.select().from(apps).where(eq(apps.id, appId)).limit(1)
  if (!record) return null
  const parsed = appSchema.safeParse(record.draft)
  if (!parsed.success) return null
  // Предпросмотр показывают редактору, поэтому правила видимости строк к нему
  // не применяются: иначе собственное приложение выглядело бы пустым.
  return loadRuntimeForApp({ ...parsed.data, rowAccessRules: [] }, asRole('manager'))
}


export async function loadRuntimeForApp(
  app: App,
  visitor: Visitor,
): Promise<RuntimeApp | null> {
  const anonymous = !visitor.authenticated || visitor.roleId === null
  const viewIds = referencedViews(app)

  const viewRows = viewIds.length
    ? await db.select().from(viewsTable).where(inArray(viewsTable.id, viewIds))
    : []
  const views = Object.fromEntries(viewRows.map((view) => [view.id, view as unknown as View]))

  const tableIds = referencedTables(app, views)
  if (tableIds.length === 0) {
    return { app, views, tables: {}, screens: {}, relatedTitles: {}, blocks: {} }
  }

  const [tableRows, fieldRows] = await Promise.all([
    db.select().from(tables).where(inArray(tables.id, tableIds)),
    db.select().from(fieldsTable).where(inArray(fieldsTable.tableId, tableIds)),
  ])

  const fieldsByTable = new Map<string, Field[]>()
  for (const row of fieldRows) {
    const field = { ...row, options: normalizeFieldOptions(row.type as Field['type'], row.options) } as unknown as Field
    const list = fieldsByTable.get(row.tableId)
    if (list) list.push(field)
    else fieldsByTable.set(row.tableId, [field])
  }

  // Таблицы связей подгружаются даже если экранов у них нет: без них
  // не посчитать Lookup и Rollup и не показать название связанной строки.
  const relationTargets = new Set<string>()
  for (const list of fieldsByTable.values()) {
    for (const field of list) {
      if (field.type === 'relation') relationTargets.add(field.options.tableId)
    }
  }
  const allTableIds = [...new Set([...tableIds, ...relationTargets])]

  // У таблицы связи может не быть ни одного экрана, но её поля всё равно нужны:
  // без них не из чего построить заголовок связанной строки.
  const missingFieldTables = allTableIds.filter((id) => !fieldsByTable.has(id))
  if (missingFieldTables.length > 0) {
    const extra = await db.select().from(fieldsTable).where(inArray(fieldsTable.tableId, missingFieldTables))
    for (const row of extra) {
      const field = { ...row, options: normalizeFieldOptions(row.type as Field['type'], row.options) } as unknown as Field
      const list = fieldsByTable.get(row.tableId)
      if (list) list.push(field)
      else fieldsByTable.set(row.tableId, [field])
    }
  }

  const primaryByTable = new Map(
    (await db.select({ id: tables.id, primaryFieldId: tables.primaryFieldId }).from(tables).where(inArray(tables.id, allTableIds)))
      .map((table) => [table.id, table.primaryFieldId]),
  )

  const dataRows = await db
    .select()
    .from(rowsTable)
    .where(and(inArray(rowsTable.tableId, allTableIds), isNull(rowsTable.deletedAt)))
    .orderBy(asc(rowsTable.position))

  const rawByTable = new Map<string, Map<string, Record<string, unknown>>>()
  for (const row of dataRows) {
    let bucket = rawByTable.get(row.tableId)
    if (!bucket) {
      bucket = new Map()
      rawByTable.set(row.tableId, bucket)
    }
    bucket.set(row.id, row.data as Record<string, unknown>)
  }

  // Связанные строки с посчитанными формулами: Rollup по формульной колонке
  // иначе суммирует то, чего в базе нет, и показывает ноль.
  const related = relatedIndexFrom(rawByTable, fieldsByTable)

  /*
   * Порядок здесь и есть правило безопасности, и менять его нельзя:
   * доступ к экрану (уже применён выше) → доступ к строкам → читаемые поля
   * → отбор представления и блока → подсчёт → показ. Всё, что идёт после
   * прав, может только сузить выборку.
   */
  const result: Record<string, RuntimeTable> = {}
  const screens: Record<string, ScreenRows> = {}
  const forBlocks: Record<string, { fields: Field[]; rows: TableRow[] }> = {}
  const readableByTable: Record<string, ReadonlySet<string>> = {}

  for (const table of tableRows) {
    const fields = (fieldsByTable.get(table.id) ?? []).sort(byPosition)
    const formulas = compileTableFormulas(fields)
    const rules = rulesFor(app, table.id, visitor)
    const viewer = visitor.email
      ? { email: visitor.email, company: visitor.company, enrolled: visitor.enrolled }
      : null

    /*
     * Поля, не положенные этой роли, отсекаются здесь же. «Скрыть поле
     * в интерфейсе» — это не право: значение всё равно уехало бы в браузер
     * и читалось бы в исходном коде страницы.
     */
    const policy = fieldPolicy(app, table.id, visitor, views)
    if (policy.restricted) readableByTable[table.id] = policy.fields

    /*
     * Строки, положенные человеку по правам, со всеми значениями.
     *
     * Урезание полей идёт ниже, а не здесь, и это важно: по этим строкам
     * ещё считаются блоки сводки и применяется отбор представлений, а они
     * смотрят и на те колонки, которых человеку не покажут. Убери значения
     * сейчас — и фильтр «оплачено = нет» не найдёт колонки «Оплачено»
     * и выбросит все строки до одной.
     */
    const allowed = dataRows
      .filter((row) => row.tableId === table.id)
      .filter((row) => canAccessRow(rules, viewer, row.data as Record<string, unknown>))
      .map((row) => ({
        id: row.id,
        position: row.position,
        data: computeDerivedRow(row.data as Record<string, unknown>, fields, related, formulas),
      }))

    // Блоки сводки считают по полным строкам и отдают наружу только готовые
    // числа и подписи; какие поля можно назвать, они проверяют сами.
    forBlocks[table.id] = { fields, rows: allowed }

    /*
     * Строки уезжают в браузер только если приложение показывает их построчно.
     * Таблицу, которую трогает одна плитка со сводки, показывать нечем —
     * и отправлять её строки значило бы отдать наружу то, ради чего плитку
     * и считали на сервере.
     */
    /*
     * Описания колонок отбираются так же, как значения.
     *
     * Раньше в браузер уезжал полный список полей таблицы — с названиями,
     * типами и вариантами выбора. Значений себестоимости не приходило, а сама
     * колонка «Себестоимость» была видна в исходном коде страницы вместе
     * с перечнем вариантов каждого поля выбора. Устройство чужого дела —
     * такие же данные, как и цифры в нём.
     *
     * Исключение — поля форм, открытых этому человеку. Форма показывает
     * не существующие данные, а принимает новые, и без описания поля её
     * нечем нарисовать и нечем проверить ввод. Право записи от этого
     * не появляется: за него отвечает `writableFields`.
     */
    const shown = new Set(policy.fields)
    for (const screen of app.screens) {
      if (screen.type !== 'form' || screen.tableId !== table.id) continue
      for (const fieldId of formFields(app, screen, visitor)) shown.add(fieldId)
    }

    /*
     * Отбор представления — здесь, а не в браузере.
     *
     * Для каждого списка и каждой плитки, открытых этому человеку, считаем
     * порядок строк сразу после отбора. В браузер уезжает готовый список
     * идентификаторов, а не правило, по которому он получен: устройству
     * больше нечего решать, и значения колонок, по которым шёл отбор,
     * ему теперь не нужны.
     */
    const reach = rowReach(app, table.id, views, fields, visitor)
    const reachable = reach.kind === 'gated' ? allowed.filter((row) => reach.allows(row.data)) : allowed

    const onScreens = new Set<string>()
    for (const screen of app.screens) {
      if (screen.type !== 'list' && screen.type !== 'tiles') continue
      if (!canOpenScreen(screen, visitor)) continue
      const view = views[screen.source.viewId]
      if (!view || view.tableId !== table.id) continue

      const ordered = applyView(reachable as TableRow[], fields, view.config).rows
      const ids = ordered.map((row) => row.id)
      screens[screen.id] = { rowIds: ids }
      for (const id of ids) onScreens.add(id)
    }

    /*
     * Строку отдаём, если до неё можно дойти. У таблицы со списком это те,
     * что прошли отбор хотя бы одного открытого экрана: карточка открывается
     * из списка, и строки, которой в списке нет, не откроешь. У таблицы
     * без списка сузить нечем — её ограничивают правила на строки.
     */
    const shipped =
      reach.kind === 'none'
        ? []
        : reach.kind === 'gated'
          ? reachable.filter((row) => onScreens.has(row.id))
          : reachable

    result[table.id] = {
      id: table.id,
      name: table.name,
      primaryFieldId:
        policy.restricted && table.primaryFieldId && !shown.has(table.primaryFieldId)
          ? null
          : table.primaryFieldId,
      fields: policy.restricted ? fields.filter((field) => shown.has(field.id)) : fields,
      // Урезание полей — последним шагом, когда все расчёты уже позади.
      rows: shipped.map((row) => ({ ...row, data: onlyReadable(row.data, policy) })),
    }
  }

  return {
    app,
    views,
    tables: result,
    screens,
    relatedTitles: buildTitles(primaryByTable, fieldsByTable, rawByTable, {
      app,
      visitor,
      views,
      readable: readableByTable,
    }),
    blocks: computeDashboards(app, {
      views,
      tables: forBlocks,
      readable: readableByTable,
      role: visitor.roleId ?? undefined,
    }),
  }
}

/**
 * Заголовки связанных строк.
 *
 * Подпись связи — это данные. Раньше они собирались из сырых строк таблицы-цели
 * без единой проверки, и по подписи можно было узнать список клиентов или
 * поставщиков, не имея доступа ни к одной их строке.
 *
 * Теперь подпись получают только те связи, которые человеку видно, и только
 * по доступным ему строкам: у вошедшего — по правилам на строки, у не
 * вошедшего — по отбору публичного списка.
 *
 * `access` не передаётся только из конструктора: там это собственные данные
 * владельца, и отбирать их не от кого.
 */
function buildTitles(
  primaryByTable: ReadonlyMap<string, string | null>,
  fieldsByTable: ReadonlyMap<string, Field[]>,
  rawByTable: ReadonlyMap<string, ReadonlyMap<string, Record<string, unknown>>>,
  access?: {
    app: App
    visitor: Visitor
    views: Record<string, View>
    readable: Record<string, ReadonlySet<string>>
  },
): RelatedTitles {
  const titles: RelatedTitles = {}
  const viewer = access?.visitor.email
    ? {
        email: access.visitor.email,
        company: access.visitor.company,
        enrolled: access.visitor.enrolled,
      }
    : null

  for (const [tableId, list] of fieldsByTable.entries()) {
    for (const field of list) {
      if (field.type !== 'relation' || titles[field.options.tableId]) continue

      // Связь, которой человеку не видно, подписи не получает.
      const readable = access?.readable[tableId]
      if (readable && !readable.has(field.id)) continue
      const targetId = field.options.tableId
      const targetFields = fieldsByTable.get(targetId) ?? []
      const primaryFieldId = primaryByTable.get(targetId) ?? null
      const titleField =
        targetFields.find((candidate) => candidate.id === primaryFieldId) ?? targetFields[0]

      /*
       * Строки цели отбираются тем же способом, что и при обычном чтении:
       * сначала правила на строки, затем отбор экранов, до которых человек
       * может дойти. Подпись связи — это данные, и брать её из строки,
       * которую человеку не показали бы, нельзя.
       */
      const guard = !access
        ? () => true
        : (() => {
            const rules = rulesFor(access.app, targetId, access.visitor)
            const reach = rowReach(access.app, targetId, access.views, targetFields, access.visitor)
            if (reach.kind === 'none') return () => false
            return (data: Record<string, unknown>) =>
              canAccessRow(rules, viewer, data) &&
              (reach.kind === 'gated' ? reach.allows(data) : true)
          })()

      titles[targetId] = [...(rawByTable.get(targetId) ?? new Map()).entries()]
        .filter(([, data]) => guard(data))
        .map(([id, data]) => ({
          id,
          title: titleField ? formatCell(titleField, data[titleField.id]) || 'Без названия' : id,
        }))
    }
  }

  return titles
}

/**
 * Данные всего воркспейса для конструктора приложений.
 * Предпросмотр должен работать и для экрана, который редактор только что
 * направил на другую таблицу, поэтому грузим всё, а не только задействованное.
 */
export async function loadWorkspaceRuntime(workspaceId: string): Promise<{
  tables: Record<string, RuntimeTable>
  views: View[]
  relatedTitles: RelatedTitles
}> {
  const tableRows = await db.select().from(tables).where(eq(tables.workspaceId, workspaceId))
  if (tableRows.length === 0) return { tables: {}, views: [], relatedTitles: {} }

  const ids = tableRows.map((table) => table.id)
  const [fieldRows, viewRows, dataRows] = await Promise.all([
    db.select().from(fieldsTable).where(inArray(fieldsTable.tableId, ids)),
    db.select().from(viewsTable).where(inArray(viewsTable.tableId, ids)).orderBy(asc(viewsTable.position)),
    db
      .select()
      .from(rowsTable)
      .where(and(inArray(rowsTable.tableId, ids), isNull(rowsTable.deletedAt)))
      .orderBy(asc(rowsTable.position)),
  ])

  const fieldsByTable = new Map<string, Field[]>()
  for (const row of fieldRows) {
    const field = { ...row, options: normalizeFieldOptions(row.type as Field['type'], row.options) } as unknown as Field
    const list = fieldsByTable.get(row.tableId)
    if (list) list.push(field)
    else fieldsByTable.set(row.tableId, [field])
  }

  const rawByTable = new Map<string, Map<string, Record<string, unknown>>>()
  for (const row of dataRows) {
    let bucket = rawByTable.get(row.tableId)
    if (!bucket) {
      bucket = new Map()
      rawByTable.set(row.tableId, bucket)
    }
    bucket.set(row.id, row.data as Record<string, unknown>)
  }

  const related = relatedIndexFrom(rawByTable, fieldsByTable)

  const result: Record<string, RuntimeTable> = {}
  for (const table of tableRows) {
    const fields = (fieldsByTable.get(table.id) ?? []).sort(byPosition)
    const formulas = compileTableFormulas(fields)
    result[table.id] = {
      id: table.id,
      name: table.name,
      primaryFieldId: table.primaryFieldId,
      fields,
      rows: dataRows
        .filter((row) => row.tableId === table.id)
        .map((row) => ({
          id: row.id,
          position: row.position,
          data: computeDerivedRow(row.data as Record<string, unknown>, fields, related, formulas),
        })),
    }
  }

  const primaryByTable = new Map(tableRows.map((table) => [table.id, table.primaryFieldId]))

  return {
    tables: result,
    views: viewRows as unknown as View[],
    relatedTitles: buildTitles(primaryByTable, fieldsByTable, rawByTable),
  }
}
