import type { BuilderV2Table } from '@/lib/builder-v2'
import { v2Catalog } from '../../../../../../packages/schema/src/app-v2/fixture.test-utils'

export { appV2Fixture } from '../../../../../../packages/schema/src/app-v2/fixture.test-utils'
export const fixtureTables: BuilderV2Table[] = [...v2Catalog.tables.keys()].map(id => ({ id, name: id, primaryFieldId: [...v2Catalog.fields].find(([, field]) => field.tableId === id)?.[0] ?? null, fields: [...v2Catalog.fields].filter(([, field]) => field.tableId === id).map(([id, field]) => ({ id, name: id, type: field.type })), views: [...v2Catalog.views].filter(([, view]) => view.tableId === id).map(([id]) => ({ id, name: id })) }))

export const fixtureActor = { authenticated: true, roleIds: ['owner'], id: 'user_owner', email: 'owner@example.com', name: 'Анна', company: '' }
