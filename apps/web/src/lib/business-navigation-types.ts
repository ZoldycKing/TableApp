import type { MemberRole } from './roles'

/** Only metadata needed by the owner sidebar; no rows, drafts or contacts. */
export type BusinessNavigation = {
  workspaceId: string
  workspaceName: string
  businessName: string
  role: MemberRole
  tables: { id: string; name: string; icon: string }[]
  apps: { id: string; name: string; published: boolean }[]
}

export type BusinessResourceDestination =
  | { kind: 'table' | 'app'; id: string }
  | { kind: 'tables' | 'apps' | 'home' | 'messages' | 'team' | 'usage' | 'templates'; id?: never }

export type BusinessNavigationResult = { ok: true; href: string } | { ok: false; error: string }
