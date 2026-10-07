import { visibleFields } from '@/lib/apply-view'
import { currentAppAccess } from '@/lib/app-session'
import { loadAppMeta, loadPublishedApp } from '@/lib/app-runtime'
import {
  EXPORT_MIME,
  buildCsv,
  buildGrid,
  exportFileName,
  isExportFormat,
  type ExportFormat,
} from '@/lib/table-export'

/**
 * Выгрузка списка из приложения.
 *
 * Уходит человеку ровно то, что он видит на экране: те же строки, тот же
 * порядок, те же колонки. Ничего нового здесь не открывается — и это главное
 * свойство, а не оговорка.
 *
 * Поэтому файл собирается из `loadPublishedApp`, а не из своего запроса
 * к базе. Отдельный запрос означал бы вторую копию правил доступа, и однажды
 * она разошлась бы с первой: выгрузка тем и опасна, что расхождение в ней
 * никто не увидит на экране — его увидят в чужом файле.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params
  const url = new URL(request.url)
  const screenId = url.searchParams.get('e') ?? ''
  const asked = url.searchParams.get('format') ?? 'csv'
  const format: ExportFormat = isExportFormat(asked) ? asked : 'csv'

  const meta = await loadAppMeta(slug)
  if (!meta) return new Response('Приложение не опубликовано', { status: 404 })

  const { visitor } = await currentAppAccess(meta.app)

  /*
   * Выгружает только вошедший.
   *
   * Не потому, что посторонний увидел бы лишнее — увидел бы ровно витрину,
   * которую владелец и открыл. Но «забрать свои данные» и «скачать чужой
   * каталог одним нажатием» — разные вещи, и второго владелец, ставя галочку
   * «видно без входа», не выбирал. Заказать с витрины по-прежнему можно
   * без входа: там человек оставляет своё, а не забирает чужое.
   */
  if (!visitor.authenticated) {
    return new Response('Чтобы выгрузить список, войдите в приложение', { status: 403 })
  }

  const runtime = await loadPublishedApp(slug, visitor)
  if (!runtime) return new Response('Приложение не опубликовано', { status: 404 })

  /*
   * Экран ищем среди тех, что человеку открыты: `loadPublishedApp` уже убрал
   * закрытые. Чужой идентификатор здесь просто не находится — отдельной
   * проверки прав не нужно, и это тот случай, когда её отсутствие
   * не упущение, а следствие.
   */
  const screen = runtime.app.screens.find((item) => item.id === screenId)
  if (!screen || (screen.type !== 'list' && screen.type !== 'tiles')) {
    return new Response('Этот экран нечего выгружать', { status: 404 })
  }

  const view = runtime.views[screen.source.viewId]
  const table = view ? runtime.tables[view.tableId] : undefined
  if (!view || !table) return new Response('Список не настроен', { status: 404 })

  // Порядок и отбор уже посчитаны сервером при сборке приложения.
  const byId = new Map(table.rows.map((row) => [row.id, row]))
  const rows = (runtime.screens[screen.id]?.rowIds ?? [])
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)

  // Колонки — те же, что показывает список: `table.fields` уже урезаны правами.
  const fields = visibleFields(table.fields, view.config)
  const name = exportFileName(screen.name || table.name, undefined, format)

  const body =
    format === 'xlsx'
      ? await asWorkbook(screen.name || table.name, fields, rows, runtime.relatedTitles)
      : buildCsv(fields, rows, runtime.relatedTitles)

  return new Response(body as BodyInit, {
    headers: {
      'content-type': EXPORT_MIME[format],
      // Имя по-русски: `filename*` понимают все живые браузеры, обычный
      // `filename` остаётся запасным на случай очень старого.
      'content-disposition': `attachment; filename="export.${format}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      // Выгрузка — это данные человека: в общий кэш она попасть не должна.
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
