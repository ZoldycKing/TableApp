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
  if (view === 'task-comments') {
    const comments = page.locator('[data-task-comments]')
    await comments.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
  }
  if (view === 'filters') {
    const priority = page.getByText('Приоритет', { exact: true })
    await priority.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
  }
}

const browser = await chromium.launch({ headless: true })

const desktop = [
  ['board', 'projects-desktop-board.png'],
  ['mine', 'projects-desktop-mine.png'],
  ['project', 'projects-desktop-project-tasks.png'],
  ['project-team', 'projects-desktop-project-team.png'],
  ['project-files', 'projects-desktop-project-files.png'],
  ['project-feed', 'projects-desktop-project-feed.png'],
  ['task', 'projects-desktop-task.png'],
  ['subtask', 'projects-desktop-subtask.png'],
  ['stages', 'projects-desktop-stages.png'],
  ['mention', 'projects-desktop-mention.png'],
  ['mentions', 'projects-desktop-mentions.png'],
  ['filters', 'projects-desktop-filters.png'],
  ['edit', 'projects-desktop-edit.png'],
  ['projects', 'projects-desktop-projects.png'],
  ['people', 'projects-desktop-people.png'],
  ['clients', 'projects-desktop-clients.png'],
] as const

const phone = [
  ['mine', 'projects-phone-mine.png'],
  ['board', 'projects-phone-board.png'],
  ['project', 'projects-phone-project.png'],
  ['task', 'projects-phone-task.png'],
  ['subtask', 'projects-phone-subtask.png'],
  ['stages', 'projects-phone-stages.png'],
  ['mention', 'projects-phone-mention.png'],
  ['mentions', 'projects-phone-mentions.png'],
  ['task-comments', 'projects-phone-task-comments.png'],
  ['edit', 'projects-phone-modal.png'],
  ['filters', 'projects-phone-filters.png'],
  ['projects', 'projects-phone-projects.png'],
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
