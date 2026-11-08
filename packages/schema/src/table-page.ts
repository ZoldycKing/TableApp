import { z } from 'zod'

export const editorPageRequestSchema = z.object({
  offset: z.number().int().min(0).max(10_000_000).default(0),
  mode: z.enum(['grid', 'records']).default('records'),
  viewId: z.string().max(200).optional(),
  search: z.string().max(500).default(''),
  config: z.record(z.string(), z.unknown()).optional(),
  rowId: z.string().max(200).optional(),
})
export type EditorPageRequest = z.infer<typeof editorPageRequestSchema>
