import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium, type Page } from 'playwright'

const sha = process.argv[2] || 'local'
const outDir = resolve('/workspace/artifacts')
const optDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })
mkdirSync(optDir, { recursive: true })

const catalog = 'http://127.0.0.1:3210/a/prodazhi-2?screen=scr_5n42y3zqk1xiyk7t'
const shopCookie = { name: 'tableapp_staff', value: 'ses_acceptbuyer', url: 'http://127.0.0.1:3210' }

const hide = async (page: Page) => {
  await page.addStyleTag({
    content: `nextjs-portal, agentation-toolbar, [data-nextjs-toast], [data-next-badge], #__next-build-watcher, [aria-label*="Next.js"] { display: none !important; }`,
  })
}

const save = async (page: Page, viewport: string, screen: string) => {
  await hide(page)
  await page.waitForTimeout(300)
  const file = `fix2-${sha}-${viewport}-${screen}.png`
  const path = resolve(outDir, file)
  await page.screenshot({ path, fullPage: false })
  copyFileSync(path, resolve(optDir, file))
  console.log('saved', file)
}

const browser = await chromium.launch({ headless: true })

// Measure clipping at 720 and 800
for (const h of [720, 800]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: h }, locale: 'ru-RU', deviceScaleFactor: 1 })
  await ctx.addCookies([shopCookie])
  const page = await ctx.newPage()
  await page.goto(catalog, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const info = await page.evaluate(() => {
    const sidebar = document.querySelector('aside[aria-label="Фильтры каталога"]') as HTMLElement
    const lastPrice = [...sidebar.querySelectorAll('label, button')].reverse().find(el => /3 000|От 3/.test(el.textContent || ''))
    const reset = [...sidebar.querySelectorAll('button')].find(b => b.textContent?.includes('Сбросить'))
    const last = lastPrice?.getBoundingClientRect()
    const rst = reset?.getBoundingClientRect()
    const marks = [...sidebar.querySelectorAll('[class*="filterMark"]')].map(el => ({
      appearance: el.getAttribute('data-appearance'),
      radius: getComputedStyle(el).borderRadius,
    }))
    return {
      lastBottom: last?.bottom,
      resetTop: rst?.top,
      gap: (rst && last) ? rst.top - last.bottom : null,
      lastInView: last ? last.bottom <= window.innerHeight && last.top >= 0 : null,
      resetInView: rst ? rst.bottom <= window.innerHeight && rst.top >= 0 : null,
      overlapping: (rst && last) ? last.bottom > rst.top + 1 : null,
      marks,
    }
  })
  console.log(`viewport 1280x${h}`, info)
  await ctx.close()
}

// Shots
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU', deviceScaleFactor: 1 })
  await ctx.addCookies([shopCookie])
  const page = await ctx.newPage()
  page.setDefaultTimeout(40_000)
  await page.goto(catalog, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  await save(page, 'd1280', 'catalog-default')
  const price = page.locator('aside[aria-label="Фильтры каталога"] label').filter({ hasText: '1 000–3 000' }).first()
  await price.click()
  await page.waitForTimeout(400)
  await save(page, 'd1280', 'catalog-price-chips')
  await ctx.close()
}

{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', deviceScaleFactor: 1 })
  await ctx.addCookies([shopCookie])
  const page = await ctx.newPage()
  page.setDefaultTimeout(40_000)
  await page.goto(catalog, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /Фильтры/ }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Фильтры' })
  await dialog.waitFor({ state: 'visible' })
  await dialog.getByText('Цена', { exact: true }).scrollIntoViewIfNeeded()
  await page.waitForTimeout(350)
  await save(page, 'm390', 'catalog-sheet-price')
  await ctx.close()
}

await browser.close()
console.log('done', sha)
