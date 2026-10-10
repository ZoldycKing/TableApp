import { compileTableFormulas, computeDerivedRow, relatedIndexFrom } from '@tableapp/formula'
import { DEFAULT_APP_ROLES, newId, type Field, type View } from '@tableapp/schema'
import { generateApp } from '../app-builder'
import { formatCell } from '../format'
import { buildTemplate } from './build'
import { findTemplate } from './catalog'
import { templatePreset } from './presets'
import type { TemplateDef } from './types'

export function templateRoleNames(template: TemplateDef): string[] {
  if (template.customer) return ['Клиент', template.customer.workerName, template.customer.managerName]
  if (template.id === 'salon') return ['Клиент', 'Мастер', 'Администратор']
  if (template.id === 'zayavki') return ['Мастер', 'Диспетчер']
  if (template.inventory) return ['Кладовщик', 'Владелец']
  if (template.production) return [template.production.copy.director, template.production.copy.operator]
  return DEFAULT_APP_ROLES.map(role => role.name)
}

/** Synthetic examples use the same definitions, formulas and presets as installation. No database access. */
export function templateExample(id: string, now = new Date(), legacy = false) {
  const template = findTemplate(id, legacy)
  if (!template) throw new Error(`Нет шаблона ${id}`)
  const built = buildTemplate({ template, workspaceId: 'marketing-example', now })
  const fields = built.fields as Field[], views = built.views as unknown as View[]
  const byTable = new Map(built.tables.map(table => [table.id, fields.filter(field => field.tableId === table.id)]))
  const raw = new Map(built.tables.map(table => [table.id, new Map(built.rows.filter(row => row.tableId === table.id).map(row => [row.id, row.data]))]))
  const related = relatedIndexFrom(raw, byTable)
  const rows = built.rows.map(row => ({ ...row, data: computeDerivedRow(row.data, byTable.get(row.tableId)!, related,
    compileTableFormulas(byTable.get(row.tableId)!)) }))
  const main = built.tables.find(table => table.id === built.appTableId)!
  const generated = generateApp({ appId: newId('app'), workspaceId: main.workspaceId, name: built.appName,
    slug: `example-${id}`, table: main, fields: byTable.get(main.id)!, view: views.find(view => view.id === built.appViewId)! })
  const app = templatePreset(generated, built)
  const table = (key: string) => built.tables[template.tables.findIndex(item => item.key === key)]!
  const field = (tableKey: string, fieldKey: string) => {
    const definition = template.tables.find(item => item.key === tableKey)!
    return byTable.get(table(tableKey).id)![definition.fields.findIndex(item => item.key === fieldKey)]!
  }
  const text = (row: typeof rows[number], column: Field): string => {
    const value = row.data[column.id]
    if (column.type === 'relation') return (Array.isArray(value) ? value : []).map(rowId => {
      const target = rows.find(item => item.id === rowId)
      const primary = built.tables.find(item => item.id === column.options.tableId)?.primaryFieldId
      return target && primary ? String(target.data[primary] ?? '') : ''
    }).filter(Boolean).join(', ')
    if (column.type === 'lookup') {
      const target = fields.find(item => item.id === column.options.targetFieldId)
      return (Array.isArray(value) ? value : []).map(item => target ? formatCell(target, item) : String(item)).join(', ')
    }
    return formatCell(column, value)
  }
  return { template, built, app, fields, views, rows, byTable, table, field, text }
}

/** Access explanation is shared by template cards and detail pages. */
export function templateAccessNote(template: ReturnType<typeof findTemplate> & {}) {
  if (template.customer) return 'Гость видит каталог и карточки. После нажатия кнопки оформления подтверждает почту, затем заполняет данные и отправляет обращение. В кабинете доступны только свои активные обращения и история. Исполнитель видит назначенную ему работу; администратор управляет назначением и условиями оплаты.'
  if (template.id === 'salon') return 'Клиент открывает услугу, нажимает «Записаться» и подтверждает почту. Затем выбирает мастера и свободное время, вводит контакты и оформляет запись. В кабинете доступны свои посещения, отмена и перенос. Администратор настраивает прайс и расписание; сотрудник согласует оплату.'
  if (template.id === 'zayavki') return 'Диспетчер видит все заявки, назначает мастеров и ведёт оплату. Мастер видит только заявки со своей почтой и меняет статус, фото и комментарий. Добавьте сотрудников в список доступа; адреса мастеров в примерах нужно заменить настоящими.'
  if (template.portal) return 'Клиент видит заказы, где указана его почта. Сотрудники видят все заказы. Обращения пока доступны только в таблице владельца.'
  if (template.inventory) return 'Кладовщик принимает и выдаёт товары; списания и возвраты открывает через «Ещё действия». Инвентаризация, цены, сводка и журнал движений доступны владельцу. Список закупки находится в таблице владельца.'
  if (template.production) return 'Начальник смены вводит выпуск. Директор видит сводку, материалы и движения. Права этих ролей уже разделены.'
  return 'Рабочие экраны доступны сотрудникам и руководителю. Клиентские экраны по умолчанию закрыты: для них нужны отдельный сценарий и ограничения доступа к своим записям.'
}
