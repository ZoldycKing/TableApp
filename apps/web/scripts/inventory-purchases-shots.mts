import { mkdirSync, readFileSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium, type Page, type BrowserContext } from 'playwright'

const fixture = JSON.parse(readFileSync('/tmp/inventory-visual.json', 'utf8')) as {
  ownerCookie: string
  staffCookie: string
  purchasesUrl: string
  purchaseOrderedUrl: string
  purchaseDraftUrl: string
  purchaseReceivedUrl: string
  suppliersUrl: string
  boxItemUrl: string
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
  ` }).catch(() => {})
}

const shot = async (page: Page, name: string) => {
  await hideChrome(page)
  await page.waitForTimeout(350)
  const file = `inventory-purchases-${sha}-${name}.png`
  const path = resolve(outDir, file)
  await page.screenshot({ path, fullPage: false })
  copyFileSync(path, resolve(optDir, file))
  console.log('saved', file)
}

const auth = async (context: BrowserContext, cookie: string) => {
  const [name, value] = cookie.split('=')
  await context.addCookies([{ name: name!, value: value!, domain: '127.0.0.1', path: '/' }])
}

const goto = async (page: Page, url: string) => {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 })
  await hideChrome(page)
  await page.waitForTimeout(700)
}

async function pickRelation(dialog: ReturnType<Page['locator']>, label: string) {
  const field = dialog.locator('label').filter({ hasText: label }).first()
  const control = field.locator('select, button, input').first()
  if (!(await control.count())) return
  const tag = await control.evaluate(el => el.tagName.toLowerCase())
  if (tag === 'select') {
    await control.selectOption({ index: 1 })
    return
  }
  await control.click()
  await dialog.page().waitForTimeout(200)
  const option = dialog.page().locator('[role="option"], [role="listbox"] button, li button').first()
  if (await option.count()) await option.click()
}

async function addProduct(dialog: ReturnType<Page['locator']>, query: string) {
  const page = dialog.page()
  await dialog.getByRole('button', { name: 'Добавить товар' }).click()
  const search = dialog.getByRole('searchbox', { name: 'Найти товар' })
  await search.fill(query)
  await page.waitForTimeout(900)
  const pick = dialog.locator('li button').filter({ hasText: 'Добавить' }).first()
  if (await pick.count()) {
    await pick.click()
  } else {
    // Fallback: any enabled pick row in the product list.
    await dialog.locator('[class*="purchasePick"]:not([disabled])').first().click()
  }
  await page.waitForTimeout(450)
}

async function main() {
  const browser = await chromium.launch({ headless: true })

  // --- Desktop static shots ---
  const staff = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await auth(staff, fixture.staffCookie)
  const d = await staff.newPage()

  await goto(d, fixture.purchasesUrl)
  await d.waitForSelector('text=Закупки')
  await d.waitForTimeout(1400)
  await shot(d, 'd1280-list')

  await goto(d, fixture.purchaseOrderedUrl)
  await d.getByRole('button', { name: 'Получить' }).waitFor({ timeout: 30_000 })
  await d.waitForTimeout(900)
  await shot(d, 'd1280-card')

  await goto(d, fixture.purchaseReceivedUrl)
  await d.waitForSelector('text=История')
  await d.locator('ul').filter({ hasText: 'Получен' }).scrollIntoViewIfNeeded().catch(() => {})
  await d.waitForTimeout(700)
  await shot(d, 'd1280-card-received')

  await goto(d, fixture.purchasesUrl)
  await d.getByRole('button', { name: 'Новый заказ' }).click()
  await d.waitForSelector('[role="dialog"]')
  await d.waitForTimeout(700)
  await shot(d, 'd1280-create-top')
  await d.keyboard.press('Escape')

  // Edit draft to show selected lines + total (seed already has one line; add a second).
  await goto(d, fixture.purchaseDraftUrl)
  await d.getByRole('button', { name: 'Изменить' }).click()
  await d.waitForSelector('[role="dialog"]')
  const dialog = d.locator('[role="dialog"]')
  await addProduct(dialog, 'короб')
  await dialog.locator('text=Итого').scrollIntoViewIfNeeded().catch(() => {})
  await d.waitForTimeout(500)
  await shot(d, 'd1280-create-lines')
  await d.keyboard.press('Escape')

  await staff.close()

  const owner = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await auth(owner, fixture.ownerCookie)
  const od = await owner.newPage()

  await goto(od, fixture.suppliersUrl)
  await od.waitForTimeout(900)
  await shot(od, 'd1280-suppliers')
  await od.getByRole('button', { name: 'Новый поставщик' }).click()
  await od.waitForSelector('[role="dialog"]')
  await od.waitForTimeout(500)
  await shot(od, 'd1280-supplier-modal')
  await od.keyboard.press('Escape')

  // --- Mobile static shots (before mutate) ---
  const mStaff = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await auth(mStaff, fixture.staffCookie)
  const m = await mStaff.newPage()

  await goto(m, fixture.purchasesUrl)
  await m.waitForTimeout(1400)
  await shot(m, 'm390-list')

  await goto(m, fixture.purchaseOrderedUrl)
  await m.getByRole('button', { name: 'Получить' }).waitFor({ timeout: 30_000 })
  await m.waitForTimeout(800)
  await shot(m, 'm390-card')

  await goto(m, fixture.purchaseReceivedUrl)
  await m.waitForSelector('text=История')
  await m.locator('ul').filter({ hasText: 'Получен' }).scrollIntoViewIfNeeded().catch(() => {})
  await m.waitForTimeout(800)
  await shot(m, 'm390-card-received')

  await goto(m, fixture.purchasesUrl)
  await m.getByRole('button', { name: 'Новый заказ' }).click()
  await m.waitForSelector('[role="dialog"]')
  await m.waitForTimeout(600)
  await shot(m, 'm390-create-top')
  const mDialog = m.locator('[role="dialog"]')
  await mDialog.getByRole('button', { name: 'Добавить товар' }).click()
  await mDialog.getByRole('searchbox', { name: 'Найти товар' }).fill('FA-120')
  await m.waitForTimeout(800)
  await shot(m, 'm390-create-search')
  await m.keyboard.press('Escape')
  await mStaff.close()

  const mOwner = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await auth(mOwner, fixture.ownerCookie)
  const mo = await mOwner.newPage()
  await goto(mo, fixture.suppliersUrl)
  await mo.waitForTimeout(800)
  await shot(mo, 'm390-suppliers')
  await mo.getByRole('button', { name: 'Новый поставщик' }).click()
  await mo.waitForSelector('[role="dialog"]')
  await mo.waitForTimeout(500)
  await shot(mo, 'm390-supplier-modal')
  await mOwner.close()

  // --- Mutating flows on desktop (staff receive, then owner cancel dialog) ---
  const staff2 = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await auth(staff2, fixture.staffCookie)
  const d2 = await staff2.newPage()
  await goto(d2, fixture.purchaseOrderedUrl)
  await d2.getByRole('button', { name: 'Получить' }).click()
  await d2.waitForTimeout(1800)
  await shot(d2, 'd1280-card-after-receive')
  await goto(d2, fixture.boxItemUrl)
  await d2.waitForTimeout(1100)
  await shot(d2, 'd1280-stock-after-receive')
  await staff2.close()

  await goto(od, fixture.purchaseReceivedUrl)
  await od.getByRole('button', { name: 'Отменить' }).click()
  await od.waitForSelector('text=Отменить полученный заказ')
  await od.waitForTimeout(500)
  await shot(od, 'd1280-cancel-confirm')
  await owner.close()

  await browser.close()
  console.log('done', sha)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
