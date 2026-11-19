import { describe, expect, it } from 'vitest'
import type { FieldType } from '@tableapp/schema'
import { validateAppV2, type AppV2Catalog } from '@tableapp/schema/app-v2'
import { buildTemplate } from './build'
import { findTemplate } from './catalog'
import { buildInvoicesV2App, isInvoicesTemplate } from './invoices-v2'

const workspaceId = 'wsp_invoices'

function installed() {
  const built = buildTemplate({ template: findTemplate('scheta')!, workspaceId })
  const app = buildInvoicesV2App(built, { id: 'app_invoices', workspaceId, name: built.appName, slug: 'scheta', email: 'owner@example.invalid' })
  const catalog: AppV2Catalog = {
    workspaceId,
    tables: new Map(built.tables.map(table => [table.id, { workspaceId }])),
    fields: new Map(built.fields.map(field => [field.id, {
      tableId: field.tableId, type: field.type as FieldType,
      ...(field.type === 'relation' && typeof (field.options as { tableId?: unknown }).tableId === 'string' ? { relationTableId: (field.options as { tableId: string }).tableId } : {}),
      ...(field.type === 'single_select' && Array.isArray((field.options as { choices?: { id?: string }[] }).choices) ? { choiceIds: ((field.options as { choices: { id?: string }[] }).choices).map(choice => choice.id).filter((id): id is string => typeof id === 'string') } : {}),
    }])),
    views: new Map(built.views.map(view => [view.id, { tableId: view.tableId }])),
  }
  return { built, app, catalog }
}

describe('invoices template v2', () => {
  it('publishes documents, clients, catalog and settings on the invoices kit', () => {
    expect(isInvoicesTemplate('scheta')).toBe(true)
    expect(isInvoicesTemplate('crm')).toBe(false)
    const { app, catalog } = installed()
    expect(validateAppV2(app, catalog)).toEqual([])
    expect(validateAppV2(app, catalog, { mode: 'publish' })).toEqual([])
    const kit = app.invoices!
    expect(app.homeScreenId).toBe(kit.homeScreenId)
    expect(app.roles.map(role => role.name)).toEqual(['Руководитель'])
    expect(app.screens.filter(screen => screen.navigation).map(screen => screen.menuLabel)).toEqual(['Документы', 'Клиенты', 'Каталог', 'Настройки'])
    expect(app.nodes.find(node => node.id === kit.createDocumentFormId)?.type).toBe('form')
  })
})