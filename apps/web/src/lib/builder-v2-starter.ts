import type { AppV2 } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from './builder-v2'
import { addNode, createCollectionCard, newScreen, replaceNode } from '@/components/builder/v2/model'
import { builderV2CatalogCollection, builderV2CatalogDefaults, builderV2StarterCatalog } from './builder-v2-catalog'
import { addBuilderV2CustomerOrders, applyBuilderV2BusinessDefaults } from './builder-v2-business-defaults'

/** A starting layout, not a template that remains attached to the app. */
export function buildBuilderV2Starter(base: AppV2, tables: readonly BuilderV2Table[], primaryTableId: string): AppV2 {
  if (!tables.length || tables.length > 20 || new Set(tables.map(table => table.id)).size !== tables.length || tables.some(table => !table.fields.length)) throw new Error('Выберите от 1 до 20 таблиц с колонками')
  if (!tables.some(table => table.id === primaryTableId)) throw new Error('Выберите первый раздел приложения')
  if (base.nodes.length || base.sources.length || base.workflows.length || base.screens.some(screen => screen.rootIds.length)) throw new Error('Начальное приложение уже настроено')
  let app: AppV2 = { ...base, screens: [], homeScreenId: null }
  const ordered = [...tables.filter(table => table.id === primaryTableId), ...tables.filter(table => table.id !== primaryTableId)]
  for (const table of ordered) {
    const catalog = builderV2StarterCatalog(table)
    app = newScreen(app, table.name.slice(0, 120))
    const screenId = app.screens.at(-1)!.id
    const list = addNode(app, screenId, 'collection', tables, null, table.id)
    app = list.app
    const node = app.nodes.find(node => node.id === list.id)!
    if (node.type === 'collection') {
      const subtitle = table.fields.find(field => field.id !== node.titleFieldId && ['text', 'single_select', 'date', 'datetime', 'number', 'email', 'phone'].includes(field.type))
      const named = { ...node, name: table.name.slice(0, 120), subtitleFieldId: subtitle?.id ?? null }
      const visual = builderV2CatalogDefaults(table)
      const category = /^(?:категории|разделы|categories|sections)$/iu.test(table.name.trim())
      app = replaceNode(app, catalog ? builderV2CatalogCollection(named, catalog) : category || visual?.imageFieldId ? {
        ...named, layout: category ? 'tiles' : 'cards', titleFieldId: visual?.titleFieldId ?? named.titleFieldId,
        ...(visual?.imageFieldId ? { cardImageFieldId: visual.imageFieldId } : {}),
      } : named)
      if (catalog) app = { ...app, sources: app.sources.map(source => source.id === node.sourceId ? { ...source, searchFieldIds: [catalog.titleFieldId] } : source) }
    }
    const primary = table.fields.find(field => field.id === table.primaryFieldId) ?? table.fields[0]!
    const cardTable = { ...table, fields: [primary, ...table.fields.filter(field => field.id !== primary.id)] }
    const card = createCollectionCard(app, list.id, [cardTable], catalog)
    app = { ...card.app, screens: card.app.screens.map(screen => screen.id === card.screenId ? { ...screen, name: `Карточка: ${table.name}`.slice(0, 120) } : screen) }
    app = applyBuilderV2BusinessDefaults(app, list.id, card.screenId, tables)
  }
  return addBuilderV2CustomerOrders(app, tables)
}
