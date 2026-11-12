import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium, type Page } from 'playwright'

const sha = process.argv[2] || 'local'
const outDir = resolve('/workspace/artifacts')
const optDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })
mkdirSync(optDir, { recursive: true })

const catalog = 'http://127.0.0.1:3210/a/prodazhi-2?screen=scr_5n42y3zqk1xiyk7t'
const product = 'http://127.0.0.1:3210/a/prodazhi-2?screen=scr_cqt88qh9skmgrg8z&row=row_qa8mrafbz3wkaivg' // low stock lamp
const cart = 'http://127.0.0.1:3210/a/prodazhi-2?screen=scr_o79nmt4s0mlf492t'
const cookie = { name: 'tableapp_staff', value: 'ses_acceptbuyer', url: 'http://127.0.0.1:3210' }

const hide = async (page: Page) => {
  await page.addStyleTag({
    content: `nextjs-portal, agentation-toolbar, [data-nextjs-toast], [data-next-badge], #__next-build-watcher { display: none !important; }`,
  })
}

const save = async (page: Page, viewport: string, screen: string) => {
  await hide(page)
  await page.waitForTimeout(400)
  const file = `layout-${sha}-${viewport}-shop-${screen}.png`
  const path = resolve(outDir, file)
  await page.screenshot({ path, fullPage: false })
  copyFileSync(path, resolve(optDir, file))
  console.log('saved', file)
}

const browser = await chromium.launch({ headless: true })

for (const [vp, w, h] of [['d1280', 1280, 900], ['m390', 390, 844]] as const) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ru-RU', deviceScaleFactor: 1 })
  await ctx.addCookies([cookie])
  const page = await ctx.newPage()
  page.setDefaultTimeout(40_000)

  await page.goto(catalog, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  if (await page.locator('text=Страница недоступна').count()) throw new Error('catalog unavailable')
  await save(page, vp, 'catalog')

  await page.goto(product, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await save(page, vp, 'product')

  // seed cart with one in-stock item then shoot cart
  await page.goto('http://127.0.0.1:3210/a/prodazhi-2?screen=scr_cqt88qh9skmgrg8z&row=row_3rpo2j62dpha8btu', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const add = page.locator('button:has-text("В корзину"):visible').first()
  if (await add.count()) await add.click()
  await page.waitForTimeout(500)
  await page.goto(cart, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  await save(page, vp, 'cart')

  await ctx.close()
}

writeFileSync('/tmp/shop-storefront-visual.json', JSON.stringify({
  slug: 'prodazhi-2',
  catalog, product, cart,
  ownerCookie: 'tableapp_staff=ses_acceptbuyer',
}, null, 2))

await browser.close()
console.log('done', sha)
