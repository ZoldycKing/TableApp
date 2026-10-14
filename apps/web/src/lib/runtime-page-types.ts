/** Client-safe paging contracts. Queries only narrow the server's configured screens. */
export const RUNTIME_PAGE_SIZE = 40
export const RUNTIME_SCAN_BATCH = 200
export type RuntimePageQuery = { query: string; choiceId: string | null; bookingSection?: 'upcoming' | 'history'; customerSection?: 'active' | 'history' }
export type RuntimePageRequest = Partial<RuntimePageQuery>
export type CollectionPage = {
  key: string
  next: string | null
  total: number
  matched: number
  choiceCounts: Record<string, number>
  sectionCounts: Record<string, number>
  asOf: number
  dataRevision: string
}
export function runtimeQuery(request: RuntimePageRequest = {}): RuntimePageQuery {
  return { query: (request.query ?? '').trim().toLowerCase(), choiceId: request.choiceId ?? null,
    ...(request.bookingSection ? { bookingSection: request.bookingSection } : {}),
    ...(request.customerSection ? { customerSection: request.customerSection } : {}) }
}
export const runtimeQueryKey = (request: RuntimePageRequest = {}) => JSON.stringify(runtimeQuery(request))
