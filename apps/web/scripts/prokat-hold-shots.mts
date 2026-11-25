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

const fixture = JSON.parse(readFileSync('/tmp/prokat-hold-e2e.json', 'utf8')) as {
  urls: Record<string, string>
  cookies: Record<string, string>
}

const outDir = resolve('/opt/cursor/artifacts')
mkdirSync(outDir, { recursive: true })

const hide = async (page: Page) => {
  await page.addStyleTag({
    content: `nextjs-portal, agentation-toolbar, [data-nextjs-toast], [data-next-badge], [data-nextjs-dev-tools-button], [data-nextjs-dev-tools-menu], #__next-build-watcher, [aria-label*="Next.js"] { display: none !important; }`,
  })
}

const save = async (page: Page, name: string) => {
  await hide(page)
  await page.mouse.move(2, 2)
  await page.waitForTimeout(500)
  const path = resolve(outDir, name)
  await page.screenshot({ path, fullPage: false })
  console.log('saved', name)
}

const cookieHeader = (raw: string) => raw.split(';').map(part => {
  const [name, ...rest] = part.trim().split('=')
  return { name: name!, value: rest.join('='), domain: '127.0.0.1', path: '/' }
})

const waitProkat = async (page: Page, screen?: string) => {
  const sel = screen ? `[data-prokat-screen="${screen}"]` : '[data-prokat-screen]'
  await page.waitForSelector(sel, { timeout: 60000 })
  await page.waitForTimeout(700)
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/local/bin/google-chrome',
})

const ownerCookies = [
  ...cookieHeader(fixture.cookies.ownerStaff || fixture.cookies.staff),
  ...cookieHeader(fixture.cookies.member),
]
const staffCookies = [
  ...cookieHeader(fixture.cookies.staff),
  ...cookieHeader(fixture.cookies.member),
]

const ownerContext = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: 'ru-RU',
})
await ownerContext.addCookies(ownerCookies)
const owner = await ownerContext.newPage()

// 1. Hold setting on item card (owner) — not on dashboard
const settingsUrl = fixture.urls.staffItemSettings
if (!settingsUrl) throw new Error('Missing staffItemSettings url — re-run e2e setup')
await owner.goto(settingsUrl, { waitUntil: 'networkidle' })
await waitProkat(owner, 'item')
await owner.locator('[data-prokat-hold-setting]').scrollIntoViewIfNeeded()
await owner.getByRole('button', { name: /Держать бронь после начала/ }).click()
const holdList = owner.locator('[role="listbox"][aria-label="Держать бронь после начала"]')
await holdList.waitFor({ state: 'visible', timeout: 5000 })
await holdList.scrollIntoViewIfNeeded()
await owner.waitForTimeout(300)
await save(owner, 'hold-setting-desktop.png')
await owner.keyboard.press('Escape')

const staffContext = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: 'ru-RU',
})
await staffContext.addCookies(staffCookies)
const staff = await staffContext.newPage()

// 2. Booking card with «держится до»
await staff.goto(fixture.urls.staffHoldBooking, { waitUntil: 'networkidle' })
await waitProkat(staff, 'booking')
await staff.waitForSelector('[data-prokat-hold-until]', { timeout: 15000 })
await save(staff, 'hold-until-booking-desktop.png')

// 3. Not picked up booking
await staff.goto(fixture.urls.staffNotPickedUpBooking, { waitUntil: 'networkidle' })
await waitProkat(staff, 'booking')
await staff.waitForSelector('[data-prokat-status="Не забрали"]', { timeout: 15000 })
await save(staff, 'not-picked-up-booking-desktop.png')

// 4. Client card with counter
await staff.goto(fixture.urls.staffClientCard, { waitUntil: 'networkidle' })
await waitProkat(staff, 'client-card')
await staff.waitForSelector('[data-prokat-noshow]', { timeout: 15000 })
await save(staff, 'client-noshow-desktop.png')

// 5. Notification in Сегодня (no hold setting here)
await staff.goto(fixture.urls.staffDashboard, { waitUntil: 'networkidle' })
await waitProkat(staff, 'dashboard')
if (await staff.locator('[data-prokat-hold-setting]').count()) {
  throw new Error('Hold setting must not appear on dashboard')
}
const notPickedSection = staff.getByRole('region', { name: 'Не забрали' }).or(staff.locator('[aria-label="Не забрали"]'))
await notPickedSection.first().scrollIntoViewIfNeeded().catch(() => {})
await save(staff, 'today-not-picked-up-desktop.png')

// 6. Timeline month desktop (names where they fit)
await staff.goto(fixture.urls.staffTimeline, { waitUntil: 'networkidle' })
await waitProkat(staff, 'timeline')
await staff.getByRole('button', { name: 'Месяц' }).click()
await staff.waitForTimeout(600)
await save(staff, 'timeline-month-desktop.png')

// Phone viewport
const phoneContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'ru-RU',
})
await phoneContext.addCookies(ownerCookies)
const phone = await phoneContext.newPage()

await phone.goto(settingsUrl, { waitUntil: 'networkidle' })
await waitProkat(phone, 'item')
await phone.locator('[data-prokat-hold-setting]').scrollIntoViewIfNeeded()
await phone.getByRole('button', { name: /Держать бронь после начала/ }).click()
const phoneHoldList = phone.locator('[role="listbox"][aria-label="Держать бронь после начала"]')
await phoneHoldList.waitFor({ state: 'visible', timeout: 5000 })
await phoneHoldList.scrollIntoViewIfNeeded()
await phone.waitForTimeout(300)
await save(phone, 'hold-setting-phone.png')
await phone.keyboard.press('Escape')

await phoneContext.clearCookies()
await phoneContext.addCookies(staffCookies)

await phone.goto(fixture.urls.staffHoldBooking, { waitUntil: 'networkidle' })
await waitProkat(phone, 'booking')
await phone.waitForSelector('[data-prokat-hold-until]', { timeout: 15000 })
await phone.getByRole('button', { name: 'Отметить: не забрали' }).scrollIntoViewIfNeeded()
await phone.waitForTimeout(300)
await save(phone, 'hold-until-booking-phone.png')

await phone.goto(fixture.urls.staffNotPickedUpBooking, { waitUntil: 'networkidle' })
await waitProkat(phone, 'booking')
await phone.waitForSelector('[data-prokat-status="Не забрали"]', { timeout: 15000 })
await save(phone, 'not-picked-up-booking-phone.png')

await phone.goto(fixture.urls.staffClientCard, { waitUntil: 'networkidle' })
await waitProkat(phone, 'client-card')
await phone.waitForSelector('[data-prokat-noshow]', { timeout: 15000 })
await save(phone, 'client-noshow-phone.png')

await phone.goto(fixture.urls.staffDashboard, { waitUntil: 'networkidle' })
await waitProkat(phone, 'dashboard')
if (await phone.locator('[data-prokat-hold-setting]').count()) {
  throw new Error('Hold setting must not appear on phone dashboard')
}
await save(phone, 'today-not-picked-up-phone.png')

await phone.goto(fixture.urls.staffTimeline, { waitUntil: 'networkidle' })
await waitProkat(phone, 'timeline')
await phone.locator('[data-prokat-screen="timeline"]').getByRole('button', { name: /^(2Н|2 недели)$/ }).click()
await phone.waitForSelector('[data-prokat-screen="timeline"] [data-mode="fortnight"]', { timeout: 5000 })
await phone.waitForTimeout(800)
await save(phone, 'timeline-today-line-phone.png')
await phone.locator('[data-prokat-screen="timeline"]').getByRole('button', { name: /^(М|Месяц)$/ }).click()
await phone.waitForSelector('[data-prokat-screen="timeline"] [data-mode="month"]', { timeout: 5000 })
await phone.waitForTimeout(700)
await save(phone, 'timeline-month-phone.png')

// Chat notification on not-picked-up booking
await staff.goto(fixture.urls.staffNotPickedUpBooking, { waitUntil: 'networkidle' })
await waitProkat(staff, 'booking')
const thread = staff.locator('[data-prokat-thread]')
await thread.scrollIntoViewIfNeeded().catch(() => {})
await staff.waitForTimeout(800)
await save(staff, 'not-picked-up-chat-desktop.png')

await browser.close()
console.log('done')
