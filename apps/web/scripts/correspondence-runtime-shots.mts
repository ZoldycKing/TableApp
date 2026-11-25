import { createRequire } from 'node:module'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from 'playwright'

const require = createRequire(import.meta.url)
const playwright = (() => {
  try { return require('playwright') as typeof import('playwright') }
  catch { return require('/tmp/pw/node_modules/playwright') as typeof import('playwright') }
})()
const { chromium } = playwright

const fixture = JSON.parse(readFileSync('/tmp/correspondence-runtime.json', 'utf8')) as {
  service: { operatorUrl: string; clientUrl: string }
  builder: { url: string }
  cookies: { staff: string; client: string; member: string }
}

const outDir = resolve('/opt/cursor/artifacts/correspondence-runtime')
mkdirSync(outDir, { recursive: true })

const hide = async (page: Page) => {
  await page.addStyleTag({
    content: `nextjs-portal, agentation-toolbar, [data-nextjs-toast], [data-next-badge], [data-nextjs-dev-tools-button], [data-nextjs-dev-tools-menu], #__next-build-watcher, [aria-label*="Next.js"] { display: none !important; }`,
  })
}

const save = async (page: Page, name: string) => {
  await hide(page)
  await page.mouse.move(2, 2)
  await page.waitForTimeout(400)
  const path = resolve(outDir, name)
  await page.screenshot({ path, fullPage: false })
  console.log('saved', name)
}

const cookieHeader = (raw: string) => raw.split(';').map(part => {
  const [name, ...rest] = part.trim().split('=')
  return { name: name!, value: rest.join('='), domain: '127.0.0.1', path: '/' }
})

/** Frame the estimate lines (stacked on phone) and keep chat in view below when possible. */
const frameLinesAndChat = async (page: Page) => {
  await page.evaluate(() => {
    const lines = document.querySelector('[data-service-lines]') as HTMLElement | null
    const heading = Array.from(document.querySelectorAll('h2, h3, [class*="detailSection"]')).find(node => /Работы и запчасти|Смета/.test(node.textContent ?? '')) as HTMLElement | undefined
    const target = heading ?? lines
    if (!target) return
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
    const offset = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 48
    scroller.scrollTop = Math.max(0, offset)
  })
  await page.waitForTimeout(500)
}

const assertStackedLines = async (page: Page) => {
  const ok = await page.evaluate(() => {
    const wrap = document.querySelector('[data-service-lines]') as HTMLElement | null
    if (!wrap) return { ok: false, reason: 'no lines wrap' }
    const table = wrap.querySelector('table') as HTMLElement | null
    const stack = wrap.querySelector('ul[aria-label="Работы и запчасти"]') as HTMLElement | null
    if (!stack) return { ok: false, reason: 'no stack list' }
    const tableHidden = !table || getComputedStyle(table).display === 'none'
    const stackShown = getComputedStyle(stack).display !== 'none'
    const text = stack.innerText.replace(/\s+/g, ' ')
    if (!tableHidden || !stackShown) return { ok: false, reason: `visibility tableHidden=${tableHidden} stackShown=${stackShown}` }
    if (/запчас\s|Работа\s+по\s+замене/.test(stack.innerText) && stack.querySelectorAll('li').length < 2) {
      return { ok: false, reason: 'looks crushed', text }
    }
    if (!/×/.test(text) || !/Итого/.test(text)) return { ok: false, reason: 'missing qty×price or total', text }
    return { ok: true, text }
  })
  if (!ok.ok) throw new Error(`stacked lines check failed: ${JSON.stringify(ok)}`)
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/local/bin/google-chrome',
})

{
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    deviceScaleFactor: 1,
  })
  await context.addCookies(cookieHeader(fixture.cookies.staff))
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  await page.goto(fixture.service.operatorUrl, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-correspondence-module]', { timeout: 60000 })
  await page.getByRole('radiogroup', { name: 'Режим ответа' }).waitFor({ timeout: 60000 })
  await page.waitForTimeout(800)
  await save(page, '01-operator-repair-chat-desktop-1440.png')
  await context.close()
}

{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    deviceScaleFactor: 2,
  })
  await context.addCookies(cookieHeader(fixture.cookies.staff))
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  await page.goto(fixture.service.operatorUrl, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-service-lines]', { timeout: 60000 })
  await page.waitForTimeout(800)
  await frameLinesAndChat(page)
  await assertStackedLines(page)
  await save(page, '02-operator-repair-lines-phone-390.png')
  await context.close()
}

{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    deviceScaleFactor: 2,
  })
  await context.addCookies(cookieHeader(fixture.cookies.client))
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  await page.goto(fixture.service.clientUrl, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-correspondence-module]', { timeout: 60000 })
  await page.waitForSelector('[data-service-lines]', { timeout: 60000 })
  await page.getByText('Добрый день. Подскажите').waitFor({ timeout: 60000 })
  if (await page.getByRole('radiogroup', { name: 'Режим ответа' }).count()) throw new Error('client saw staff composer modes')
  if (await page.getByText('Клиент просил перезвонить').count()) throw new Error('client saw internal note')
  await page.waitForTimeout(800)
  await frameLinesAndChat(page)
  await assertStackedLines(page)
  await save(page, '03-client-repair-lines-chat-phone-390.png')
  await context.close()
}

{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    deviceScaleFactor: 1,
  })
  await context.addCookies(cookieHeader(fixture.cookies.member))
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  await page.goto(fixture.builder.url, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-communications-toggle]', { timeout: 60000 })
  await page.getByRole('button', { name: 'Добавить возможность' }).waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: 'Данные нового раздела' }).waitFor({ timeout: 60000 })
  const moduleSelects = await page.locator('section:has([data-communications-toggle]) select').count()
  if (moduleSelects > 0) throw new Error(`ModuleManager still has ${moduleSelects} native <select>`)
  await page.evaluate(() => {
    const section = document.querySelector('section:has([data-communications-toggle])') as HTMLElement | null
    section?.scrollIntoView({ block: 'start' })
  })
  await page.waitForTimeout(600)
  // Clip to the ModuleManager block so the v1 editor selects below stay out of frame
  const box = await page.locator('section:has([data-communications-toggle])').boundingBox()
  if (!box) throw new Error('ModuleManager section not found')
  await hide(page)
  await page.mouse.move(2, 2)
  await page.waitForTimeout(300)
  await page.screenshot({
    path: resolve(outDir, '04-builder-communications-toggle.png'),
    clip: {
      x: Math.max(0, box.x - 16),
      y: Math.max(0, box.y - 72),
      width: Math.min(box.width + 32, 1280),
      height: Math.min(box.height + 96, 900),
    },
  })
  console.log('saved', '04-builder-communications-toggle.png')
  await context.close()
}

await browser.close()
console.log('done', outDir)
