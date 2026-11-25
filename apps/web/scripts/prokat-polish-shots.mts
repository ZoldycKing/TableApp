/**
 * Local demo screenshots for the Прокат polish round (uses /prokat-shot, no DB).
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from 'playwright'

const require = createRequire(import.meta.url)
const playwright = (() => {
  try { return require('playwright') as typeof import('playwright') }
  catch { return require('/tmp/pw/node_modules/playwright') as typeof import('playwright') }
})()
const { chromium } = playwright

const outDir = resolve('/opt/cursor/artifacts/prokat-polish')
mkdirSync(outDir, { recursive: true })
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3210'

const hide = async (page: Page) => {
  await page.addStyleTag({
    content: `nextjs-portal, agentation-toolbar, [data-nextjs-toast], [data-next-badge], [data-nextjs-dev-tools-button], [data-nextjs-dev-tools-menu], #__next-build-watcher, [aria-label*="Next.js"] { display: none !important; }`,
  })
}

const save = async (page: Page, name: string, opts?: { keepHover?: boolean }) => {
  await hide(page)
  if (!opts?.keepHover) await page.mouse.move(2, 2)
  await page.waitForTimeout(450)
  const path = resolve(outDir, name)
  await page.screenshot({ path, fullPage: false })
  console.log('saved', name)
}

const waitProkat = async (page: Page) => {
  await page.waitForSelector('[data-prokat-root]', { timeout: 60000 })
  await page.waitForTimeout(700)
}

const shot = async (
  path: string,
  opts: { phone?: boolean; width?: number; height?: number; keepHover?: boolean },
  name: string,
  interact?: (page: Page) => Promise<void>,
) => {
  const phone = Boolean(opts.phone)
  const context = await browser.newContext({
    viewport: { width: opts.width ?? (phone ? 390 : 1440), height: opts.height ?? (phone ? 844 : 900) },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    deviceScaleFactor: phone ? 2 : 1,
  })
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
  await waitProkat(page)
  if (interact) await interact(page)
  await save(page, name, { keepHover: opts.keepHover })
  await context.close()
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/local/bin/google-chrome',
})

await shot('/prokat-shot?view=dashboard', {}, '01-staff-home-desktop-1440.png')
await shot('/prokat-shot?view=dashboard&phone=1', { phone: true }, '02-staff-home-phone-390.png')
await shot('/prokat-shot?view=bookings', {}, '03-staff-bookings-desktop-1440.png')
await shot('/prokat-shot?view=timeline', { keepHover: true }, '04-timeline-tooltip-desktop-1440.png', async page => {
  const target = page.locator('[data-prokat-screen="timeline"] button[data-prokat-bar-tip]').first()
  await target.waitFor({ timeout: 15000 })
  await target.scrollIntoViewIfNeeded()
  await target.hover()
  await page.getByRole('tooltip').waitFor({ timeout: 5000 })
  await page.waitForTimeout(300)
})
await shot('/prokat-shot?view=item', { height: 1100 }, '05-item-card-late-fee-desktop-1440.png', async page => {
  await page.getByRole('heading', { name: /SUP Red|SUP Aqua|Trek|Предмет/ }).first().waitFor({ timeout: 15000 }).catch(() => {})
  await page.getByText('Показывать клиентам').first().waitFor({ timeout: 15000 })
  await page.locator('[data-prokat-late-formula]').first().waitFor({ timeout: 15000 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)
})
await shot('/prokat-shot?view=overdue', { height: 1100 }, '06-overdue-booking-desktop-1440.png', async page => {
  await page.getByText('Штраф за просрочку').first().waitFor({ timeout: 15000 })
  await page.waitForSelector('[data-correspondence-module], [data-prokat-thread]', { timeout: 20000 })
  await page.getByText('Дмитрий Соколов').first().waitFor({ timeout: 15000 })
  await page.getByText(/SUP Red Paddle ещё на съёмке|штрафом за просрочку/).first().waitFor({ timeout: 15000 })
  await page.locator('[data-correspondence-module], [data-prokat-thread]').first().evaluate(node => {
    node.scrollIntoView({ block: 'center' })
  })
  await page.waitForTimeout(500)
})
await shot('/prokat-shot?view=catalog&phone=1', { phone: true }, '07-client-catalog-phone-390.png')
await shot('/prokat-shot?view=request&phone=1', { phone: true }, '08-request-modal-phone-390.png', async page => {
  const dialog = page.getByRole('dialog')
  await dialog.waitFor({ timeout: 15000 })
  const pickDate = async (label: string, dayText: string) => {
    await dialog.getByLabel(label).click()
    await page.waitForTimeout(300)
    await page.locator('button').filter({ hasText: new RegExp(`^${dayText}$`) }).last().click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(200)
  }
  await pickDate('Дата начала', '26')
  await pickDate('Дата окончания', '27')
  await dialog.getByText('Сначала выберите даты').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  await dialog.locator('button[aria-pressed]:not([disabled])').first().click({ timeout: 8000 }).catch(() => {})
  await dialog.getByText('Предварительно').waitFor({ timeout: 5000 })
  await page.waitForTimeout(500)
})
await shot('/prokat-shot?view=dashboard&phone=1', { phone: true }, '09-staff-nav-phone-390.png', async page => {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.getByRole('navigation', { name: 'Разделы приложения' }).waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: 'Ещё' }).click()
  await page.getByRole('region', { name: 'Другие разделы' }).waitFor({ timeout: 5000 })
  await page.waitForTimeout(400)
})

await browser.close()
console.log('done', outDir)
