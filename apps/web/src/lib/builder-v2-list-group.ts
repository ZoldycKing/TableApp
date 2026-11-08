import { fieldTimeZone, type Field } from '@tableapp/schema'
import { appV2ListGroupFieldTypes, type AppV2Node } from '@tableapp/schema/app-v2'
import { builderCalendarDate } from './builder-v2-calendar'
import type { BuilderV2CollectionGroup } from './builder-v2-data-types'
import { RowWriteError } from './row-mutations'

export type BuilderV2ListGroup = BuilderV2CollectionGroup & { rank: number }
const collator = new Intl.Collator('ru')
const empty: BuilderV2ListGroup = { key: 'empty', label: 'Без значения', rank: Infinity }

export function builderV2ListGrouping(node: AppV2Node, fields: readonly Field[]) {
  if (node.type !== 'collection' || !node.listGroupFieldId) return null
  const field = fields.find(field => field.id === node.listGroupFieldId)
  if (!field || !appV2ListGroupFieldTypes.has(field.type) || node.layout === 'calendar' || node.layout === 'kanban') {
    throw new RowWriteError('invalid', 'Выберите другое поле для группировки списка')
  }
  const choiceIds = field.type === 'single_select' ? field.options.choices.map(choice => choice.id) : null
  const choices = new Map<string, BuilderV2ListGroup>()
  if (field.type === 'single_select') field.options.choices.forEach((choice, index) => {
    if (!choices.has(choice.id)) choices.set(choice.id, { key: `choice:${choice.id}`, label: choice.name, rank: index + 1 })
  })
  const timeZone = fieldTimeZone(field)
  return { fieldId: field.id, choiceIds, value(value: unknown): BuilderV2ListGroup {
    if (value === null || value === undefined || value === '') return empty
    switch (field.type) {
      case 'single_select': return choices.get(value as string) ?? { key: 'other', label: 'Другой вариант', rank: choiceIds!.length + 1 }
      case 'checkbox': return value === true ? { key: 'yes', label: 'Да', rank: 0 } : value === false ? { key: 'no', label: 'Нет', rank: 1 } : empty
      case 'date':
      case 'datetime': {
        const day = builderCalendarDate(value, field.type, timeZone)
        return day ? { key: day, label: day.split('-').reverse().join('.'), rank: 0 } : empty
      }
      default: {
        const text = typeof value === 'string' ? value.trim() : ''
        return text ? { key: `text:${text}`, label: text, rank: 0 } : empty
      }
    }
  } }
}

export function compareBuilderV2ListGroups(a?: BuilderV2ListGroup, b?: BuilderV2ListGroup) {
  if (!a || !b || a.key === b.key) return 0
  return a.rank - b.rank || collator.compare(a.key, b.key) || (a.key < b.key ? -1 : 1)
}
