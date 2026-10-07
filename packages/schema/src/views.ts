import { z } from 'zod'
import { filterGroupSchema, groupBySchema, sortSchema } from './filters'

/**
 * Представление — центральный объект продукта.
 * Одно и то же представление рендерится и в редакторе базы (грид, канбан,
 * календарь, галерея), и в мобильном приложении (список, плитка, карточка, форма).
 * Движок фильтрации и сортировки поэтому один на обе половины.
 */
export const VIEW_TYPES = ['grid', 'kanban', 'calendar', 'gallery'] as const
export type ViewType = (typeof VIEW_TYPES)[number]

const baseConfig = {
  filter: filterGroupSchema,
  sorts: z.array(sortSchema).default([]),
  groupBy: z.array(groupBySchema).max(3).default([]),
  /** Порядок полей в представлении; поля, которых тут нет, идут следом в порядке таблицы. */
  fieldOrder: z.array(z.string()).default([]),
  hiddenFieldIds: z.array(z.string()).default([]),
}

export const gridConfigSchema = z.object({
  ...baseConfig,
  rowHeight: z.enum(['short', 'medium', 'tall', 'extra']).default('short'),
  fieldWidths: z.record(z.string(), z.number().int().min(60).max(800)).default({}),
  frozenFieldCount: z.number().int().min(0).max(5).default(1),
})

export const kanbanConfigSchema = z.object({
  ...baseConfig,
  /** Поле одиночного выбора или связи, по которому строятся колонки. */
  stackFieldId: z.string().nullable().default(null),
  coverFieldId: z.string().nullable().default(null),
  hiddenStackIds: z.array(z.string()).default([]),
})

export const calendarConfigSchema = z.object({
  ...baseConfig,
  dateFieldId: z.string().nullable().default(null),
  endDateFieldId: z.string().nullable().default(null),
  mode: z.enum(['month', 'week']).default('month'),
})

export const galleryConfigSchema = z.object({
  ...baseConfig,
  coverFieldId: z.string().nullable().default(null),
  coverFit: z.enum(['cover', 'contain']).default('cover'),
  cardSize: z.enum(['small', 'medium', 'large']).default('medium'),
})

const viewBase = {
  id: z.string(),
  tableId: z.string(),
  name: z.string().min(1).max(200),
  position: z.string(),
}

export const viewSchema = z.discriminatedUnion('type', [
  z.object({ ...viewBase, type: z.literal('grid'), config: gridConfigSchema }),
  z.object({ ...viewBase, type: z.literal('kanban'), config: kanbanConfigSchema }),
  z.object({ ...viewBase, type: z.literal('calendar'), config: calendarConfigSchema }),
  z.object({ ...viewBase, type: z.literal('gallery'), config: galleryConfigSchema }),
])

export type View = z.infer<typeof viewSchema>
export type ViewOf<T extends ViewType> = Extract<View, { type: T }>
export type ViewConfig = View['config']

/** Null was the legacy representation of no filter; malformed groups still fail validation. */
export function normalizeView(value: { id: string; tableId: string; name: string; position: string; type: string; config: unknown }): View {
  if (!value.config || typeof value.config !== 'object' || Array.isArray(value.config)) return viewSchema.parse(value)
  const config = value.config as Record<string, unknown>
  return viewSchema.parse({ ...value, config: { ...config,
    ...(value.type === 'grid' && config.fieldWidths === undefined && config.columnWidths !== undefined ? { fieldWidths: config.columnWidths } : {}),
    filter: config.filter == null ? { id: `default:${value.id}`, conjunction: 'and', conditions: [] } : config.filter } })
}

export const VIEW_CONFIG_SCHEMA = {
  grid: gridConfigSchema,
  kanban: kanbanConfigSchema,
  calendar: calendarConfigSchema,
  gallery: galleryConfigSchema,
} as const satisfies Record<ViewType, z.ZodType>

export function defaultViewConfig(type: ViewType, filterId: string): ViewConfig {
  const filter = { id: filterId, conjunction: 'and' as const, conditions: [] }
  return VIEW_CONFIG_SCHEMA[type].parse({ filter }) as ViewConfig
}
