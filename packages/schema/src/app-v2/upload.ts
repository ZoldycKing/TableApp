import {z} from 'zod'
import {appV2IdSchema} from './values'

const scope={formId:appV2IdSchema,screenId:appV2IdSchema,recordId:appV2IdSchema.optional(),fieldId:appV2IdSchema,revision:z.string().regex(/^[a-f0-9]{64}$/),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}
export const appV2UploadContextSchema=z.discriminatedUnion('kind',[
  z.strictObject({...scope,kind:z.literal('working'),appId:appV2IdSchema}),
  z.strictObject({...scope,kind:z.literal('published'),slug:z.string().min(1).max(200)}),
])
export type AppV2UploadContext=z.infer<typeof appV2UploadContextSchema>
