'use client'

import { useLiveRefresh } from './use-live-table'

export function useLiveApp(slug: string, enabled = true): void {
  useLiveRefresh(enabled ? `/api/app-live/${encodeURIComponent(slug)}` : null)
}
