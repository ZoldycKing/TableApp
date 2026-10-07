import { z } from 'zod'

const id = z.string().min(1).max(160)
const valueMap = z.record(z.string().min(1).max(160), z.unknown())
const common = { id, rowId: id, clientAt: z.iso.datetime({ offset: true }).optional() }
export const syncMutationSchema = z.discriminatedUnion('op', [
  z.object({ ...common, op: z.literal('create'), next: valueMap, base: z.unknown().optional(), queuedAt: z.number().optional(), tableId: id.optional() }).strict(),
  z.object({ ...common, op: z.literal('update'), fieldId: id, base: z.unknown().optional(), next: z.unknown(), queuedAt: z.number().optional(), tableId: id.optional() }).strict(),
  z.object({ ...common, op: z.literal('delete'), baseVersion: z.number().int().nonnegative().optional(), base: z.unknown().optional(), queuedAt: z.number().optional(), tableId: id.optional() }).strict(),
])
export const syncPayloadSchema = z.object({ tableId: id, deviceId: id, appSlug: id.optional(),
  since: z.string().max(2048).nullable().optional(), mutations: z.array(syncMutationSchema).max(200).default([]) }).strict()

const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const cursorSchema = z.object({ v: z.literal(2), scope: z.string().length(64), policy: z.string().length(64),
  seen: revision, after: revision, until: revision.optional(), snapshot: z.boolean().optional() }).strict()
export type SyncCursor = z.infer<typeof cursorSchema>
