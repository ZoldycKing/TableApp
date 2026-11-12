/**
 * Adds warehouse stock + product attributes to prodazhi-2 and rewires the
 * published shop app to the full-catalog view for storefront QA.
 */
import { eq } from 'drizzle-orm'
import { db, apps, fields, rows, views } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { readAppDefinition, validateAppV2Definition } from '@tableapp/schema/app-definition'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { loadBuilderV2Catalog } from '../src/lib/builder-v2'
import { SHOP_SAMPLE_PRODUCTS } from '../src/lib/templates/shop-samples'

const SLUG = 'prodazhi-2'

const EXTRA = [
  { name: 'Остаток', type: 'number' as const },
  { name: 'Размер', type: 'text' as const },
  { name: 'Цвет', type: 'text' as const },
  { name: 'Материал', type: 'text' as const },
]

async function main() {
  const [record] = await db.select().from(apps).where(eq(apps.slug, SLUG))
  if (!record) throw new Error('missing prodazhi-2')
  const read = readAppDefinition(record.published)
  if (!read.ok || read.formatVersion !== 2 || !read.app.shop) throw new Error('bad published')
  const app = structuredClone(read.app) as AppV2
  const shop = app.shop!
  const tableId = shop.catalogTableId

  const existing = await db.select().from(fields).where(eq(fields.tableId, tableId))
  const byName = new Map(existing.map(field => [field.name, field]))
  let position = existing.length
  for (const extra of EXTRA) {
    if (byName.has(extra.name)) continue
    const id = newId('field')
    position += 1
    await db.insert(fields).values({
      id, tableId, name: extra.name, type: extra.type,
      options: extra.type === 'number' ? { format: 'integer', precision: 0 } : {},
      description: extra.name === 'Остаток' ? 'Складской остаток для витрины' : '',
      position: `a${String(position).padStart(3, '0')}`,
    })
    byName.set(extra.name, { id, name: extra.name } as any)
    console.log('added', extra.name, id)
  }

  const stockId = byName.get('Остаток')!.id
  const sizeId = byName.get('Размер')!.id
  const colorId = byName.get('Цвет')!.id
  const materialId = byName.get('Материал')!.id
  const nameId = shop.productTitleFieldId
  const availableId = shop.activeFieldId
  const leadId = byName.get('Срок поставки')?.id

  const productRows = await db.select().from(rows).where(eq(rows.tableId, tableId))
  for (const row of productRows) {
    const data = { ...(row.data as Record<string, unknown>) }
    const name = String(data[nameId] ?? '')
    const sample = SHOP_SAMPLE_PRODUCTS.find(item => item.name === name)
    if (!sample) continue
    data[stockId] = sample.stock
    data[sizeId] = sample.size
    data[colorId] = sample.color
    data[materialId] = sample.material
    data[availableId] = sample.stock > 0
    if (leadId) data[leadId] = sample.stock > 0 ? 'Со склада · самовывоз или доставка' : 'Под заказ'
    await db.update(rows).set({ data, updatedAt: new Date() }).where(eq(rows.id, row.id))
    console.log('seeded', name, sample.stock)
  }

  shop.stockFieldId = stockId
  shop.categoryFieldId = byName.get('Категория')?.id ?? shop.categoryFieldId

  const allViews = await db.select().from(views).where(eq(views.tableId, tableId))
  const whole = allViews.find(view => view.name === 'Весь каталог')
  if (whole) {
    shop.catalogViewId = whole.id
    const source = app.sources.find(item => item.tableId === tableId && !item.screenTableId)
    if (source) source.viewId = whole.id
    console.log('catalog view ->', whole.id)
  }

  const catalogScreen = app.screens.find(screen => screen.id === shop.catalogScreenId)
  if (catalogScreen) {
    catalogScreen.name = 'Каталог'
    catalogScreen.menuLabel = 'Каталог'
  }

  // Meaningful detail fields only — drop unit/available field nodes from the PDP.
  const detailScreen = app.screens.find(screen => screen.id === shop.detailScreenId)
  if (detailScreen) {
    const keepNames = new Set(['Категория', 'Размер', 'Цвет', 'Материал', 'Срок поставки'])
    const drop = new Set(detailScreen.rootIds)
    const nextRoots: string[] = []
    for (const name of keepNames) {
      const field = byName.get(name)
      if (!field) continue
      const nodeId = `detail_${field.id}`
      if (!app.nodes.some(node => node.id === nodeId)) {
        app.nodes.push({
          id: nodeId, name, type: 'field', label: name, visibleTo: null, visibleWhen: null,
          value: { kind: 'row', fieldId: field.id },
        })
      }
      nextRoots.push(nodeId)
      drop.delete(nodeId)
    }
    detailScreen.rootIds = nextRoots
    if (drop.size) app.nodes = app.nodes.filter(node => !drop.has(node.id))
  }

  // Ensure public read grants include new fields
  for (const tablePolicy of app.policy.tables) {
    if (tablePolicy.tableId !== tableId) continue
    for (const grant of tablePolicy.grants) {
      if (grant.audience.kind !== 'public' || !grant.read) continue
      const ids = new Set(grant.read.fieldIds)
      for (const id of [stockId, sizeId, colorId, materialId]) ids.add(id)
      grant.read = { ...grant.read, fieldIds: [...ids] }
    }
  }

  const catalog = await loadBuilderV2Catalog(record.workspaceId)
  const checked = validateAppV2Definition(app, catalog.catalog)
  if (!checked.ok) {
    console.error(checked)
    throw new Error('invalid after enrich')
  }
  await db.update(apps).set({ published: app, draft: app, updatedAt: new Date() }).where(eq(apps.id, record.id))
  console.log('saved', SLUG, { stockId, sizeId, colorId, materialId, catalogScreenId: shop.catalogScreenId, detailScreenId: shop.detailScreenId, basketScreenId: shop.basketScreenId })
}

await main()
process.exit(0)
