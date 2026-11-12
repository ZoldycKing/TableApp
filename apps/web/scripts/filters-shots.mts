import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium, type Page } from 'playwright'

const sha = process.argv[2] || 'local'
const outDir = resolve('/workspace/artifacts')
const optDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })
mkdirSync(optDir, { recursive: true })

const inv = JSON.parse(readFileSync('/tmp/inventory-visual-stage3a.json', 'utf8')) as {
  ownerCookie: string
  slug: string
}
const crm = JSON.parse(readFileSync('/tmp/crm-visual.json', 'utf8')) as {
  ownerCookie: string
  slug: string
}

const catalog = 'http://127.0.0.1:3210/a/prodazhi-2?screen=scr_5n42y3zqk1xiyk7t'
const cart = 'http://127.0.0.1:3210/a/prodazhi-2?screen=scr_o79nmt4s0mlf492t'
const items = `http://127.0.0.1:3210/a/${inv.slug}?screen=scr_du67chcmf3x5jfya`
const suppliers = `http://127.0.0.1:3210/a/${inv.slug}?screen=scr_7n6sprdroj2du4cz`
const supplier = `http://127.0.0.1:3210/a/${inv.slug}?screen=scr_bkiygo8owwpyemdb&row=row_t2ir67hj3a9c8st8`
const clients = `http://127.0.0.1:3210/a/${crm.slug}?screen=scr_iaq2u62avgpq5j9g`
const shopCookie = { name: 'tableapp_staff', value: 'ses_acceptbuyer', url: 'http://127.0.0.1:3210' }

const hide = async (page: Page) => {
  await page.addStyleTag({
    content: `nextjs-portal, agentation-toolbar, [data-nextjs-toast], [data-next-badge], #__next-build-watcher, [aria-label*="Next.js"] { display: none !important; }`,
  })
}

const save = async (page: Page, viewport: string, screen: string) => {
  await hide(page)
  await page.waitForTimeout(350)
  const file = `filters-${sha}-${viewport}-${screen}.png`
  const path = resolve(outDir, file)
  await page.screenshot({ path, fullPage: false })
  copyFileSync(path, resolve(optDir, file))
  console.log('saved', file)
}

const cookieFrom = (raw: string) => {
  const i = raw.indexOf('=')
  return { name: raw.slice(0, i), value: raw.slice(i + 1), url: 'http://127.0.0.1:3210' }
}

const openFilters = async (page: Page) => {
  const btn = page.getByRole('button', { name: /Фильтры/ }).first()
  await btn.waitFor({ state: 'visible', timeout: 12_000 })
  await btn.click()
  await page.getByRole('dialog', { name: 'Фильтры' }).waitFor({ state: 'visible', timeout: 8_000 })
  await page.waitForTimeout(300)
}

const applyFirstNonAll = async (page: Page) => {
  const options = page.locator('[role="dialog"] label').filter({ hasNotText: /^Все$|^Любая$/ })
  const count = await options.count()
  for (let i = 0; i < Math.min(count, 8); i += 1) {
    const label = ((await options.nth(i).innerText()) || '').trim()
    if (!label || /^Все/.test(label) || /^Любая/.test(label)) continue
    await options.nth(i).click()
    break
  }
  const apply = page.getByRole('button', { name: /Показать/ }).first()
  await apply.click()
  await page.waitForTimeout(500)
}

const browser = await chromium.launch({ headless: true })

for (const [vp, w, h] of [['d1280', 1280, 900], ['m390', 390, 844]] as const) {
  // Shop catalog: default / panel / chips
  {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ru-RU', deviceScaleFactor: 1 })
    await ctx.addCookies([shopCookie])
    const page = await ctx.newPage()
    page.setDefaultTimeout(40_000)
    await page.goto(catalog, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1400)
    await page.getByPlaceholder('Поиск').first().waitFor({ state: 'visible' })
    await save(page, vp, 'catalog-default')
    await openFilters(page)
    await save(page, vp, 'catalog-panel')
    await applyFirstNonAll(page)
    await page.getByRole('button', { name: /Сбросить всё/ }).first().waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {})
    await save(page, vp, 'catalog-chips')

    // Cart (seed one product)
    await page.goto('http://127.0.0.1:3210/a/prodazhi-2?screen=scr_cqt88qh9skmgrg8z&row=row_3rpo2j62dpha8btu', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    const add = page.locator('button:has-text("В корзину"):visible').first()
    if (await add.count()) await add.click()
    await page.waitForTimeout(400)
    await page.goto(cart, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    await save(page, vp, 'cart')
    await ctx.close()
  }

  // Inventory products: panel + chips
  {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ru-RU', deviceScaleFactor: 1 })
    await ctx.addCookies([cookieFrom(inv.ownerCookie)])
    const page = await ctx.newPage()
    page.setDefaultTimeout(40_000)
    await page.goto(items, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1400)
    await openFilters(page)
    await save(page, vp, 'inventory-panel')
    await applyFirstNonAll(page)
    await save(page, vp, 'inventory-chips')

    // Supplier card
    await page.goto(supplier, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1400)
    const productsHeading = page.getByText('Товары поставщика').first()
    if (await productsHeading.count()) {
      await productsHeading.scrollIntoViewIfNeeded().catch(() => {})
    }
    await page.waitForTimeout(400)
    await save(page, vp, 'supplier-card')
    await ctx.close()
  }

  // CRM clients: chips
  {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ru-RU', deviceScaleFactor: 1 })
    await ctx.addCookies([cookieFrom(crm.ownerCookie)])
    const page = await ctx.newPage()
    page.setDefaultTimeout(40_000)
    await page.goto(clients, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1600)
    await openFilters(page)
    await applyFirstNonAll(page)
    await save(page, vp, 'crm-clients-chips')
    await ctx.close()
  }

  void suppliers
}

await browser.close()
console.log('done', sha)
