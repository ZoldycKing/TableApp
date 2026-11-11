import { mkdirSync, readFileSync, copyFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium, type Page } from 'playwright'
import { and, eq, inArray, isNull } from 'drizzle-orm'

const fixture = JSON.parse(readFileSync('/tmp/inventory-visual.json', 'utf8')) as {
  ownerCookie: string
  listUrl: string
  itemUrl: string
  longItemUrl?: string
  createUrl?: string
  movementsUrl: string
  appId: string
}
const sha = process.argv[2] || 'local'
const outDir = resolve('/workspace/artifacts')
const optDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })
mkdirSync(optDir, { recursive: true })

const hideChrome = async (page: Page) => {
  await page.addStyleTag({ content: `
    nextjs-portal, agentation-toolbar, [data-agentation-portal], [data-nextjs-toast], [data-next-badge], [data-next-mark], [data-nextjs-dev-overlay],
    #__next-build-watcher, [aria-label="Open Next.js Dev Tools"], [aria-label*="Next.js Dev"],
    button[aria-label*="Next.js"], a[href*="__nextjs"] { display: none !important; visibility: hidden !important; pointer-events: none !important; opacity: 0 !important; }
  ` })
  await page.evaluate(() => {
    const selectors = 'nextjs-portal, agentation-toolbar, [data-agentation-portal], [data-nextjs-toast], [data-next-badge], [data-nextjs-dev-overlay]'
    const kill = (root: ParentNode) => { for (const node of root.querySelectorAll(selectors)) node.remove() }
    kill(document)
    for (const host of document.querySelectorAll('nextjs-portal, agentation-toolbar, body *')) {
      const shadow = (host as HTMLElement).shadowRoot
      if (shadow) kill(shadow)
    }
  }).catch(() => {})
}

const shot = async (page: Page, name: string) => {
  await hideChrome(page)
  await page.waitForTimeout(400)
  const file = `inventory-v2-${sha}-${name}.png`
  const path = resolve(outDir, file)
  await page.screenshot({ path, fullPage: false })
  copyFileSync(path, resolve(optDir, file))
  console.log('saved', file)
}

const goto = async (page: Page, url: string) => {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
  await hideChrome(page)
  await page.waitForTimeout(800)
}

async function itemsTable() {
  const { db, apps, rows } = await import('@tableapp/db')
  const { readAppDefinition } = await import('@tableapp/schema/app-definition')
  const [app] = await db.select().from(apps).where(eq(apps.id, fixture.appId))
  const read = readAppDefinition(app!.published)
  if (!read.ok || read.formatVersion !== 2 || !read.app.inventory) throw new Error('bad app')
  const tableId = read.app.inventory.itemsTableId
  const active = await db.select({ id: rows.id }).from(rows).where(and(eq(rows.tableId, tableId), isNull(rows.deletedAt)))
  return { db, rows, tableId, ids: active.map(r => r.id) }
}

async function softDeleteItems(tableId: string) {
  const { db, rows } = await import('@tableapp/db')
  await db.update(rows).set({ deletedAt: new Date() }).where(and(eq(rows.tableId, tableId), isNull(rows.deletedAt)))
}

async function restoreItems(tableId: string, ids: string[]) {
  if (!ids.length) return
  const { db, rows } = await import('@tableapp/db')
  await db.update(rows).set({ deletedAt: null }).where(and(eq(rows.tableId, tableId), inArray(rows.id, ids)))
}

async function inspect(page: Page, label: string) {
  const m = await page.evaluate(`(() => {
    const ellipsis = [...document.querySelectorAll('strong, h1, h2, small, span')].filter(el => {
      const s = getComputedStyle(el)
      return s.textOverflow === 'ellipsis' && s.overflow !== 'visible' && el.scrollWidth > el.clientWidth + 1
    }).map(el => (el.textContent || '').slice(0, 80))
    const thumbs = document.querySelectorAll('[class*="productThumb"]').length
    const avatars = document.querySelectorAll('[class*="recordAvatar"]').length
    return { thumbs, avatars, clipped: ellipsis.slice(0, 8) }
  })()`)
  console.log('inspect', label, JSON.stringify(m))
  return m
}

async function capture(width: number, prefix: string, tableId: string, itemIds: string[]) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width, height: width >= 1000 ? 900 : 844 },
    deviceScaleFactor: 1,
    locale: 'ru-RU',
  })
  const cookie = fixture.ownerCookie.split('=')
  await context.addCookies([{ name: cookie[0]!, value: cookie[1]!, url: 'http://127.0.0.1:3210' }])
  const page = await context.newPage()

  await goto(page, fixture.listUrl)
  await page.waitForSelector('img, [class*="productThumb"]', { timeout: 20_000 }).catch(() => {})
  await inspect(page, `${prefix}-list`)
  await shot(page, `${prefix}-list`)

  await goto(page, fixture.movementsUrl)
  await page.waitForTimeout(1200)
  await inspect(page, `${prefix}-journal`)
  await shot(page, `${prefix}-journal`)

  await goto(page, fixture.itemUrl)
  await inspect(page, `${prefix}-card-short`)
  await shot(page, `${prefix}-card`)
  await shot(page, `${prefix}-card-short`)

  if (fixture.longItemUrl) {
    await goto(page, fixture.longItemUrl)
    await inspect(page, `${prefix}-card-long`)
    await shot(page, `${prefix}-card-long`)
  }

  if (fixture.createUrl) {
    await goto(page, fixture.createUrl)
    await page.getByText('Наименование').first().waitFor({ timeout: 15_000 }).catch(() => {})
    await inspect(page, `${prefix}-add`)
    await shot(page, `${prefix}-add`)
  } else {
    await goto(page, fixture.listUrl)
    const create = page.getByRole('button', { name: 'Новый товар' })
    if (await create.count()) {
      await create.click()
      await page.waitForTimeout(800)
      await shot(page, `${prefix}-add`)
    }
  }

  await softDeleteItems(tableId)
  try {
    await goto(page, fixture.listUrl)
    await page.getByText('Товаров пока нет').waitFor({ timeout: 15_000 })
    await shot(page, `${prefix}-empty`)
  } finally {
    await restoreItems(tableId, itemIds)
  }

  await browser.close()
}

const { tableId, ids } = await itemsTable()
await capture(1280, 'd1280', tableId, ids)
await capture(390, 'm390', tableId, ids)
writeFileSync('/tmp/inventory-shots-done.json', JSON.stringify({ sha, at: new Date().toISOString() }, null, 2))
console.log('done')
process.exit(0)
