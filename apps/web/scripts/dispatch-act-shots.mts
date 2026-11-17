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

const outDir = resolve('/opt/cursor/artifacts')
mkdirSync(outDir, { recursive: true })
const base = 'http://127.0.0.1:3210'

const hide = async (page: Page) => {
  await page.addStyleTag({
    content: `nextjs-portal, agentation-toolbar, [data-nextjs-toast], [data-next-badge], [data-nextjs-dev-tools-button], [data-nextjs-dev-tools-menu], #__next-build-watcher, [aria-label*="Next.js"] { display: none !important; }`,
  })
}

const save = async (page: Page, name: string) => {
  await hide(page)
  await page.mouse.move(2, 2)
  await page.waitForTimeout(250)
  const path = resolve(outDir, name)
  await page.screenshot({ path, fullPage: false })
  console.log('saved', name)
}

const openDispatch = async (page: Page, view: string, phone: boolean) => {
  await page.goto(`${base}/dispatch-shot?view=${view}${phone ? '&phone=1' : ''}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-dispatch-root]')
    return Boolean(root && root.getAttribute('data-dispatch-screen') !== 'loading')
  }, { timeout: 30000 })
  if (view.startsWith('complete')) {
    await page.waitForSelector('[role="dialog"]', { timeout: 15000 })
    const target = view === 'complete-refuse'
      ? '[data-refusal]'
      : '[data-testid="signature-pad"]'
    const node = page.locator(target)
    await node.waitFor({ state: 'visible', timeout: 15000 })
    await node.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
  }
  if (view === 'job') {
    const acceptance = page.locator('[data-acceptance]')
    await acceptance.waitFor({ state: 'visible', timeout: 15000 })
    await acceptance.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
  }
  await page.waitForTimeout(400)
}

const openAct = async (page: Page, refuse: boolean) => {
  await page.goto(`${base}/dispatch-shot/act-preview${refuse ? '?refuse=1' : ''}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-act-preview]', { timeout: 15000 })
  const acceptance = page.locator('[data-act-acceptance]')
  await acceptance.waitFor({ state: 'visible', timeout: 15000 })
  await acceptance.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
}

const browser = await chromium.launch({ headless: true })

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  await openDispatch(page, 'complete', false)
  await save(page, 'desktop-signature-modal.png')
  await openDispatch(page, 'complete-claims', false)
  await save(page, 'desktop-signature-claims.png')
  await openDispatch(page, 'complete-refuse', false)
  await save(page, 'desktop-signature-refusal.png')
  await openDispatch(page, 'job', false)
  await save(page, 'desktop-completed-job.png')
  await openAct(page, false)
  await save(page, 'pdf-act-normal.png')
  await openAct(page, true)
  await save(page, 'pdf-act-refusal.png')
  await context.close()
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', deviceScaleFactor: 2 })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  await openDispatch(page, 'complete', true)
  await save(page, 'phone-signature-modal.png')
  await openDispatch(page, 'job', true)
  await save(page, 'phone-completed-job.png')
  await context.close()
}

await browser.close()
