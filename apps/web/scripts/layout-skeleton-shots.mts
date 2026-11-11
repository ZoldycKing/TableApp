import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'

const inv3 = JSON.parse(readFileSync('/tmp/inventory-visual-stage3a.json', 'utf8')) as {
  ownerCookie: string
  purchasesUrl: string
  countsUrl: string
  countDraftUrl: string
  movementsUrl: string
  slug: string
}
const crm = JSON.parse(readFileSync('/tmp/crm-visual.json', 'utf8')) as {
  ownerCookie: string
  boardUrl: string
  dealUrl: string
  clientUrl: string
  slug: string
}

const sha = process.argv[2] || 'local'
const outDir = resolve('/workspace/artifacts')
const optDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })
mkdirSync(optDir, { recursive: true })

const base = `http://127.0.0.1:3210/a/${inv3.slug}`
const inv = {
  items: `${base}?screen=scr_du67chcmf3x5jfya`,
  item: `${base}?screen=scr_tl8p8xu7hh3qnjy0&row=row_xkk0h80lj8m72df0`,
  movements: inv3.movementsUrl,
  purchases: inv3.purchasesUrl,
  suppliers: `${base}?screen=scr_7n6sprdroj2du4cz`,
  supplier: `${base}?screen=scr_bkiygo8owwpyemdb&row=row_t2ir67hj3a9c8st8`,
  counts: inv3.countsUrl,
  count: inv3.countDraftUrl,
}
const shop = {
  staffCookie: 'tableapp_staff=ses_acceptstaff',
  ordersUrl: 'http://127.0.0.1:3210/a/prodazhi-2?screen=scr_2moatdsib3k5q55h',
  orderUrl: 'http://127.0.0.1:3210/a/prodazhi-2?screen=scr_35kvbh34onojrodu&row=row_zvrr4p3jivxa55bu',
}
const crmClientsUrl = `http://127.0.0.1:3210/a/${crm.slug}?screen=scr_iaq2u62avgpq5j9g`

const hideChrome = async (page: Page) => {
  await page.addStyleTag({
    content: `nextjs-portal, agentation-toolbar, [data-agentation-portal], [data-nextjs-toast], [data-next-badge], [data-nextjs-dev-overlay], #__next-build-watcher, [aria-label="Open Next.js Dev Tools"], [aria-label*="Next.js Dev"], button[aria-label*="Next.js"] { display: none !important; visibility: hidden !important; pointer-events: none !important; opacity: 0 !important; }`,
  })
}

const save = async (page: Page, viewport: 'd1280' | 'm390', template: string, screen: string) => {
  await hideChrome(page)
  await page.waitForTimeout(400)
  const file = `layout-${sha}-${viewport}-${template}-${screen}.png`
  const path = resolve(outDir, file)
  await page.screenshot({ path, fullPage: false })
  copyFileSync(path, resolve(optDir, file))
  console.log('saved', file)
}

const cookieFrom = (raw: string) => {
  const i = raw.indexOf('=')
  return { name: raw.slice(0, i), value: raw.slice(i + 1), url: 'http://127.0.0.1:3210' }
}

async function open(browser: Browser, width: number, height: number, cookieRaw: string) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'ru-RU' })
  await context.addCookies([cookieFrom(cookieRaw)])
  const page = await context.newPage()
  page.setDefaultTimeout(35_000)
  return { context, page }
}

async function shootPair(browser: Browser, cookie: string, template: string, screen: string, url: string) {
  {
    const d = await open(browser, 1280, 900, cookie)
    await d.page.goto(url, { waitUntil: 'networkidle' })
    await d.page.waitForTimeout(1200)
    await save(d.page, 'd1280', template, screen)
    await d.context.close()
  }
  {
    const m = await open(browser, 390, 844, cookie)
    await m.page.goto(url, { waitUntil: 'networkidle' })
    await m.page.waitForTimeout(1200)
    await save(m.page, 'm390', template, screen)
    await m.context.close()
  }
}

// Drop reorder/e2e leftover drafts from the demo dataset before shooting.
{
  const { spawnSync } = await import('node:child_process')
  const cleaned = spawnSync('pnpm', ['exec', 'tsx', 'scripts/cleanup-inventory-demo-pos.mts'], {
    cwd: resolve('/workspace/apps/web'),
    encoding: 'utf8',
  })
  if (cleaned.status !== 0) {
    console.warn('demo PO cleanup failed', cleaned.stderr || cleaned.stdout)
  } else {
    console.log('demo PO cleanup', (cleaned.stdout || '').trim())
  }
}

const browser = await chromium.launch({ headless: true })

await shootPair(browser, inv3.ownerCookie, 'inventory', 'items', inv.items)
await shootPair(browser, inv3.ownerCookie, 'inventory', 'item', inv.item)
await shootPair(browser, inv3.ownerCookie, 'inventory', 'movements', inv.movements)
await shootPair(browser, inv3.ownerCookie, 'inventory', 'purchases', inv.purchases)
await shootPair(browser, inv3.ownerCookie, 'inventory', 'suppliers', inv.suppliers)
await shootPair(browser, inv3.ownerCookie, 'inventory', 'supplier', inv.supplier)
await shootPair(browser, inv3.ownerCookie, 'inventory', 'counts', inv.counts)
await shootPair(browser, inv3.ownerCookie, 'inventory', 'count', inv.count)

await shootPair(browser, crm.ownerCookie, 'crm', 'board', crm.boardUrl)
await shootPair(browser, crm.ownerCookie, 'crm', 'clients', crmClientsUrl)
await shootPair(browser, crm.ownerCookie, 'crm', 'client', crm.clientUrl)
await shootPair(browser, crm.ownerCookie, 'crm', 'deal', crm.dealUrl)

await shootPair(browser, shop.staffCookie, 'shop', 'orders', shop.ordersUrl)
await shootPair(browser, shop.staffCookie, 'shop', 'order', shop.orderUrl)

await browser.close()
writeFileSync('/tmp/layout-skeleton-shots.json', JSON.stringify({ sha, ok: true }, null, 2))
console.log('done', sha)
