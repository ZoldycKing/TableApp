import {validateBuilderV2Attachments} from './builder-v2-attachment-values'
import { rows } from '@tableapp/db'
import { isComputed, parseCellValue } from '@tableapp/schema'
import type { AppV2Json,AppV2,AppV2Actor } from '@tableapp/schema/app-v2'
import {canReadPublishedV2Row} from './builder-v2-published-rows'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { BuilderV2ReadMetadata } from './builder-v2-row-data'
import { BUILDER_V2_FORM_TYPES } from './builder-v2-form-types'
import { RowWriteError } from './row-mutations'

/** Later writes need the same type/choice/relation checks as the original form. */
export async function builderV2WorkflowValues(meta: BuilderV2ReadMetadata, tableId: string, values: Record<string, AppV2Json>, access?:{app:AppV2;actor:AppV2Actor}): Promise<Record<string, AppV2Json>> {
  const result: Record<string, AppV2Json> = {}
  for (const [id, value] of Object.entries(values)) {
    const field = meta.fieldsByTable.get(tableId)?.find(field => field.id === id)
    if (!field || isComputed(field.type) || !BUILDER_V2_FORM_TYPES.includes(field.type)) throw new RowWriteError('invalid', 'Выбрано недоступное поле для записи')
    let parsed: unknown
    try { parsed = parseCellValue(field, value) } catch { throw new RowWriteError('invalid', `Проверьте значение поля «${field.name}»`) }
    await validateBuilderV2Attachments(field,parsed,meta.runner)
    const blank = parsed === null || parsed === undefined || parsed === '' || Array.isArray(parsed) && !parsed.length
    if (!blank && (field.type === 'single_select' || field.type === 'multi_select')) {
      if ((Array.isArray(parsed) ? parsed : [parsed]).some(id => !field.options.choices.some(choice => choice.id === id))) throw new RowWriteError('invalid', `Поле «${field.name}»: выберите значение из списка`)
    }
    if (!blank && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(parsed))) throw new RowWriteError('invalid', `Поле «${field.name}»: проверьте почту`)
    if (!blank && field.type === 'url') { try { if (!['http:', 'https:'].includes(new URL(String(parsed)).protocol)) throw new Error() } catch { throw new RowWriteError('invalid', `Поле «${field.name}»: укажите HTTP или HTTPS ссылку`) } }
    if (field.type === 'relation') {
      const ids = Array.isArray(parsed) ? parsed as string[] : []
      if (!meta.fieldsByTable.has(field.options.tableId) || !field.options.allowMultiple && ids.length > 1 || new Set(ids).size !== ids.length) throw new RowWriteError('denied', `Поле «${field.name}»: связь недоступна`)
      const found = ids.length ? await meta.runner.select().from(rows).where(and(eq(rows.tableId, field.options.tableId), inArray(rows.id, ids), isNull(rows.deletedAt))) : []
      if (found.length !== ids.length || access&&found.some(row=>!canReadPublishedV2Row(access.app,access.actor,row as import('./runtime-project').RuntimeSourceRow))) throw new RowWriteError('denied', `Поле «${field.name}»: связанная запись удалена или недоступна`)
    }
    result[id] = parsed as AppV2Json
  }
  return result
}
