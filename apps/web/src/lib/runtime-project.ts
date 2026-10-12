import { compileTableFormulas, computeDerivedRow, relatedIndexFrom } from '@tableapp/formula'
import { byPosition, systemRowData, type App, type Field, type View, type RowMetadata } from '@tableapp/schema'
import { ANONYMOUS, canOpenScreen, fieldPolicy, formFields, onlyReadable, rowReach, type Visitor } from './app-roles'
import { applyView } from './apply-view'
import { computeDashboards } from './dashboard-data'
import { formatCell } from './format'
import { canAccessRow, rulesFor } from './row-access'
import { readingVisitor as visitorForReading } from './customer-read-access'
import type { RelatedTitles } from './queries'
import type { RuntimeApp, RuntimeTable, ScreenRows } from './app-runtime'
import type { TableRow } from './table-store'

export type RuntimeSourceRow = RowMetadata & { tableId: string; position: string; version: number; data: Record<string, unknown> }

/** Pure runtime projection shared by stored applications and synthetic demo data. */
export function projectRuntime(app: App, visitor: Visitor, views: Record<string, View>,
  tableRows: { id: string; name: string; primaryFieldId: string | null }[],
  fieldsByTable: Map<string, Field[]>, dataRows: RuntimeSourceRow[], primaryByTable: ReadonlyMap<string, string | null>): RuntimeApp {
  const rawByTable = new Map<string, Map<string, Record<string, unknown>>>()
  for (const row of dataRows) {
    let bucket = rawByTable.get(row.tableId)
    if (!bucket) {
      bucket = new Map()
      rawByTable.set(row.tableId, bucket)
    }
    bucket.set(row.id, systemRowData(row, fieldsByTable.get(row.tableId) ?? []))
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
    // External customers may read a public catalog without owning its rows.
    // Without a personal rule they receive exactly the anonymous projection:
    // public rows and public fields, never private dashboards or contacts.
    const publicOnly = visitor.enrolled && rules.length === 0
    const readingVisitor = visitorForReading(app, table.id, visitor)
    const publicReach = publicOnly ? rowReach(app, table.id, views, fields, ANONYMOUS) : null
    const policy = fieldPolicy(app, table.id, readingVisitor, views)

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
      .filter((row) => publicOnly ? publicReach?.kind === 'gated' : canAccessRow(rules, viewer, row.data as Record<string, unknown>))
      .map((row) => ({
        id: row.id,
        version: row.version,
        position: row.position,
        data: computeDerivedRow(systemRowData(row, fields), fields, related, formulas),
      }))
      .filter(row => !publicOnly || publicReach?.kind === 'gated' && publicReach.allows(row.data))

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
    // A visible relation input needs permitted target titles even when that
    // relation is not displayed on existing records. Row values still use
    // policy.fields; buildTitles separately checks each target's read access.
    if (policy.restricted) readableByTable[table.id] = shown

    /*
     * Отбор представления — здесь, а не в браузере.
     *
     * Для каждого списка и каждой плитки, открытых этому человеку, считаем
     * порядок строк сразу после отбора. В браузер уезжает готовый список
     * идентификаторов, а не правило, по которому он получен: устройству
     * больше нечего решать, и значения колонок, по которым шёл отбор,
     * ему теперь не нужны.
     */
    const reach = rowReach(app, table.id, views, fields, readingVisitor)
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
        table.primaryFieldId && !shown.has(table.primaryFieldId)
          ? null
          : table.primaryFieldId,
      fields: fields.filter((field) => shown.has(field.id)),
      // Урезание полей — последним шагом, когда все расчёты уже позади.
      rows: shipped.map((row) => ({ ...row, data: onlyReadable(row.data, { ...policy, restricted: true }) })),
    }
  }

  return {
    ...(app.booking ? { loadedAt: Date.now() } : {}),
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
export function buildTitles(
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
            const publicOnly = access.visitor.enrolled && rules.length === 0
            const readingVisitor = visitorForReading(access.app, targetId, access.visitor)
            const reach = rowReach(access.app, targetId, access.views, targetFields, readingVisitor)
            if (titleField && !fieldPolicy(access.app, targetId, readingVisitor, access.views).fields.has(titleField.id)) return () => false
            if (reach.kind === 'none') return () => false
            return (data: Record<string, unknown>) =>
              (publicOnly || canAccessRow(rules, viewer, data)) &&
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
