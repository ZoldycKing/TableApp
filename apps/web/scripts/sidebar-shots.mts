import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium, type Page } from 'playwright'

const sha = process.argv[2] || 'local'
const outDir = resolve('/workspace/artifacts')
const optDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })
mkdirSync(optDir, { recursive: true })

const inv = JSON.parse(readFileSync('/tmp/inventory-visual-stage3a.json', 'utf8')) as { ownerCookie: string; slug: string }
const crm = JSON.parse(readFileSync('/tmp/crm-visual.json', 'utf8')) as { ownerCookie: string; slug: string }

const catalog = 'http://127.0.0.1:3210/a/prodazhi-2?screen=scr_5n42y3zqk1xiyk7t'
const items = `http://127.0.0.1:3210/a/${inv.slug}?screen=scr_du67chcmf3x5jfya`
const clients = `http://127.0.0.1:3210/a/${crm.slug}?screen=scr_iaq2u62avgpq5j9g`
const shopCookie = { name: 'tableapp_staff', value: 'ses_acceptbuyer', url: 'http://127.0.0.1:3210' }

const hide = async (page: Page) => {
  await page.addStyleTag({
    content: `nextjs-portal, agentation-toolbar, [data-nextjs-toast], [data-next-badge], #__next-build-watcher, [aria-label*="Next.js"] { display: none !important; }`,
  })
}

const save = async (page: Page, viewport: string, screen: string) => {
  await hide(page)
  await page.waitForTimeout(300)
  const file = `sidebar-${sha}-${viewport}-${screen}.png`
  const path = resolve(outDir, file)
  await page.screenshot({ path, fullPage: false })
  copyFileSync(path, resolve(optDir, file))
  console.log('saved', file)
}

const cookieFrom = (raw: string) => {
  const i = raw.indexOf('=')
  return { name: raw.slice(0, i), value: raw.slice(i + 1), url: 'http://127.0.0.1:3210' }
}

const browser = await chromium.launch({ headless: true })

// d1280 catalog default + active filters
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU', deviceScaleFactor: 1 })
  await ctx.addCookies([shopCookie])
  const page = await ctx.newPage()
  page.setDefaultTimeout(40_000)
  await page.goto(catalog, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  await save(page, 'd1280', 'catalog-default')
  const cat = page.locator('aside[aria-label="Фильтры каталога"] button', { hasText: 'Хранение' }).first()
  if (await cat.count()) await cat.click()
  else {
    const opt = page.locator('aside[aria-label="Фильтры каталога"] label').filter({ hasText: 'В наличии' }).first()
    await opt.click()
  }
  await page.waitForTimeout(500)
  await save(page, 'd1280', 'catalog-chips')
  await ctx.close()
}

// m390 catalog sheet
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', deviceScaleFactor: 1 })
  await ctx.addCookies([shopCookie])
  const page = await ctx.newPage()
  page.setDefaultTimeout(40_000)
  await page.goto(catalog, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /Фильтры/ }).first().click()
  await page.getByRole('dialog', { name: 'Фильтры' }).waitFor({ state: 'visible' })
  await page.waitForTimeout(400)
  await save(page, 'm390', 'catalog-sheet')
  await ctx.close()
}

// d1280 inventory + CRM
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU', deviceScaleFactor: 1 })
  await ctx.addCookies([cookieFrom(inv.ownerCookie)])
  const page = await ctx.newPage()
  page.setDefaultTimeout(40_000)
  await page.goto(items, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  await save(page, 'd1280', 'inventory-products')
  await ctx.close()
}
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU', deviceScaleFactor: 1 })
  await ctx.addCookies([cookieFrom(crm.ownerCookie)])
  const page = await ctx.newPage()
  page.setDefaultTimeout(40_000)
  await page.goto(clients, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  await save(page, 'd1280', 'crm-clients')
  await ctx.close()
}

await browser.close()
console.log('done', sha)
