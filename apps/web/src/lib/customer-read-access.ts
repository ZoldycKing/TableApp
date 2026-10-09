import type { App } from '@tableapp/schema'
import { ANONYMOUS, type Visitor } from './app-roles'
import { rulesFor } from './row-access'

/** Without ownership rules an external identity can read only the public showcase. */
export function readingVisitor(app: App, tableId: string, visitor: Visitor): Visitor {
  return visitor.enrolled && rulesFor(app, tableId, visitor).length === 0 ? ANONYMOUS : visitor
}
