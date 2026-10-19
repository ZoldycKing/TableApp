import { describe, expect, it } from 'vitest'
import { overviewNextAction, overviewPermissions, type BusinessOverviewData } from './business-overview-data'

const table = { id: 'table_own', name: 'Товары', icon: 'table', rowCount: 23, fieldCount: 4, updatedAt: '2026-10-19T00:00:00Z' }
const app = { id: 'app_own', name: 'Магазин', slug: 'shop', published: true, hasUnpublishedChanges: false, updatedAt: '2026-10-19T00:00:00Z' }
const base: BusinessOverviewData = {
  workspaceId: 'workspace_own', workspaceName: 'Внутреннее название', businessName: 'Магазин «Лист»',
  role: 'owner', profile: { name: 'Магазин «Лист»', location: '', phone: '' }, tables: [table], apps: [],
}

describe('business overview next steps', () => {
  it('starts with actual data instead of manufacturing progress', () => {
    expect(overviewNextAction({ ...base, tables: [] }).href).toBe('/setup')
    expect(overviewNextAction({ ...base, profile: null }).href).toBe('/setup#business')
    expect(overviewNextAction(base).href).toBe('/tables/table_own')
  })
  it('links unpublished and changed applications to their real editor', () => {
    const unpublished = overviewNextAction({ ...base, apps: [{ ...app, published: false }] })
    expect(unpublished.href).toBe('/apps/app_own')
    expect(unpublished.title).toBe('Приложение ещё не опубликовано')
    const changed = overviewNextAction({ ...base, apps: [app, { ...app, id: 'app_changed', hasUnpublishedChanges: true }] })
    expect(changed.href).toBe('/apps/app_changed')
    expect(changed.title).toBe('Есть неопубликованные изменения')
  })
  it('opens published version only when there is no pending configuration', () => {
    expect(overviewNextAction({ ...base, apps: [app] }).href).toBe('/a/shop')
    expect(overviewNextAction({ ...base, apps: [app, { ...app, id: 'draft', published: false }] }).href).toBe('/apps/draft')
  })
  it('viewers get inspection destinations and never setup or publication actions', () => {
    for (const apps of [[], [app], [{ ...app, published: false }]]) {
      expect(overviewNextAction({ ...base, role: 'viewer', apps }).href).toBe('/tables')
    }
    expect(overviewNextAction({ ...base, role: 'viewer', tables: [] }).href).toBe('/apps')
  })
  it('separates editor access from owner team administration', () => {
    expect(overviewPermissions('owner')).toEqual({ edit: true, manageTeam: true })
    expect(overviewPermissions('editor')).toEqual({ edit: true, manageTeam: false })
    expect(overviewPermissions('viewer')).toEqual({ edit: false, manageTeam: false })
  })
})
