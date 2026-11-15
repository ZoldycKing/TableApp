import { z } from 'zod'
import { appV2IdSchema as id } from './values'

const source = { tableId: id, viewId: id.nullable().default(null) }
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value&&Number(value.slice(0,4))>0})
export const appV2TeamCalendarRequestSchema = z.strictObject({ screenId: id, nodeId: id, day: calendarDay, week:z.boolean(),recordId:id.optional() })
export const appV2PublishedTeamCalendarRequestSchema = appV2TeamCalendarRequestSchema.extend({revision:z.string().min(1).max(200)})
export const appV2TeamCalendarMoveSchema = z.strictObject({ screenId: id, nodeId: id, eventId: id, resourceId: id, day: calendarDay, time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })
export const appV2PublishedTeamCalendarMoveSchema = appV2TeamCalendarMoveSchema.extend({ revision: z.string().min(1).max(200) })
export const appV2TeamCalendarDataSchema = z.strictObject({
  ...source, titleFieldId: id, subtitleFieldId: id.nullable().default(null),
  startFieldId: id, durationFieldId: id.nullable().default(null), endFieldId: id.nullable().default(null),
  resourceFieldId: id, statusFieldId: id.nullable().default(null), amountFieldId: id.nullable().default(null),
  statusValues: z.strictObject({ booked: id.optional(), arrived: id.optional(), completed: id.optional(), noShow: id.optional(), cancelled: id.optional() }).default({}),
  resources: z.strictObject({ ...source, titleFieldId: id, photoFieldId: id.nullable().default(null), ownerEmailFieldId: id.nullable().default(null) }),
  hours: z.strictObject({
    ...source, resourceFieldId: id, weekdayFieldId: id.nullable().default(null),
    weekdays: z.array(z.string().max(128)).length(7), dateFieldId: id.nullable().default(null),
    startFieldId: id, endFieldId: id, closedFieldId: id.nullable().default(null),
  }).nullable().default(null),
})
export type AppV2TeamCalendarData = z.infer<typeof appV2TeamCalendarDataSchema>
export const appV2TeamCalendarShape = {
  data: appV2TeamCalendarDataSchema.nullable(),
  resourceLabel: z.string().min(1).max(40).default('Сотрудник'),
  resourcesLabel: z.string().min(1).max(40).default('Сотрудники'),
  showMetrics: z.boolean().default(true),
  defaultView: z.enum(['list', 'day', 'week']).default('day'),
  actions: z.strictObject({
    itemScreenId: id.nullable(), createScreenId: id.nullable(), configureScreenId: id.nullable(), periodScreenId: id.nullable(),
    manageRoleIds: z.array(id).max(100),
    /** Desktop drag onto another time or employee. Authors can turn it off; older calendars stay movable. */
    allowMove: z.boolean().default(true),
  }),
}
