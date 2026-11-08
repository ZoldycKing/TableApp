export const TABLE_PAGE_SIZE = 100
export { editorPageRequestSchema, type EditorPageRequest } from '@tableapp/schema'
export type EditorPage = {
  total: number; matched: number; offset: number; limit: number
  lastPosition: string | null; mode: 'grid' | 'records'; viewId: string; search: string
}
