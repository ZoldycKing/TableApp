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
const base = 'http://127.0.0.1:3210/projects-shot'

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

const open = async (page: Page, view: string) => {
  await page.goto(`${base}?view=${view}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => {
    const screen = document.querySelector('[data-projects-screen]')
    return Boolean(screen && screen.getAttribute('data-projects-screen') !== 'loading')
  }, { timeout: 30000 })
  await page.waitForTimeout(500)
  if (view === 'task-chat' || view === 'task-comments') {
    const comments = page.locator('[data-task-comments]').first()
    await comments.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
  }
  if (view === 'task-time') {
    const time = page.locator('[data-task-time]')
    await time.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
  }
  if (view === 'client') {
    const gantt = page.locator('[data-projects-gantt]')
    await gantt.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
  }
  if (view === 'gantt' || view === 'project-gantt' || view === 'client') {
    await page.waitForSelector('[data-projects-gantt] [data-bar-id]', { timeout: 15000 }).catch(() => undefined)
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      const scroll = document.querySelector('[data-projects-gantt] [class*="ganttScroll"]') as HTMLElement | null
      const today = document.querySelector('[data-projects-gantt] [class*="ganttToday"]') as HTMLElement | null
      if (scroll && today) scroll.scrollLeft = Math.max(0, today.offsetLeft - Math.max(40, scroll.clientWidth * 0.35))
    })
    await page.waitForTimeout(300)
  }
}

const browser = await chromium.launch({ headless: true })

const desktop = [
  ['gantt', 'projects-s2-desktop-gantt.png'],
  ['project-gantt', 'projects-s2-desktop-project-gantt.png'],
  ['task-time', 'projects-s2-desktop-timer.png'],
  ['task', 'projects-s2-desktop-roles.png'],
  ['task-chat', 'projects-s2-desktop-chat.png'],
  ['template', 'projects-s2-desktop-template-save.png'],
  ['from-template', 'projects-s2-desktop-from-template.png'],
  ['recurrence', 'projects-s2-desktop-recurrence.png'],
  ['workload', 'projects-s2-desktop-workload.png'],
  ['share', 'projects-s2-desktop-share.png'],
  ['client', 'projects-s2-desktop-client.png'],
] as const

const phone = [
  ['gantt', 'projects-s2-phone-gantt.png'],
  ['task-time', 'projects-s2-phone-timer.png'],
  ['task', 'projects-s2-phone-roles.png'],
  ['task-chat', 'projects-s2-phone-chat.png'],
  ['template', 'projects-s2-phone-template-save.png'],
  ['from-template', 'projects-s2-phone-from-template.png'],
  ['recurrence', 'projects-s2-phone-recurrence.png'],
  ['workload', 'projects-s2-phone-workload.png'],
  ['share', 'projects-s2-phone-share.png'],
  ['client', 'projects-s2-phone-client.png'],
] as const

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  for (const [view, name] of desktop) {
    await open(page, view)
    await save(page, name)
  }
  await context.close()
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', deviceScaleFactor: 2 })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  for (const [view, name] of phone) {
    await open(page, view)
    await save(page, name)
  }
  await context.close()
}

await browser.close()
