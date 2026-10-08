import { z } from 'zod'
import { APP_TIME_ZONE, validTimeZone } from './time'
import { COLORS } from './colors'

/**
 * Типы полей. Разделены на три группы:
 *  - вводимые пользователем,
 *  - ссылочные (связь),
 *  - вычисляемые и системные (редактированию не подлежат).
 */
export const INPUT_FIELD_TYPES = [
  'text',
  'long_text',
  'number',
  'date',
  'datetime',
  'checkbox',
  'single_select',
  'multi_select',
  'attachment',
  'image',
  'email',
  'phone',
  'url',
  'member',
] as const

export const RELATION_FIELD_TYPES = ['relation'] as const

export const COMPUTED_FIELD_TYPES = [
  'formula',
  'lookup',
  'rollup',
  'count',
  'created_time',
  'updated_time',
  'created_by',
  'updated_by',
  'row_id',
] as const

export const FIELD_TYPES = [
  ...INPUT_FIELD_TYPES,
  ...RELATION_FIELD_TYPES,
  ...COMPUTED_FIELD_TYPES,
] as const

export type FieldType = (typeof FIELD_TYPES)[number]
export type ComputedFieldType = (typeof COMPUTED_FIELD_TYPES)[number]

const COMPUTED = new Set<string>(COMPUTED_FIELD_TYPES)

/** Вычисляемые и системные поля нельзя записать напрямую — только пересчитать. */
export function isComputed(type: FieldType): type is ComputedFieldType {
  return COMPUTED.has(type)
}

// --- Настройки полей ---------------------------------------------------------

export const choiceSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  color: z.enum(COLORS).default('gray'),
})
export type Choice = z.infer<typeof choiceSchema>

export const dateFormatSchema = z.preprocess((value) =>
  value === 'dd.MM.yyyy' || value === 'dd.MM.yyyy HH:mm' ? 'ru' : value,
  z.enum(['ru', 'iso', 'us', 'friendly']).default('ru'))
export const rollupFnSchema = z.enum(['sum', 'count', 'min', 'max', 'avg', 'and', 'or', 'concat'])
export type RollupFn = z.infer<typeof rollupFnSchema>

const empty = z.object({}).prefault({})

export const FIELD_OPTIONS = {
  text: empty,
  long_text: z.object({ richText: z.boolean().default(false) }).prefault({}),
  number: z
    .object({
      format: z.enum(['plain', 'currency', 'percent']).default('plain'),
      precision: z.number().int().min(0).max(8).default(0),
      currency: z.string().default('RUB'),
      showThousandsSeparator: z.boolean().default(true),
      /** Copy a related numeric value once when this cell is empty. Stored prices stay independent of the price list. */
      initialFrom: z.object({ relationFieldId: z.string(), targetFieldId: z.string() }).optional(),
    })
    .prefault({}),
  date: z.object({ dateFormat: dateFormatSchema }).prefault({}),
  datetime: z
    .object({
      dateFormat: dateFormatSchema,
      timeFormat: z.enum(['12', '24']).default('24'),
      timeZone: z.string().refine(validTimeZone, 'Неизвестный часовой пояс').default(APP_TIME_ZONE),
    })
    .prefault({}),
  checkbox: empty,
  single_select: z.object({ choices: z.array(choiceSchema).default([]) }).prefault({}),
  multi_select: z.object({ choices: z.array(choiceSchema).default([]) }).prefault({}),
  attachment: z.object({ maxCount: z.number().int().min(1).max(20).default(10) }).prefault({}),
  image: z.object({ maxCount: z.number().int().min(1).max(20).default(1) }).prefault({}),
  email: empty,
  phone: empty,
  url: empty,
  member: z.object({ allowMultiple: z.boolean().default(false) }).prefault({}),

  relation: z.object({
    /** Таблица, на строки которой ссылается поле. */
    tableId: z.string(),
    allowMultiple: z.boolean().default(false),
    /** Обратное поле в целевой таблице, если связь двусторонняя. */
    symmetricFieldId: z.string().nullable().default(null),
  }),

  formula: z.object({
    expression: z.string().default(''),
    /** Тип результата выводится при сохранении и кэшируется для рендеринга. */
    resultType: z.enum(['text', 'number', 'checkbox', 'date', 'unknown']).default('unknown'),
  }),
  lookup: z.object({
    relationFieldId: z.string(),
    targetFieldId: z.string(),
  }),
  rollup: z.object({
    relationFieldId: z.string(),
    targetFieldId: z.string(),
    fn: rollupFnSchema,
  }),
  count: z.object({ relationFieldId: z.string() }),

  created_time: z.object({ dateFormat: dateFormatSchema }).prefault({}),
  updated_time: z.object({ dateFormat: dateFormatSchema }).prefault({}),
  created_by: empty,
  updated_by: empty,
  row_id: empty,
} as const satisfies Record<FieldType, z.ZodType>

export type FieldOptions<T extends FieldType> = z.infer<(typeof FIELD_OPTIONS)[T]>

// --- Поле --------------------------------------------------------------------

const fieldBase = {
  id: z.string(),
  tableId: z.string(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().default(null),
  /** Дробный индекс для перетаскивания колонок без переиндексации соседей. */
  position: z.string(),
}

function variant<T extends FieldType>(type: T) {
  return z.object({ ...fieldBase, type: z.literal(type), options: FIELD_OPTIONS[type] })
}

export const fieldSchema = z.discriminatedUnion('type', [
  variant('text'),
  variant('long_text'),
  variant('number'),
  variant('date'),
  variant('datetime'),
  variant('checkbox'),
  variant('single_select'),
  variant('multi_select'),
  variant('attachment'),
  variant('image'),
  variant('email'),
  variant('phone'),
  variant('url'),
  variant('member'),
  variant('relation'),
  variant('formula'),
  variant('lookup'),
  variant('rollup'),
  variant('count'),
  variant('created_time'),
  variant('updated_time'),
  variant('created_by'),
  variant('updated_by'),
  variant('row_id'),
])

export type Field = z.infer<typeof fieldSchema>
export type FieldOf<T extends FieldType> = Extract<Field, { type: T }>

/** Поля, пригодные на роль первичного (отображаются как заголовок строки). */
export const PRIMARY_FIELD_TYPES: readonly FieldType[] = [
  'text',
  'long_text',
  'number',
  'date',
  'datetime',
  'email',
  'phone',
  'url',
  'formula',
]

export function canBePrimary(type: FieldType): boolean {
  return PRIMARY_FIELD_TYPES.includes(type)
}

/**
 * Настройки поля, дополненные значениями по умолчанию.
 * Поля создаются в разных местах (импорт, конструктор, сид), и каждое из них
 * не должно помнить, что у числа есть precision, а у даты — формат.
 */
export function normalizeFieldOptions(type: FieldType, options: unknown = {}): Record<string, unknown> {
  const safeOptions = type === 'datetime' && options && typeof options === 'object'
    ? { ...options, timeZone: typeof (options as { timeZone?: unknown }).timeZone === 'string' &&
      validTimeZone((options as { timeZone: string }).timeZone) ? (options as { timeZone: string }).timeZone : APP_TIME_ZONE }
    : options ?? {}
  const parsed = FIELD_OPTIONS[type].safeParse(safeOptions)
  if (parsed.success) return parsed.data as Record<string, unknown>
  // Ссылочные типы требуют обязательных настроек — их дополнить нечем.
  return (options ?? {}) as Record<string, unknown>
}
