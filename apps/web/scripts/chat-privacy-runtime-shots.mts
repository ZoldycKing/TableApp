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
  service: {
    operatorUrl: string
    clientUrl: string
    messagesUrl: string
    clientMessagesUrl: string
    operatorMessagesUrl: string
    device?: string
  }
  cookies: { staff: string; client: string; member: string; ownerStaff?: string }
}

const outDir = resolve('/opt/cursor/artifacts/chat-privacy-runtime')
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

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/local/bin/google-chrome',
})

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
  await page.goto(fixture.service.clientMessagesUrl, { waitUntil: 'networkidle' })
  await page.getByRole('navigation').getByRole('button', { name: 'Чат' }).waitFor({ timeout: 60000 })
  await page.getByRole('navigation', { name: 'Диалоги' }).waitFor({ timeout: 60000 })
  await page.getByText(/24\.11\.2026|23\.11\.2026/).first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(700)
  await save(page, '01-client-chat-list-phone-390.png')
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
  await page.goto(fixture.service.clientMessagesUrl, { waitUntil: 'networkidle' })
  await page.getByRole('navigation', { name: 'Диалоги' }).waitFor({ timeout: 60000 })
  const first = page.getByRole('navigation', { name: 'Диалоги' }).getByRole('button').first()
  await first.click()
  await page.getByRole('button', { name: 'Все диалоги' }).waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: 'Открыть запись' }).waitFor({ timeout: 60000 })
  await page.getByText('Добрый день. Подскажите').or(page.getByText('Можно уточнить стоимость')).waitFor({ timeout: 60000 })
  await page.waitForTimeout(700)
  await save(page, '02-client-chat-thread-phone-390.png')
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
  if (await page.getByText('Клиент просил перезвонить').count()) throw new Error('client saw internal note')
  await page.evaluate(() => document.querySelector('[data-correspondence-module]')?.scrollIntoView({ block: 'start' }))
  await page.waitForTimeout(700)
  await save(page, '03-client-repair-card-chat-phone-390.png')
  await context.close()
}

{
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    deviceScaleFactor: 1,
  })
  await context.addCookies(cookieHeader(fixture.cookies.client))
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  await page.goto(fixture.service.clientMessagesUrl, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Чат' }).first().waitFor({ timeout: 60000 })
  await page.getByRole('navigation', { name: 'Диалоги' }).waitFor({ timeout: 60000 })
  await page.getByText(/24\.11\.2026|23\.11\.2026/).first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(700)
  await save(page, '04-client-chat-desktop-1440.png')
  await context.close()
}

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
  await page.goto(fixture.service.operatorMessagesUrl, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Сообщения' }).first().waitFor({ timeout: 60000 })
  await page.getByRole('navigation', { name: 'Диалоги' }).waitFor({ timeout: 60000 })
  await page.getByText('Мария Сидорова').first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(700)
  await save(page, '05-business-messages-desktop-1440.png')
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
  await page.goto(fixture.service.operatorMessagesUrl, { waitUntil: 'networkidle' })
  await page.getByRole('navigation', { name: 'Диалоги' }).waitFor({ timeout: 60000 })
  await page.getByText('Мария Сидорова').first().waitFor({ timeout: 60000 })
  const more = page.getByRole('button', { name: 'Ещё' })
  if (await more.count()) await more.click()
  await page.getByRole('button', { name: 'Сообщения' }).waitFor({ timeout: 10000 })
  await page.waitForTimeout(500)
  await save(page, '06-business-messages-phone-390.png')
  await context.close()
}

{
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    deviceScaleFactor: 1,
  })
  await context.addCookies(cookieHeader(fixture.cookies.client))
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  await page.goto('http://127.0.0.1:3210/my', { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Ваши приложения' }).waitFor({ timeout: 60000 })
  await page.getByText(/Рабочих приложений пока нет|Клиентские кабинеты/).waitFor({ timeout: 60000 })
  if (await page.getByRole('link', { name: /Сервис|Correspondence|service/i }).count()) {
    throw new Error('platform /my listed a business app for the client')
  }
  await page.waitForTimeout(500)
  await save(page, '07-platform-client-profile-no-businesses.png')
  await context.close()
}

await browser.close()
console.log('done', outDir)
