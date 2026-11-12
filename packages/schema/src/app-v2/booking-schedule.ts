import { z } from 'zod'

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/)
export const bookingScheduleInputSchema = z.strictObject({
  masterId: id, mode: z.enum(['weekly', 'date']), weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  date: z.string().max(10), start: z.string().max(5), end: z.string().max(5), closed: z.boolean(), breakStart: z.string().max(5), breakEnd: z.string().max(5),
})
export const bookingScheduleScopeSchema = z.strictObject({ screenId: id, formId: id, recordId: id.optional() })
export const bookingScheduleRequestSchema = bookingScheduleScopeSchema.extend({
  revision: z.string().min(1).max(200), fingerprint: z.string().min(1).max(200), requestId: id, input: bookingScheduleInputSchema,
})
export type BookingScheduleInput = z.infer<typeof bookingScheduleInputSchema>
export type BookingScheduleScope = z.infer<typeof bookingScheduleScopeSchema>
export type BookingScheduleRequest = z.infer<typeof bookingScheduleRequestSchema>
