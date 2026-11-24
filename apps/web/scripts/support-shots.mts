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

const outDir = resolve('/opt/cursor/artifacts/support')
mkdirSync(outDir, { recursive: true })
const base = 'http://127.0.0.1:3210/support-shot'

const hide = async (page: Page) => {
  await page.addStyleTag({
    content: `nextjs-portal, agentation-toolbar, [data-nextjs-toast], [data-next-badge], [data-nextjs-dev-tools-button], [data-nextjs-dev-tools-menu], #__next-build-watcher, [aria-label*="Next.js"] { display: none !important; }`,
  })
}

const save = async (page: Page, name: string, fullPage = false) => {
  await hide(page)
  await page.mouse.move(2, 2)
  await page.waitForTimeout(250)
  const path = resolve(outDir, name)
  if (fullPage) {
    await page.addStyleTag({
      content: `
        [data-phone="true"] { height: auto !important; max-height: none !important; }
        [data-phone="true"] .frame { height: auto !important; min-height: 0 !important; }
        [data-phone="true"] [class*="body"] { overflow: visible !important; height: auto !important; max-height: none !important; }
      `,
    })
    await page.waitForTimeout(200)
    await page.screenshot({ path, fullPage: true })
  } else {
    await page.screenshot({ path, fullPage: false })
  }
  console.log('saved', name)
}

const open = async (page: Page, view: string, scheme?: 'light' | 'dark', phone = false) => {
  const params = new URLSearchParams({ view })
  if (scheme) params.set('scheme', scheme)
  if (phone) params.set('phone', '1')
  await page.goto(`${base}?${params}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => {
    const screen = document.querySelector('[data-support-screen]')
    return Boolean(screen && screen.getAttribute('data-support-screen') !== 'loading')
  }, { timeout: 30000 })
  await page.waitForTimeout(400)
}

const browser = await chromium.launch({ headless: true })

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  await open(page, 'clients')
  await save(page, 'clients-desktop-1440.png')
  await open(page, 'client-card')
  await save(page, 'client-page-desktop-1440.png', true)
  await context.close()
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', deviceScaleFactor: 2 })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  await open(page, 'queue', undefined, true)
  await save(page, 'tickets-phone-390.png')
  await open(page, 'client-card', undefined, true)
  await save(page, 'client-page-phone-390.png', true)
  await context.close()
}

await browser.close()
console.log('done')
