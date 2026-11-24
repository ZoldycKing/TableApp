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

const outDir = resolve('/opt/cursor/artifacts/service-center')
mkdirSync(outDir, { recursive: true })

const hide = async (page: Page) => {
  await page.addStyleTag({
    content: `nextjs-portal, agentation-toolbar, [data-nextjs-toast], [data-next-badge], [data-nextjs-dev-tools-button], [data-nextjs-dev-tools-menu], #__next-build-watcher, [aria-label*="Next.js"] { display: none !important; }`,
  })
}

const save = async (page: Page, name: string) => {
  await hide(page)
  await page.mouse.move(2, 2)
  await page.waitForTimeout(300)
  const path = resolve(outDir, name)
  await page.screenshot({ path, fullPage: false })
  console.log('saved', name)
}

const open = async (page: Page, path: string, view: string, phone = false) => {
  const params = new URLSearchParams({ view })
  if (phone) params.set('phone', '1')
  await page.goto(`http://127.0.0.1:3210/${path}?${params}`, { waitUntil: 'networkidle' })
  await page.waitForFunction((root) => {
    const screen = document.querySelector(root)
    const attr = screen?.getAttribute(root.includes('service') ? 'data-service-screen' : 'data-support-screen')
    return Boolean(screen && attr && attr !== 'loading')
  }, path.includes('service') ? '[data-service-screen]' : '[data-support-screen]', { timeout: 45000 })
  await page.waitForTimeout(500)
}

const browser = await chromium.launch({ headless: true })

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.setDefaultTimeout(45000)
  await open(page, 'service-shot', 'dashboard')
  await save(page, '01-service-dashboard-desktop-1440.png')
  await open(page, 'service-shot', 'repairs')
  await save(page, '02-service-repairs-desktop-1440.png')
  await open(page, 'service-shot', 'repair')
  await save(page, '03-service-repair-conversation-desktop-1440.png')
  await open(page, 'support-shot', 'ticket')
  await save(page, '06-support-ticket-desktop-1440.png')
  await context.close()
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', deviceScaleFactor: 2 })
  const page = await context.newPage()
  page.setDefaultTimeout(45000)
  await open(page, 'service-shot', 'repair', true)
  await save(page, '04-service-repair-operator-phone-390.png')
  await open(page, 'service-shot', 'client-repair', true)
  await save(page, '05-service-client-cabinet-phone-390.png')
  await context.close()
}

await browser.close()
console.log('done', outDir)
