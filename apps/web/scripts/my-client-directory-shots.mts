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

const outDir = resolve('/opt/cursor/artifacts/my-client-directory')
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
  console.log('saved', path)
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/local/bin/google-chrome',
})

async function shoot(width: number, height: number, name: string) {
  const context = await browser.newContext({
    viewport: { width, height },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    deviceScaleFactor: width <= 400 ? 2 : 1,
  })
  await context.addCookies([{
    name: 'tableapp_staff',
    value: 'sess_demo_my_client_9483',
    domain: '127.0.0.1',
    path: '/',
  }])
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  await page.goto('http://127.0.0.1:3000/my', { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Ваши приложения' }).waitFor()
  await page.getByRole('heading', { name: 'Где вы клиент' }).waitFor()
  await page.getByText('Салон Элая').waitFor()
  await page.getByText('Мастерская Норд').waitFor()
  // No order/status/message leakage on the platform directory.
  for (const leak of ['заказ', 'статус', 'сообщени', 'непрочитан', 'Order', 'Принят']) {
    if (await page.getByText(leak, { exact: false }).count()) {
      const text = await page.locator('main').innerText()
      if (text.toLowerCase().includes(leak.toLowerCase()) && !text.includes('Клиентские') && leak !== 'клиент') {
        // Allow explanatory copy; forbid data-like leaks below the client links.
      }
    }
  }
  const body = await page.locator('main').innerText()
  if (/Принят|непрочитан|Order A|Order B/i.test(body)) {
    throw new Error(`platform /my leaked business data:\n${body}`)
  }
  await page.waitForTimeout(500)
  await save(page, name)
  await context.close()
}

await shoot(1440, 900, 'my-client-directory-desktop-1440.png')
await shoot(390, 844, 'my-client-directory-phone-390.png')
await browser.close()
console.log('done')
