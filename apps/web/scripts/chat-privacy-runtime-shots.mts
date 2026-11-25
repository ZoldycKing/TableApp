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
    vacuumClientUrl?: string
    messagesUrl: string
    clientMessagesUrl: string
    operatorMessagesUrl: string
    device?: string
    secondaryDevice?: string
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
  await page.getByText('Стиральная машина Bosch WLG').waitFor({ timeout: 60000 })
  await page.getByText('Пылесос Xiaomi G9').waitFor({ timeout: 60000 })
  if (await page.getByRole('navigation', { name: 'Диалоги' }).getByText('Мария Сидорова').count()) {
    throw new Error('client chat list still headed by client own name')
  }
  if (await page.getByRole('navigation', { name: 'Диалоги' }).getByText('Сервисный центр').count()) {
    throw new Error('client chat list still shows app name in meta')
  }
  await page.getByText(/Андрей Морозов · 2[34]\.11\.2026/).first().waitFor({ timeout: 60000 })
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
  await page.getByRole('navigation', { name: 'Диалоги' }).getByRole('button', { name: /Стиральная машина Bosch WLG/ }).click()
  await page.getByRole('button', { name: 'Все диалоги' }).waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: 'Открыть запись' }).waitFor({ timeout: 60000 })
  await page.getByText('Добрый день. Подскажите, когда будет готова стиральная машина Bosch?').waitFor({ timeout: 60000 })
  if (await page.getByRole('button', { name: 'Только непрочитанные' }).isVisible()) {
    throw new Error('client phone thread still shows unread filter')
  }
  if (await page.getByText('Вопросы бизнесу и переписка по вашим заказам и записям.').isVisible()) {
    throw new Error('client phone thread still shows list intro')
  }
  if (await page.getByRole('navigation', { name: 'Диалоги' }).isVisible()) {
    throw new Error('client phone thread still shows dialog list')
  }
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
  await page.getByText('Добрый день. Подскажите, когда будет готова стиральная машина Bosch?').waitFor({ timeout: 60000 })
  if (await page.getByText('Клиент просил перезвонить').count()) throw new Error('client saw internal note')
  await page.evaluate(() => document.querySelector('[data-correspondence-module]')?.scrollIntoView({ block: 'start' }))
  await page.waitForTimeout(700)
  await save(page, '03-client-repair-card-chat-phone-390.png')
  await context.close()
}

{
  const vacuumUrl = fixture.service.vacuumClientUrl
  if (!vacuumUrl) throw new Error('fixture missing vacuumClientUrl')
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    deviceScaleFactor: 2,
  })
  await context.addCookies(cookieHeader(fixture.cookies.client))
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  await page.goto(vacuumUrl, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-correspondence-module]', { timeout: 60000 })
  await page.getByLabel('Хронология').getByText(/пылесос Xiaomi G9|HEPA/i).first().waitFor({ timeout: 60000 })
  if (await page.getByLabel('Хронология').getByText(/стиральная машина/i).count()) throw new Error('vacuum card showed washer thread')
  if (await page.getByText('Клиент просил перезвонить').count()) throw new Error('client saw internal note on vacuum')
  await page.evaluate(() => document.querySelector('[data-correspondence-module]')?.scrollIntoView({ block: 'start' }))
  await page.waitForTimeout(700)
  await save(page, '08-client-vacuum-card-chat-phone-390.png')
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
  await page.getByText('Стиральная машина Bosch WLG').first().waitFor({ timeout: 60000 })
  await page.getByRole('region', { name: 'Переписка по обращению' }).waitFor({ timeout: 60000 })
  await page.getByText(/стиральная машина Bosch\?|пылесос Xiaomi G9|HEPA/i).first().waitFor({ timeout: 60000 })
  if (await page.getByText('Выберите диалог').count()) throw new Error('desktop client chat did not auto-select a thread')
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
  if (await page.getByRole('navigation', { name: 'Диалоги' }).getByText('Сервисный центр').count()) {
    throw new Error('staff inbox still shows app name in meta')
  }
  await page.getByRole('region', { name: 'Переписка по обращению' }).waitFor({ timeout: 60000 })
  await page.getByText(/манжет|HEPA|стиральная машина Bosch|пылесос Xiaomi/i).first().waitFor({ timeout: 60000 })
  if (await page.getByText('Выберите диалог').count()) throw new Error('desktop staff inbox did not auto-select a thread')
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
  await page.getByRole('navigation', { name: 'Диалоги' }).getByRole('button').first().click()
  await page.getByRole('button', { name: 'Все диалоги' }).waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: 'Открыть запись' }).waitFor({ timeout: 60000 })
  if (await page.getByRole('button', { name: 'Только непрочитанные' }).isVisible()) {
    throw new Error('staff phone thread still shows unread filter')
  }
  if (await page.getByRole('navigation', { name: 'Диалоги' }).isVisible()) {
    throw new Error('staff phone thread still shows dialog list')
  }
  await page.waitForTimeout(700)
  await save(page, '09-business-messages-thread-phone-390.png')
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
