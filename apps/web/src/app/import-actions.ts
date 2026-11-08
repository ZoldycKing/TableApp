'use server'

import { inspectWorkbook, readSheets, type SheetGrid, type SheetInfo } from '@tableapp/import'
import { revalidatePath } from 'next/cache'
import { publishTable } from '@/lib/live'
import { remainingFor } from '@/lib/usage'
import { authorizeTable, authorizeWorkspace } from '@/lib/authorize'
import { MAX_FILE_BYTES, tooBig } from '@/lib/import-plan'
import { runSheetImport, type ImportSheetInput, type SheetOutcome } from '@/lib/import-run'
import { requireMember } from '@/lib/session'
import { restrictedTables } from '@/lib/table-permissions'

/**
 * Импорт файла.
 *
 * Книга Excel разбирается на сервере: библиотеки для Excel тянут узловые
 * модули, и в браузерной сборке это оборачивается полифилами ради одной
 * страницы. Файл нигде не сохраняется — он живёт в памяти запроса, а между
 * шагами его держит браузер. Это осознанный размен: книгу приходится
 * отправлять дважды (осмотр и чтение выбранных листов), зато на сервере
 * не заводится хранилище чужих файлов, которое надо охранять и убирать.
 *
 * Три шага — три действия:
 * `inspectWorkbookAction` отвечает, что в книге; `readSheetsAction` отдаёт
 * строки выбранных листов; `importSheetAction` пишет один лист в базу.
 * Записью занимается последнее, и только оно решает, можно ли: предпросмотр
 * ничего не разрешает, все проверки прав и потолков повторяются здесь.
 */

export type Quota = {
  /** Сколько строк ещё помещается в тариф. */
  rowsLeft: number
  tablesLeft: number
}

export type InspectResult =
  | { ok: true; sheets: SheetInfo[]; quota: Quota }
  | { ok: false; error: string }

export type ReadSheetsResult =
  | { ok: true; sheets: SheetGrid[]; quota: Quota }
  | { ok: false; error: string }

/** Что не так с самим файлом — до того, как речь зашла о листах. */
function fileProblem(file: unknown): string | null {
  if (!(file instanceof File)) return 'Файл не передан'
  if (file.size === 0) return 'Файл пуст'
  const big = tooBig(file.size)
  if (big) return big
  if (/\.xls$/i.test(file.name)) return 'Формат .xls не читается. Сохраните файл как .xlsx или CSV.'
  return null
}

function readFailure(cause: unknown): string {
  // Сюда приходят и «это не книга Excel», и битые архивы. Человеку важно
  // понять, что дело в файле, а не в том, что сервис сломался, — и услышать
  // это словами, а не строкой из библиотеки про central directory.
  const detail = cause instanceof Error ? cause.message : ''
  if (/zip|central directory|corrupt|end of data/i.test(detail)) {
    return 'Файл не открывается как книга Excel: он повреждён или это другой формат. Откройте его в Excel и сохраните заново как .xlsx.'
  }
  return detail ? `Не удалось прочитать книгу: ${detail}` : 'Не удалось прочитать книгу'
}

/** Что в книге: листы, их размеры и причины, по которым лист не берётся. */
export async function inspectWorkbookAction(form: FormData): Promise<InspectResult> {
  const member = await requireMember()

  const file = form.get('file')
  const problem = fileProblem(file)
  if (problem) return { ok: false, error: problem }

  try {
    const bytes = new Uint8Array(await (file as File).arrayBuffer())
    const sheets = await inspectWorkbook(bytes)
    return { ok: true, sheets, quota: await remainingFor(member.workspaceId) }
  } catch (cause) {
    return { ok: false, error: readFailure(cause) }
  }
}

/** Строки выбранных листов. Заблокированный лист приезжает без строк. */
export async function readSheetsAction(form: FormData): Promise<ReadSheetsResult> {
  const member = await requireMember()

  const file = form.get('file')
  const problem = fileProblem(file)
  if (problem) return { ok: false, error: problem }

  const raw = form.get('sheets')
  let names: string[]
  try {
    const parsed: unknown = JSON.parse(typeof raw === 'string' ? raw : '[]')
    names = Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === 'string') : []
  } catch {
    names = []
  }
  if (names.length === 0) return { ok: false, error: 'Не выбран ни один лист' }

  try {
    const bytes = new Uint8Array(await (file as File).arrayBuffer())
    const sheets = await readSheets(bytes, names)
    return { ok: true, sheets, quota: await remainingFor(member.workspaceId) }
  } catch (cause) {
    return { ok: false, error: readFailure(cause) }
  }
}

/** Расход для сводки, когда книги не было: файл CSV разбирается в браузере. */
export async function quotaAction(): Promise<Quota> {
  const member = await requireMember()
  return remainingFor(member.workspaceId)
}

export type { Destination, ImportSheetInput, SheetOutcome } from '@/lib/import-run'

/**
 * Записать один лист.
 *
 * Здесь остаются права и обновление страниц — всё, что умеет только Next.
 * Сама запись живёт в `lib/import-run.ts`: её нужно проверять двумя
 * одновременными вызовами, а серверное действие в тест не затащить.
 */
export async function importSheetAction(input: ImportSheetInput): Promise<SheetOutcome> {
  const auth =
    input.destination.kind === 'new'
      ? await authorizeWorkspace()
      : await authorizeTable(input.destination.tableId)
  if (!auth.ok) return auth
  if(restrictedTables(auth.member))return {ok:false,error:'Импорт выполняет участник с полным доступом к пространству'}

  const outcome = await runSheetImport(input, {
    workspaceId: auth.member.workspaceId,
    userId: auth.member.userId,
  })

  if (outcome.ok && !outcome.repeat) {
    if (input.destination.kind === 'new') revalidatePath('/', 'page')
    else revalidatePath('/t/[tableId]', 'page')
    if (outcome.tableId) publishTable(outcome.tableId, 'rows')
  }

  return outcome
}
