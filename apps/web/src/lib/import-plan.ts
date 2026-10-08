import type { ImportPreview, SheetBlocker, SheetInfo, SheetNote } from '@tableapp/import'
import { isComputed, type Field, type FieldType } from '@tableapp/schema'

/**
 * Правила импорта книги: что выбрано, куда ложится и что этому мешает.
 *
 * Отдельно от разметки, потому что здесь вся смысловая часть. Два листа,
 * нацеленные в одну таблицу, книга, которая не помещается в тариф, и лист,
 * который нельзя прочитать, — это вопросы, на которые ответ должен быть один
 * и тот же и на экране, и на сервере. Разметка меняется часто, эти правила —
 * нет, и проверять их надо здесь, а не кликами.
 *
 * Правило, которое стоит за всеми остальными: **человек должен узнать
 * о пропаже до импорта, а не после**. Поэтому лист, который не читается
 * целиком, не импортируется вовсе, а не «насколько получилось».
 */

export type Destination =
  | { kind: 'new'; name: string }
  | { kind: 'existing'; tableId: string; tableName: string; mapped: number }

export type SheetPlan = {
  sheet: string
  /** Сколько строк уедет в таблицу. Считается по разобранной решётке. */
  rows: number
  destination: Destination
}

export type PlanIssue = { level: 'block' | 'warn'; text: string }

/** Чем кончился лист. `repeat` — повтор, который ничего не записал заново. */
export type SheetOutcomeView = {
  status: 'done' | 'repeat' | 'failed'
  text: string
  tableId: string | null
  added: number
}

/**
 * Настройки одного листа в текущем запуске импорта.
 *
 * Живут, пока открыт экран: человек переключается между листами, и вернувшись
 * к первому, должен увидеть свои названия колонок и выбранную таблицу,
 * а не пустую заготовку.
 */
export type SheetSetup = {
  name: string
  grid: string[][]
  info: SheetInfo
  typeOverrides: Record<number, FieldType>
  nameOverrides: Record<number, string>
  destination: { kind: 'new'; name: string } | { kind: 'existing'; tableId: string }
  /**
   * Колонка файла → колонка таблицы. Только для добавления в существующую.
   *
   * Ключ — номер колонки в файле, а не идентификатор поля. Поля предпросмотра
   * пересоздаются при каждом изменении типа или названия и получают новые
   * идентификаторы; сопоставление, привязанное к ним, рассыпалось бы от одной
   * правки заголовка, причём молча — на экране галочки, а в таблице пусто.
   */
  mapping: Record<number, string>
  outcome: SheetOutcomeView | null
}

export type PlanContext = {
  /** Сколько строк ещё помещается в тариф. `null` — неизвестно. */
  rowsLeft: number | null
  tablesLeft: number | null
  /** Названия таблиц, которые уже есть в пространстве. */
  existingTables: readonly string[]
}

/** Названия колонок в файле и в таблице редко совпадают посимвольно. */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim()
}

/**
 * Сопоставление колонок по названиям: человеку остаётся проверить, а не
 * заполнить пятнадцать выпадающих списков. Занятое поле второй раз
 * не предлагается — одна колонка таблицы принимает одну колонку файла.
 */
export function guessMapping(preview: ImportPreview, targetFields: readonly Field[]): Record<number, string> {
  const taken = new Set<string>()
  const guess: Record<number, string> = {}
  for (const [index, field] of preview.fields.entries()) {
    const match = targetFields.find(
      (candidate) => !isComputed(candidate.type) && !taken.has(candidate.id) && normalizeName(candidate.name) === normalizeName(field.name),
    )
    if (match) {
      taken.add(match.id)
      guess[index] = match.id
    }
  }
  // Opening balances accept a common spreadsheet heading; computed stock is never an import destination.
  const opening = targetFields.find(field => field.type === 'number' && normalizeName(field.name) === 'начальный остаток')
  const stock = targetFields.some(field => field.type === 'formula' && normalizeName(field.name) === 'остаток')
  if (opening && stock && !taken.has(opening.id)) {
    const index = preview.fields.findIndex((field, index) => guess[index] === undefined && normalizeName(field.name) === 'остаток')
    if (index !== -1) guess[index] = opening.id
  }
  return guess
}

/** Номера колонок — в идентификаторы полей того разбора, который сейчас уедет. */
export function byFieldId(mapping: Record<number, string>, preview: ImportPreview): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [column, targetId] of Object.entries(mapping)) {
    const field = preview.fields[Number(column)]
    if (field) result[field.id] = targetId
  }
  return result
}

/**
 * Предел размера файла.
 *
 * Знание общее для браузера и сервера: браузер отказывает сразу, не отправляя
 * двадцать мегабайт впустую, сервер — потому что проверке в браузере верить
 * нельзя. Раньше предел знал только сервер, а запрос с большим файлом
 * обрывался на транспорте, и человек не видел ни ошибки, ни объяснения.
 */
export const MAX_FILE_BYTES = 15 * 1024 * 1024

export function tooBig(bytes: number): string | null {
  if (bytes <= MAX_FILE_BYTES) return null
  const mb = (bytes / 1024 / 1024).toFixed(1).replace('.', ',')
  return `Файл весит ${mb} МБ — больше предела 15 МБ. Разделите книгу или выгрузите листы в CSV.`
}

/** Число словом: «3 листа», «1 лист», «5 листов». */
export function sheetsWord(count: number): string {
  const tens = count % 100
  const ones = count % 10
  if (tens >= 11 && tens <= 14) return 'листов'
  if (ones === 1) return 'лист'
  if (ones >= 2 && ones <= 4) return 'листа'
  return 'листов'
}

export function rowsWord(count: number): string {
  const tens = count % 100
  const ones = count % 10
  if (tens >= 11 && tens <= 14) return 'строк'
  if (ones === 1) return 'строка'
  if (ones >= 2 && ones <= 4) return 'строки'
  return 'строк'
}

export function columnsWord(count: number): string {
  const tens = count % 100
  const ones = count % 10
  if (tens >= 11 && tens <= 14) return 'колонок'
  if (ones === 1) return 'колонка'
  if (ones >= 2 && ones <= 4) return 'колонки'
  return 'колонок'
}

const number = new Intl.NumberFormat('ru-RU')

/** Подпись кнопки: она должна называть действие, а не «Готово». */
export function importLabel(count: number): string {
  if (count === 0) return 'Выберите лист'
  if (count === 1) return 'Импортировать лист'
  return `Импортировать ${count} ${sheetsWord(count)}`
}

/** Можно ли лист импортировать: коротко, для флажка и для сервера. */
export function isImportable(info: SheetInfo): boolean {
  return info.blockers.length === 0
}

/**
 * Что выбрано сразу после загрузки книги.
 *
 * Один лист — первый пригодный и видимый. Скрытый лист сам не выбирается
 * никогда: его спрятали, и решать за человека, что он снова нужен, нельзя.
 */
export function defaultSelection(sheets: readonly SheetInfo[]): string[] {
  const first = sheets.find((sheet) => isImportable(sheet) && !sheet.hidden)
  return first ? [first.name] : []
}

/** Почему лист нельзя взять — словами, с числами. */
export function blockerText(blocker: SheetBlocker): string {
  switch (blocker.kind) {
    case 'empty':
      return 'нет строк данных'
    case 'rows':
      return `${number.format(blocker.found)} ${rowsWord(blocker.found)} — больше предела ${number.format(blocker.limit)}`
    case 'columns':
      return `${blocker.found} ${columnsWord(blocker.found)} — больше предела ${blocker.limit}`
    case 'formulas':
      return `формул без сохранённого результата: ${blocker.count} (${blocker.cells.join(', ')}${
        blocker.count > blocker.cells.length ? ' и другие' : ''
      })`
    case 'missing':
      return 'листа нет в книге'
    case 'unreadable':
      return `лист не читается: ${blocker.message}`
  }
}

/** Что стоит знать, но импорту не мешает. */
export function noteText(note: SheetNote): string {
  return `ошибок вычисления в ячейках: ${note.count} (${note.cells.join(', ')}${
    note.count > note.cells.length ? ' и другие' : ''
  }). Значения приедут как есть: «#DIV/0!» останется текстом`
}

/** Что делать с листом, который не берём. */
export function blockerAdvice(blocker: SheetBlocker): string | null {
  switch (blocker.kind) {
    case 'rows':
      return 'Разделите лист на части или выгрузите его отдельным файлом CSV.'
    case 'columns':
      return 'Уберите лишние колонки или разнесите лист на несколько.'
    case 'formulas':
      return 'Откройте книгу в Excel или совместимом редакторе, дайте ей пересчитаться и сохраните — тогда значения окажутся в файле. Формулы мы не вычисляем.'
    case 'empty':
      return 'Импортировать из этого листа нечего — снимите с него выбор.'
    default:
      return null
  }
}

/** Название таблицы по листу: уникальное в пределах одного запуска импорта. */
export function uniqueName(base: string, taken: readonly string[]): string {
  const clean = base.trim() || 'Без названия'
  const used = new Set(taken.map((name) => name.trim().toLowerCase()))
  if (!used.has(clean.toLowerCase())) return clean

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${clean} (${index})`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
  return `${clean} (${Date.now()})`
}

/**
 * Что не так с планом импорта.
 *
 * `block` останавливает запуск, `warn` показывается и не мешает. Разделение
 * важное: «в пространстве уже есть таблица с таким названием» — это не ошибка,
 * названия у таблиц не уникальны, и запрещать было бы враньём. А вот два
 * листа в одну таблицу — ошибка: порядок строк был бы случайным,
 * а сопоставление колонок — общим на два разных листа.
 */
export function planIssues(plans: readonly SheetPlan[], context: PlanContext): PlanIssue[] {
  const issues: PlanIssue[] = []

  const byTable = new Map<string, string[]>()
  const byName = new Map<string, string[]>()
  let newTables = 0
  let totalRows = 0

  for (const plan of plans) {
    totalRows += plan.rows

    if (plan.destination.kind === 'existing') {
      const list = byTable.get(plan.destination.tableId) ?? []
      list.push(plan.sheet)
      byTable.set(plan.destination.tableId, list)

      if (plan.destination.mapped === 0) {
        issues.push({
          level: 'block',
          text: `Лист «${plan.sheet}»: не выбрана ни одна колонка таблицы «${plan.destination.tableName}».`,
        })
      }
      continue
    }

    newTables += 1
    const name = plan.destination.name.trim()
    if (name === '') {
      issues.push({ level: 'block', text: `Лист «${plan.sheet}»: не заполнено название таблицы.` })
      continue
    }
    const list = byName.get(name.toLowerCase()) ?? []
    list.push(plan.sheet)
    byName.set(name.toLowerCase(), list)

    if (context.existingTables.some((existing) => existing.trim().toLowerCase() === name.toLowerCase())) {
      issues.push({
        level: 'warn',
        text: `В пространстве уже есть таблица «${name}». Будет создана вторая с тем же названием.`,
      })
    }
  }

  for (const [tableId, sheets] of byTable) {
    if (sheets.length < 2) continue
    const plan = plans.find(
      (item) => item.destination.kind === 'existing' && item.destination.tableId === tableId,
    )
    const tableName = plan?.destination.kind === 'existing' ? plan.destination.tableName : 'таблицу'
    issues.push({
      level: 'block',
      text: `Листы ${sheets.map((name) => `«${name}»`).join(' и ')} ведут в одну таблицу «${tableName}». Один лист — одна таблица: выберите другую или создайте новую.`,
    })
  }

  for (const [, sheets] of byName) {
    if (sheets.length < 2) continue
    issues.push({
      level: 'block',
      text: `Листы ${sheets.map((name) => `«${name}»`).join(' и ')} создают таблицу с одинаковым названием. Исправьте название.`,
    })
  }

  /*
   * Потолки тарифа считаются по всем выбранным листам сразу. Проверять
   * их по одному значило бы пустить первые два листа и упереться на третьем —
   * то есть ровно наполовину загруженную книгу, от которой мы и уходим.
   * Последнее слово всё равно за сервером: это предупреждение, а не разрешение.
   */
  if (context.rowsLeft !== null && totalRows > context.rowsLeft) {
    issues.push({
      level: 'block',
      text: `Во всех выбранных листах ${number.format(totalRows)} ${rowsWord(totalRows)}, а в тарифе осталось место под ${number.format(context.rowsLeft)}. Снимите выбор с части листов или освободите место.`,
    })
  }

  if (context.tablesLeft !== null && newTables > context.tablesLeft) {
    issues.push({
      level: 'block',
      text: `Новых таблиц ${newTables}, а в тарифе осталось ${context.tablesLeft}. Часть листов можно добавить в существующие таблицы.`,
    })
  }

  return issues
}

export function blocked(issues: readonly PlanIssue[]): boolean {
  return issues.some((issue) => issue.level === 'block')
}
