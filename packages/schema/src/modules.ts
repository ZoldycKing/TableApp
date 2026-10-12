import { z } from 'zod'

export const MODULE_KINDS = ['booking', 'sales', 'requests', 'delivery', 'repair', 'property', 'field_service', 'crm', 'support', 'inventory', 'production'] as const
export type ModuleKind = typeof MODULE_KINDS[number]

/** Engines with independent resources that can share one client application. */
export const COMPOSABLE_MODULE_KINDS: readonly ModuleKind[] = ['booking', 'sales', 'requests', 'delivery', 'repair', 'property', 'field_service', 'crm', 'support']
export function compatibleModuleKinds(kinds: readonly ModuleKind[]): boolean {
  const independent = kinds.filter(kind => kind !== 'support')
  return kinds.every(kind => COMPOSABLE_MODULE_KINDS.includes(kind)) && new Set(independent).size === independent.length
}

const reference = z.string().min(1).max(200)
export const moduleSourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('booking') }).strict(),
  z.object({ type: z.literal('customer'), tableId: reference }).strict(),
  z.object({ type: z.literal('inventory') }).strict(),
  z.object({ type: z.literal('production') }).strict(),
])

/** Ownership and draft/publication state come from the enclosing App, never from client-supplied tenant IDs. */
export const appModuleSchema = z.object({
  id: reference,
  kind: z.enum(MODULE_KINDS),
  version: z.number().int().positive(),
  source: moduleSourceSchema,
  dependsOn: z.array(reference).max(20).default([]),
  /** Explicit resource ownership and private roles are required when module access is enabled. */
  screenIds: z.array(reference).max(100).optional(),
  roles: z.record(reference, reference).optional(),
  intakeEnabled: z.boolean().optional(),
}).strict()
export type AppModule = z.infer<typeof appModuleSchema>

export const moduleAccessSchema = z.object({
  grants: z.array(z.object({ email: z.email().max(254), moduleId: reference, roleId: reference }).strict()).max(500),
}).strict()
export type ModuleAccess = z.infer<typeof moduleAccessSchema>

/** Version 1 refers to existing engine settings; it does not store a second copy of business rules or grant roles. */
export const MODULE_DEFINITIONS = {
  booking: { name: 'Запись на услуги', engine: 'booking', version: 1 },
  sales: { name: 'Каталог и заказы', engine: 'customer', version: 1 },
  requests: { name: 'Заявки на услуги', engine: 'customer', version: 1 },
  delivery: { name: 'Доставка', engine: 'customer', version: 1 },
  repair: { name: 'Ремонт', engine: 'customer', version: 1 },
  property: { name: 'Просмотры недвижимости', engine: 'customer', version: 1 },
  field_service: { name: 'Заявки и выезды', engine: 'customer', version: 1 },
  crm: { name: 'Клиенты и сделки', engine: 'customer', version: 1 },
  support: { name: 'Вопросы по своим обращениям', engine: 'customer', version: 1 },
  inventory: { name: 'Складской учёт', engine: 'inventory', version: 1 },
  production: { name: 'Производство', engine: 'production', version: 1 },
} as const satisfies Record<ModuleKind, { name: string; engine: AppModule['source']['type']; version: number }>
