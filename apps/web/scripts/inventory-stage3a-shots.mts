import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'

const fixture = JSON.parse(readFileSync('/tmp/inventory-visual-stage3a.json', 'utf8')) as {
  ownerCookie: string
  countsUrl: string
  countDraftUrl: string
  reorderUrl: string
  movementsUrl: string
  purchasesUrl: string
}
const sha = process.argv[2] || 'local'
const outDir = resolve('/workspace/artifacts')
const optDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })
mkdirSync(optDir, { recursive: true })

const hideChrome = async (page: Page) => {
  await page.addStyleTag({
    content: `nextjs-portal, agentation-toolbar, [data-agentation-portal], [data-nextjs-toast], [data-next-badge], [data-nextjs-dev-overlay], #__next-build-watcher, [aria-label="Open Next.js Dev Tools"], [aria-label*="Next.js Dev"], button[aria-label*="Next.js"] { display: none !important; visibility: hidden !important; pointer-events: none !important; opacity: 0 !important; }`,
  })
}

const save = async (page: Page, name: string) => {
  await hideChrome(page)
  await page.waitForTimeout(400)
  const file = `inventory-stage3-${sha}-${name}.png`
  const path = resolve(outDir, file)
  await page.screenshot({ path, fullPage: false })
  copyFileSync(path, resolve(optDir, file))
  console.log('saved', file)
}

const cookieParts = fixture.ownerCookie.split('=')
const cookie = { name: cookieParts[0]!, value: cookieParts.slice(1).join('='), url: 'http://127.0.0.1:3210' }

async function open(browser: Browser, width: number, height: number) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'ru-RU' })
  await context.addCookies([cookie])
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  return { context, page }
}

const browser = await chromium.launch({ headless: true })

// 1) Draft shots on both viewports before posting
{
  const d = await open(browser, 1280, 900)
  await d.page.goto(fixture.countsUrl, { waitUntil: 'networkidle' })
  await d.page.waitForTimeout(800)
  await save(d.page, 'd1280-count-list')
  await d.page.goto(fixture.countDraftUrl, { waitUntil: 'networkidle' })
  await d.page.waitForTimeout(900)
  await save(d.page, 'd1280-count-card-draft')
  await d.context.close()
}
{
  const m = await open(browser, 390, 844)
  await m.page.goto(fixture.countsUrl, { waitUntil: 'networkidle' })
  await m.page.waitForTimeout(800)
  await save(m.page, 'm390-count-list')
  await m.page.goto(fixture.countDraftUrl, { waitUntil: 'networkidle' })
  await m.page.waitForTimeout(900)
  await save(m.page, 'm390-count-card-draft')
  await m.context.close()
}

// 2) Post with confirmation (desktop), then posted card + movements
{
  const d = await open(browser, 1280, 900)
  await d.page.goto(fixture.countDraftUrl, { waitUntil: 'networkidle' })
  await d.page.waitForTimeout(800)
  await d.page.getByRole('button', { name: 'Провести' }).first().click()
  await d.page.waitForTimeout(800)
  await save(d.page, 'd1280-post-confirm')
  // Confirm in dialog — prefer the primary in confirmation panel
  const dialogConfirm = d.page.locator('[data-confirmation] button, [role="dialog"] button').filter({ hasText: /^Провести$/ }).last()
  if (await dialogConfirm.count()) await dialogConfirm.click()
  else await d.page.getByRole('button', { name: /^Провести$/ }).last().click()
  await d.page.waitForTimeout(1400)
  await save(d.page, 'd1280-count-card-posted')
  await d.page.goto(fixture.movementsUrl, { waitUntil: 'networkidle' })
  await d.page.waitForTimeout(900)
  await save(d.page, 'd1280-movements')
  await d.context.close()
}
{
  const m = await open(browser, 390, 844)
  await m.page.goto(fixture.countsUrl, { waitUntil: 'networkidle' })
  await m.page.waitForTimeout(700)
  await m.page.locator('text=/ИН-\\d+/').first().click()
  await m.page.waitForTimeout(900)
  await save(m.page, 'm390-count-card-posted')
  await m.page.goto(fixture.movementsUrl, { waitUntil: 'networkidle' })
  await m.page.waitForTimeout(900)
  await save(m.page, 'm390-movements')
  await m.context.close()
}

// 3) Reorder + draft order
async function selectAndCreate(page: Page, max: number) {
  await page.goto(fixture.reorderUrl, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1100)
  const checks = page.locator('input[type="checkbox"]')
  const n = await checks.count()
  for (let i = 0; i < Math.min(n, max); i++) {
    const box = checks.nth(i)
    if (!(await box.isChecked())) await box.check({ force: true })
  }
  await page.waitForTimeout(350)
}

{
  const d = await open(browser, 1280, 900)
  await d.page.goto(fixture.purchasesUrl, { waitUntil: 'networkidle' })
  await d.page.waitForTimeout(1600)
  await d.page.getByRole('button', { name: /Что заказать/ }).first().waitFor({ state: 'visible' })
  // Wait until the live low-stock counter lands on the button label.
  await d.page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll('button')]
    return buttons.some(button => /Что заказать\s*·\s*\d+/.test(button.textContent || ''))
  }, undefined, { timeout: 8_000 }).catch(() => {})
  await save(d.page, 'd1280-purchases-reorder-entry')
  await selectAndCreate(d.page, 4)
  await save(d.page, 'd1280-reorder-selected')
  await d.page.getByRole('button', { name: /Создать заказ/ }).first().click()
  await d.page.waitForTimeout(1800)
  await d.page.goto(fixture.purchasesUrl, { waitUntil: 'networkidle' })
  await d.page.waitForTimeout(900)
  await save(d.page, 'd1280-purchases-after-reorder')
  await d.page.locator('text=/ЗК-\\d+/').first().click()
  await d.page.waitForTimeout(1100)
  await save(d.page, 'd1280-draft-order')
  await d.context.close()
}
{
  const m = await open(browser, 390, 844)
  await m.page.goto(fixture.purchasesUrl, { waitUntil: 'networkidle' })
  await m.page.waitForTimeout(900)
  await save(m.page, 'm390-purchases-reorder-entry')
  await selectAndCreate(m.page, 3)
  await save(m.page, 'm390-reorder-selected')
  await m.page.getByRole('button', { name: /Создать заказ/ }).first().click()
  await m.page.waitForTimeout(1800)
  await m.page.goto(fixture.purchasesUrl, { waitUntil: 'networkidle' })
  await m.page.waitForTimeout(900)
  const draft = m.page.locator('text=/ЗК-\\d+/').first()
  if (await draft.count()) {
    await draft.click()
    await m.page.waitForTimeout(1100)
  }
  await save(m.page, 'm390-draft-order')
  await m.context.close()
}

// Reorder creates drafts on the shared visual demo — remove non-seed leftovers so
// supplier/purchases screens stay clean for layout QA.
{
  const { spawnSync } = await import('node:child_process')
  const { resolve } = await import('node:path')
  const cleaned = spawnSync('pnpm', ['exec', 'tsx', 'scripts/cleanup-inventory-demo-pos.mts'], {
    cwd: resolve('/workspace/apps/web'),
    encoding: 'utf8',
  })
  if (cleaned.status !== 0) console.warn('demo PO cleanup failed', cleaned.stderr || cleaned.stdout)
  else console.log('demo PO cleanup', (cleaned.stdout || '').trim())
}

writeFileSync('/tmp/inventory-stage3a-shots.json', JSON.stringify({ sha, ok: true }, null, 2))
await browser.close()
console.log('done', sha)
process.exit(0)
