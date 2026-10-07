import { applyView, visibleFields } from '@/lib/apply-view'
import { loadTable } from '@/lib/queries'
import { requireMember } from '@/lib/session'
import {
  EXPORT_MIME,
  buildCsv,
  buildGrid,
  exportFileName,
  isExportFormat,
  type ExportFormat,
} from '@/lib/table-export'

/**
 * Выгрузка таблицы владельцем.
 *
 * Раньше файл собирался прямо в браузере: строки там уже были, и лишний поход
 * на сервер ничего бы не уточнил. Для CSV это работало, а книгу Excel так
 * не собрать — библиотека тянет за собой узловые модули и в браузерной сборке
 * оборачивается полифилами ради одной кнопки.
 *
 * Держать один формат здесь, а другой там — верный способ получить два файла
 * с разным содержимым и не суметь объяснить, какой из них правильный. Поэтому
 * оба собираются здесь.
 *
 * Выгружается то, что человек видит: представление задаёт отбор, сортировку
 * и набор колонок, а `q` — строку поиска, которую он набрал и никуда
 * не сохранял.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tableId: string }> },
): Promise<Response> {
  const member = await requireMember()
  const { tableId } = await params
  const url = new URL(request.url)

  const asked = url.searchParams.get('format') ?? 'csv'
  const format: ExportFormat = isExportFormat(asked) ? asked : 'csv'
  const search = url.searchParams.get('q') ?? ''
  const viewId = url.searchParams.get('view') ?? ''

  // Проверка та же, что у страницы таблицы: чужое пространство не откроется.
  const table = await loadTable(tableId, member.workspaceId)
  if (!table) return new Response('Таблица не найдена', { status: 404 })

  const view = table.views.find((item) => item.id === viewId) ?? table.views[0]
  if (!view) return new Response('У таблицы нет ни одного представления', { status: 404 })

  const applied = applyView(table.rows, table.fields, view.config, search)
  const fields = visibleFields(table.fields, view.config)
  const name = exportFileName(table.name, view.name, format)

  const body =
    format === 'xlsx'
      ? await asWorkbook(`${table.name} — ${view.name}`, fields, applied.rows, table.relatedTitles)
      : buildCsv(fields, applied.rows, table.relatedTitles)

  return new Response(body as BodyInit, {
    headers: {
      'content-type': EXPORT_MIME[format],
      'content-disposition': `attachment; filename="export.${format}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'private, no-store',
    },
  })
}

/** Книга собирается тут, чтобы `exceljs` не попала в браузерную сборку. */
async function asWorkbook(
  name: string,
  fields: Parameters<typeof buildGrid>[0],
  rows: Parameters<typeof buildGrid>[1],
  titles: Parameters<typeof buildGrid>[2],
): Promise<Uint8Array> {
  const { writeXlsx } = await import('@tableapp/import')
  const grid = buildGrid(fields, rows, titles)
  return writeXlsx({ name, header: grid.header, rows: grid.rows })
}
