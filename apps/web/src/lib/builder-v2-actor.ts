import type { AppV2, AppV2Actor } from '@tableapp/schema/app-v2'
import type { Member } from './session'

/** Roles come from the saved app and a verified workspace identity, never from a request. */
export function builderV2MemberActor(app: AppV2, member: Member): AppV2Actor {
  const email = member.email.trim().toLowerCase()
  const entry = app.authentication.members.find(entry => entry.email.trim().toLowerCase() === email)
  return { authenticated: true, id: member.userId, email, name: member.name, company: entry?.company ?? '', roleIds: entry?.roleIds ?? (app.authentication.mode === 'verified_email' && app.authentication.defaultRoleId ? [app.authentication.defaultRoleId] : []) }
}
