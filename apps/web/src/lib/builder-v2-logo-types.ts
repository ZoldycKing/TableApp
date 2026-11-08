import type { AppV2 } from '@tableapp/schema/app-v2'

export const BUILDER_V2_LOGO_MAX_BYTES = 2 * 1024 * 1024
export const BUILDER_V2_LOGO_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const
export const BUILDER_V2_LOGO_PREFIX = 'builder-logo.'
const logoKeyPattern = /^[a-zA-Z0-9_-]+\/builder-logo\.([a-zA-Z0-9_-]{1,128})\.[a-f0-9]{32}$/

export function isBuilderV2LogoKey(key: string): boolean {
  return logoKeyPattern.test(key)
}

export function belongsToBuilderV2Logo(key: string, workspaceId: string, appId: string): boolean {
  return key.startsWith(`${workspaceId}/`) && logoKeyPattern.exec(key)?.[1] === appId
}

export function builderV2LogoUrl(app: Pick<AppV2, 'id' | 'workspaceId' | 'theme'>, draft = false) {
  const key = app.theme.logoKey
  if (!key || !belongsToBuilderV2Logo(key, app.workspaceId, app.id)) return undefined
  const params = new URLSearchParams({ key, ...(draft ? { draft: '1' } : {}) })
  return `/api/builder-v2/logo/${encodeURIComponent(app.id)}?${params}`
}
