import { createRequire } from 'node:module'
import { mkdirSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from 'playwright'

const require = createRequire(import.meta.url)
const playwright = (() => {
  try { return require('playwright') as typeof import('playwright') }
  catch { return require('/tmp/pw/node_modules/playwright') as typeof import('playwright') }
})()
const { chromium } = playwright

const outDir = resolve('/opt/cursor/artifacts')
const supportDir = resolve(outDir, 'support-team')
mkdirSync(supportDir, { recursive: true })
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
  await page.waitForTimeout(300)
  const path = resolve(supportDir, name)
  await page.screenshot({ path, fullPage })
  copyFileSync(path, resolve(outDir, name))
  console.log('saved', name)
}

const open = async (page: Page, view: string, opts: { scheme?: 'light' | 'dark'; phone?: boolean; team?: 'small' | 'large' } = {}) => {
  const params = new URLSearchParams({ view })
  if (opts.scheme) params.set('scheme', opts.scheme)
  if (opts.phone) params.set('phone', '1')
  if (opts.team) params.set('team', opts.team)
  await page.goto(`${base}?${params}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => {
    const screen = document.querySelector('[data-support-screen]')
    return Boolean(screen && screen.getAttribute('data-support-screen') !== 'loading')
  }, { timeout: 30000 })
  await page.waitForTimeout(500)
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/local/bin/google-chrome' })

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  await open(page, 'dashboard', { team: 'large' })
  await save(page, 'dashboard_big_team_desktop_1440.png')
  await open(page, 'team', { team: 'large' })
  await save(page, 'team_desktop_1440.png', true)
  await open(page, 'dashboard', { team: 'large', scheme: 'dark' })
  await save(page, 'dashboard_big_team_dark_1440.png')
  await context.close()
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', deviceScaleFactor: 2 })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  await open(page, 'dashboard', { team: 'large', phone: true })
  await save(page, 'dashboard_big_team_phone_390.png')
  await open(page, 'dashboard', { team: 'small', phone: true })
  await save(page, 'dashboard_small_team_phone_390.png')
  await open(page, 'team', { team: 'large', phone: true })
  await save(page, 'team_phone_390.png', true)
  await context.close()
}

await browser.close()
console.log('done')
