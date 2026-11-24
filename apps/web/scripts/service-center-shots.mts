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
  if (view === 'repair' || view === 'client-repair' || view === 'ticket') {
    await page.waitForSelector('[data-conversation-shot-panel], [data-support-thread], [data-service-thread]', { timeout: 45000 })
  }
  await page.waitForTimeout(700)
}

/** Keep ticket/order header (status + SLA/deadline chips) in frame. */
const scrollTop = async (page: Page) => {
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    document.querySelectorAll('*').forEach(node => {
      const el = node as HTMLElement
      if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight + 8) el.scrollTop = 0
    })
  })
  await page.waitForTimeout(250)
}

/** Phone repair chat: show Переписка + first messages (cuff/estimate). */
const frameChat = async (page: Page) => {
  await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h2, h3, [class*="sectionTitle"]'))
      .find(node => /Переписка/.test(node.textContent ?? '')) as HTMLElement | undefined
    const target = heading ?? document.querySelector('[data-conversation-shot-panel], [data-service-thread]') as HTMLElement | null
    if (!target) return
    let scroller: HTMLElement | null = target
    while (scroller) {
      const { overflowY } = getComputedStyle(scroller)
      if ((overflowY === 'auto' || overflowY === 'scroll') && scroller.scrollHeight > scroller.clientHeight + 8) break
      scroller = scroller.parentElement
    }
    if (!scroller) return
    const offset = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 120
    scroller.scrollTop = Math.max(0, offset)
  })
  await page.waitForTimeout(400)
}

/** Client cabinet: stepper + pickup + cost (and Согласовать if pending) in frame. */
const frameClientCabinet = async (page: Page) => {
  await page.evaluate(() => {
    const stepper = document.querySelector('[aria-label="Прогресс ремонта"]') as HTMLElement | null
    const pickup = document.querySelector('[aria-label="Выдача"]') as HTMLElement | null
    const target = stepper ?? pickup
    if (!target) {
      window.scrollTo(0, 0)
      return
    }
    let scroller: HTMLElement | null = target
    while (scroller) {
      const { overflowY } = getComputedStyle(scroller)
      if ((overflowY === 'auto' || overflowY === 'scroll') && scroller.scrollHeight > scroller.clientHeight + 8) break
      scroller = scroller.parentElement
    }
    if (!scroller) {
      target.scrollIntoView({ block: 'start' })
      return
    }
    const offset = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 72
    scroller.scrollTop = Math.max(0, offset)
  })
  await page.waitForTimeout(400)
}

const browser = await chromium.launch({ headless: true })

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.setDefaultTimeout(45000)
  await open(page, 'service-shot', 'dashboard')
  await scrollTop(page)
  await save(page, '01-service-dashboard-desktop-1440.png')
  await open(page, 'service-shot', 'repairs')
  await scrollTop(page)
  await save(page, '02-service-repairs-desktop-1440.png')
  await open(page, 'service-shot', 'repair')
  await scrollTop(page)
  await save(page, '03-service-repair-conversation-desktop-1440.png')
  await open(page, 'support-shot', 'ticket')
  await scrollTop(page)
  await save(page, '06-support-ticket-desktop-1440.png')
  await context.close()
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', deviceScaleFactor: 2 })
  const page = await context.newPage()
  page.setDefaultTimeout(45000)
  await open(page, 'service-shot', 'client', true)
  await scrollTop(page)
  await save(page, '07-service-client-list-phone-390.png')
  await open(page, 'service-shot', 'repair', true)
  await frameChat(page)
  await save(page, '04-service-repair-operator-phone-390.png')
  await open(page, 'service-shot', 'client-repair', true)
  await frameClientCabinet(page)
  await save(page, '05-service-client-cabinet-phone-390.png')
  await context.close()
}

await browser.close()
console.log('done', outDir)
