import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page, BrowserContext } from 'playwright'

const require = createRequire(import.meta.url)
const playwright = (() => {
  try { return require('playwright') as typeof import('playwright') }
  catch { return require('/tmp/node_modules/playwright') as typeof import('playwright') }
})()
const { chromium } = playwright

const outDir = resolve('/opt/cursor/artifacts')
mkdirSync(outDir, { recursive: true })
const host = 'http://127.0.0.1:3000'

const hide = async (page: Page) => {
  await page.addStyleTag({
    content: `nextjs-portal, agentation-toolbar, [data-nextjs-toast], [data-next-badge], [data-nextjs-dev-tools-button], [data-nextjs-dev-tools-menu], #__next-build-watcher, [aria-label*="Next.js"] { display: none !important; }`,
  })
}

const save = async (page: Page, name: string) => {
  await hide(page)
  await page.mouse.move(2, 2)
  await page.waitForTimeout(200)
  await page.screenshot({ path: resolve(outDir, name), fullPage: false })
  console.log('saved', name)
}

const waitProjects = async (page: Page) => {
  await page.waitForFunction(() => {
    const screen = document.querySelector('[data-projects-screen]')
    return Boolean(screen && screen.getAttribute('data-projects-screen') !== 'loading')
  }, { timeout: 30000 })
  await page.waitForTimeout(400)
}

const waitDispatch = async (page: Page) => {
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-dispatch-screen], [data-dispatch-root], [data-projects-root]')
    return Boolean(root) || document.body.innerText.includes('Заявки')
  }, { timeout: 30000 })
  await page.waitForTimeout(400)
}

const openProjects = async (page: Page, view: string, scheme?: 'dark') => {
  const qs = new URLSearchParams({ view })
  if (scheme) qs.set('scheme', scheme)
  await page.goto(`${host}/projects-shot?${qs}`, { waitUntil: 'networkidle' })
  await waitProjects(page)
  if (view === 'gantt' || view === 'project-gantt') {
    await page.waitForSelector('[data-projects-gantt] [data-bar-id]', { timeout: 15000 }).catch(() => undefined)
    await page.evaluate(() => {
      const scroll = document.querySelector('[data-projects-gantt] [class*="ganttScroll"]') as HTMLElement | null
      const today = document.querySelector('[data-projects-gantt] [class*="ganttToday"]') as HTMLElement | null
      if (scroll && today) {
        scroll.scrollLeft = Math.max(0, today.offsetLeft - Math.max(40, scroll.clientWidth * 0.35))
      }
    })
    await page.waitForTimeout(250)
  }
  if (view === 'board') {
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('[data-projects-root] button, [data-projects-root] [class*="card"]')
      return Array.from(document.querySelectorAll('[data-projects-root] *')).some(el => (el.textContent || '').includes('К работе') || (el.textContent || '').includes('В работе'))
    }, { timeout: 15000 }).catch(() => undefined)
    await page.waitForTimeout(300)
  }
}

const openDispatch = async (page: Page, view = 'overview') => {
  await page.goto(`${host}/dispatch-shot?view=${view}`, { waitUntil: 'networkidle' })
  await waitDispatch(page)
  await page.waitForSelector('button', { timeout: 15000 })
  await page.waitForTimeout(300)
}

const openDatePicker = async (page: Page) => {
  await openProjects(page, 'create')
  const trigger = page.getByRole('button', { name: /Срок задачи|дд\.мм\.гггг/i }).first()
  await trigger.click()
  await page.waitForTimeout(400)
  await page.waitForSelector('[role="dialog"], [data-date-menu], [class*="calendar"]', { timeout: 10000 }).catch(() => undefined)
}

const browser = await chromium.launch({ headless: true })

const runDesktop = async (context: BrowserContext) => {
  const page = await context.newPage()
  page.setDefaultTimeout(30000)

  await openDispatch(page, 'overview')
  await save(page, 'dispatch_list_desktop_1440.png')

  await openProjects(page, 'board')
  await save(page, 'projects_kanban_desktop_1440.png')

  await openProjects(page, 'gantt')
  await save(page, 'projects_gantt_desktop_1440.png')

  await openProjects(page, 'board', 'dark')
  await save(page, 'projects_dark_desktop_1440.png')

  await openDatePicker(page)
  await save(page, 'projects_datepicker_desktop_1440.png')

  await context.close()
}

const runPhone = async (context: BrowserContext) => {
  const page = await context.newPage()
  page.setDefaultTimeout(30000)

  await openDispatch(page, 'overview')
  await save(page, 'dispatch_list_phone_390.png')

  await openProjects(page, 'board')
  await save(page, 'projects_kanban_phone_390.png')

  await openProjects(page, 'gantt')
  await save(page, 'projects_gantt_phone_390.png')

  await openProjects(page, 'board', 'dark')
  await save(page, 'projects_dark_phone_390.png')

  await openDatePicker(page)
  await save(page, 'projects_datepicker_phone_390.png')

  await context.close()
}

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', deviceScaleFactor: 1 })
  await runDesktop(context)
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', deviceScaleFactor: 2 })
  await runPhone(context)
}

await browser.close()
console.log('done')
