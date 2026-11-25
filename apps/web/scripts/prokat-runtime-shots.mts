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

const fixture = JSON.parse(readFileSync('/tmp/prokat-runtime.json', 'utf8')) as {
  urls: {
    staffBookings: string
    staffBooking: string
    staffTimeline: string
    staffDashboard: string
    clientCatalog: string
    clientList: string
    clientBooking: string
    templatePicker: string
  }
  cookies: { staff: string; client: string; member: string }
}

const outDir = resolve('/opt/cursor/artifacts/prokat')
mkdirSync(outDir, { recursive: true })
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3210'

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

const waitProkat = async (page: Page) => {
  await page.waitForSelector('[data-prokat-screen]', { timeout: 60000 })
  await page.waitForTimeout(600)
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
  await page.goto(fixture.urls.staffBookings, { waitUntil: 'networkidle' })
  await waitProkat(page)
  await save(page, '01-staff-bookings-desktop-1440.png')
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
  await page.goto(fixture.urls.staffBooking, { waitUntil: 'networkidle' })
  await waitProkat(page)
  await page.waitForSelector('[data-correspondence-module], [data-prokat-screen="booking"]', { timeout: 60000 })
  await page.waitForTimeout(800)
  await save(page, '02-staff-booking-card-desktop-1440.png')
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
  await page.goto(fixture.urls.staffBooking, { waitUntil: 'networkidle' })
  await waitProkat(page)
  await page.waitForTimeout(800)
  await save(page, '03-staff-booking-card-phone-390.png')
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
  await page.goto(fixture.urls.staffTimeline, { waitUntil: 'networkidle' })
  await waitProkat(page)
  await save(page, '04-timeline-desktop-1440.png')
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
  await page.goto(fixture.urls.staffDashboard, { waitUntil: 'networkidle' })
  await waitProkat(page)
  await save(page, '05-dashboard-desktop-1440.png')
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
  await page.goto(fixture.urls.clientCatalog, { waitUntil: 'networkidle' })
  await waitProkat(page)
  await page.getByRole('button', { name: 'Заявка' }).click()
  await page.getByRole('dialog').waitFor({ timeout: 15000 })
  await page.getByRole('dialog').locator('button[aria-pressed]').first().click()
  const pickDate = async (label: string, dayText: string) => {
    await page.getByLabel(label).click()
    await page.waitForTimeout(350)
    const day = page.locator('button').filter({ hasText: new RegExp(`^${dayText}$`) }).last()
    await day.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(200)
  }
  await pickDate('Дата начала', '26')
  await pickDate('Дата окончания', '28')
  await page.waitForTimeout(700)
  await page.getByText('Предварительно').scrollIntoViewIfNeeded().catch(() => {})
  await save(page, '06-client-catalog-phone-390.png')
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
  await page.goto(fixture.urls.clientList, { waitUntil: 'networkidle' })
  await waitProkat(page)
  await save(page, '07-client-bookings-phone-390.png')
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
  await page.goto(fixture.urls.clientBooking, { waitUntil: 'networkidle' })
  await waitProkat(page)
  await page.waitForSelector('[data-correspondence-module], [data-prokat-thread]', { timeout: 60000 }).catch(() => {})
  await page.evaluate(() => {
    const thread = document.querySelector('[data-prokat-thread], [data-correspondence-module]') as HTMLElement | null
    const heading = Array.from(document.querySelectorAll('h2, h3, [class*="detailSection"]')).find(node => /Переписка/.test(node.textContent ?? '')) as HTMLElement | undefined
    const target = heading ?? thread
    if (!target) return
    let scroller: HTMLElement | null = target
    while (scroller) {
      const { overflowY } = getComputedStyle(scroller)
      if ((overflowY === 'auto' || overflowY === 'scroll') && scroller.scrollHeight > scroller.clientHeight + 8) break
      scroller = scroller.parentElement
    }
    if (!scroller) { target.scrollIntoView({ block: 'start' }); return }
    const offset = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 40
    scroller.scrollTop = Math.max(0, offset)
  })
  await page.waitForTimeout(800)
  await save(page, '08-client-booking-chat-phone-390.png')
  await context.close()
}

{
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    deviceScaleFactor: 1,
  })
  await context.addCookies(cookieHeader(fixture.cookies.member))
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  const picker = fixture.urls.templatePicker || `${base}/templates?take=prokat`
  await page.goto(picker, { waitUntil: 'networkidle' })
  await page.getByText('Прокат').first().waitFor({ timeout: 60000 })
  await page.waitForSelector('img[src*="prokat"], [src*="/template-icons/prokat"]', { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(800)
  await save(page, '09-template-picker-prokat.png')
  await context.close()
}

await browser.close()
console.log('done', outDir)
