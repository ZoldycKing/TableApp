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

const scrollThreadIntoView = async (page: Page) => {
  await page.evaluate(() => {
    const thread = document.querySelector('[data-service-thread], [data-correspondence], [data-conversation-panel]') as HTMLElement | null
    const section = thread?.closest('section') ?? thread
    if (!section) return
    section.scrollIntoView({ block: 'center' })
  })
  await page.waitForTimeout(500)
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
  await page.getByText('Добрый день. Подскажите').waitFor({ timeout: 60000 })
  await page.waitForTimeout(1200)
  await scrollThreadIntoView(page)
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
  await page.waitForSelector('[data-correspondence-module]', { timeout: 60000 })
  await page.getByRole('radiogroup', { name: 'Режим ответа' }).waitFor({ timeout: 60000 })
  await page.waitForTimeout(1200)
  await scrollThreadIntoView(page)
  await save(page, '02-operator-repair-chat-phone-390.png')
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
  await page.getByText('Добрый день. Подскажите').waitFor({ timeout: 60000 })
  // Client must not see the staff mode switch or the internal note body
  if (await page.getByRole('radiogroup', { name: 'Режим ответа' }).count()) throw new Error('client saw staff composer modes')
  if (await page.getByText('Клиент просил перезвонить').count()) throw new Error('client saw internal note')
  await page.waitForTimeout(1200)
  await scrollThreadIntoView(page)
  await save(page, '03-client-repair-chat-phone-390.png')
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
  await page.evaluate(() => {
    document.querySelector('[data-communications-toggle]')?.scrollIntoView({ block: 'center' })
  })
  await page.waitForTimeout(600)
  await save(page, '04-builder-communications-toggle.png')
  await context.close()
}

await browser.close()
console.log('done', outDir)
