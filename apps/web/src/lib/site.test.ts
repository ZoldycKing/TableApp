import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FOOTER_COLUMNS,
  FOOTER_LEGAL,
  LEGACY_REDIRECTS,
  NAV_MAIN,
  NAV_PRODUCT,
  NAV_SOLUTIONS,
  PRIVATE_PREFIXES,
  PUBLIC_ROUTES,
} from './site'
import { SITE_URL, absolute } from './site-url'
import { SOLUTIONS } from './solutions'
import { TEMPLATES } from './templates/catalog'

/**
 * Карта сайта и ссылки на ней.
 *
 * Проверки не ради покрытия: ссылка в меню, ведущая на несуществующую
 * страницу, не падает — она просто показывает «страница не найдена» тому,
 * кто пришёл по ней из поиска. Такое находят пользователи, а не разработчик.
 */

const APP_DIR = join(process.cwd(), 'apps', 'web', 'src', 'app')

/**
 * Есть ли такая страница на самом деле.
 *
 * Смотрим в файлы, а не в список: список и проверяем. Динамический отрезок
 * адреса («/solutions/production») засчитывается по папке `[slug]`.
 */
function routeExists(path: string): boolean {
  const parts = path.split('/').filter(Boolean)
  let dir = APP_DIR

  for (const part of parts) {
    const exact = join(dir, part)
    if (existsSync(exact)) {
      dir = exact
      continue
    }
    const dynamic = join(dir, '[slug]')
    if (existsSync(dynamic)) {
      dir = dynamic
      continue
    }
    return false
  }

  return existsSync(join(dir, 'page.tsx'))
}

const ALL_LINKS = [
  ...NAV_PRODUCT,
  ...NAV_SOLUTIONS,
  ...NAV_MAIN,
  ...FOOTER_COLUMNS.flatMap((column) => column.links),
  ...FOOTER_LEGAL,
]

describe('ссылки ведут на существующие страницы', () => {
  it('каждый пункт шапки и подвала открывается', () => {
    for (const link of ALL_LINKS) {
      expect(routeExists(link.href), `${link.label} → ${link.href}`).toBe(true)
    }
  })

  it('все публичные адреса из карты существуют', () => {
    for (const path of Object.values(PUBLIC_ROUTES)) {
      expect(routeExists(path), path).toBe(true)
    }
  })

  it('страницы решений и шаблонов существуют', () => {
    for (const solution of SOLUTIONS) {
      expect(routeExists(`/solutions/${solution.slug}`), solution.slug).toBe(true)
    }
    for (const template of TEMPLATES) {
      expect(routeExists(`/templates/${template.id}`), template.id).toBe(true)
    }
  })

  it('в меню не осталось старых адресов', () => {
    // Переехавший раздел, оставшийся в подвале под старым именем, —
    // это ссылка на редирект, а значит лишний прыжок для человека и поисковика.
    for (const link of ALL_LINKS) {
      expect(link.href.startsWith('/dlya'), link.href).toBe(false)
      expect(link.href, link.href).not.toBe('/shablony')
    }
  })

  it('адреса пригодны для ссылки: латиница, нижний регистр, дефисы', () => {
    for (const path of Object.values(PUBLIC_ROUTES)) {
      expect(path, path).toMatch(/^\/$|^(\/[a-z0-9-]+)+$/)
    }
    for (const solution of SOLUTIONS) expect(solution.slug).toMatch(/^[a-z0-9-]+$/)
    for (const template of TEMPLATES) expect(template.id).toMatch(/^[a-z0-9-]+$/)
  })
})

describe('переезд старых адресов', () => {
  it('старого адреса больше нет, а новый есть', () => {
    /*
     * Оставить обе страницы значит выложить в поиск два адреса с одним
     * текстом: поисковик выберет из них сам, и обычно не тот.
     */
    for (const rule of LEGACY_REDIRECTS) {
      expect(routeExists(rule.from), `${rule.from} должен был переехать`).toBe(false)
      expect(routeExists(rule.to), `${rule.from} → ${rule.to}`).toBe(true)
    }
  })

  it('каждый старый адрес указан один раз', () => {
    const from = LEGACY_REDIRECTS.map((rule) => rule.from)
    expect(new Set(from).size).toBe(from.length)
  })

  it('переезд не зацикливается', () => {
    const from = new Set(LEGACY_REDIRECTS.map((rule) => rule.from))
    for (const rule of LEGACY_REDIRECTS) {
      expect(from.has(rule.to), `${rule.to} сам переезжает`).toBe(false)
    }
  })
})

describe('адрес сайта', () => {
  it('без косой черты в конце: иначе адреса склеиваются с двумя', () => {
    expect(SITE_URL.endsWith('/')).toBe(false)
  })

  it('абсолютный адрес собирается из него же', () => {
    expect(absolute('/pricing')).toBe(`${SITE_URL}/pricing`)
    expect(absolute('/')).toBe(`${SITE_URL}/`)
  })
})

describe('закрытые разделы', () => {
  it('ни один закрытый префикс не совпадает с публичной страницей', () => {
    for (const path of Object.values(PUBLIC_ROUTES)) {
      for (const prefix of PRIVATE_PREFIXES) {
        expect(path.startsWith(prefix), `${path} закрыт правилом ${prefix}`).toBe(false)
      }
    }
  })

  it('приложения клиентов закрыты не обходом, а отказом на странице', () => {
    /*
     * Запрет обхода не мешает адресу попасть в выдачу — он мешает поисковику
     * прочитать «не индексировать». Поэтому `/a/` здесь быть не должно.
     */
    expect(PRIVATE_PREFIXES).not.toContain('/a/')
  })
})

describe('адрес сайта в рабочей сборке', () => {
  /*
   * Канонический адрес с localhost поисковик читает буквально: страница
   * выпадает из выдачи, а в карте сайта оказываются ссылки, по которым
   * никто не зайдёт. Проверяется сам модуль, поэтому он загружается заново
   * с другим окружением.
   */
  const env = { ...process.env }

  afterEach(() => {
    process.env = { ...env }
    vi.resetModules()
  })

  it('обязателен: без него сборка не проходит', async () => {
    vi.resetModules()
    process.env = { ...env, NODE_ENV: 'production', SITE_URL: '', APP_URL: '' }
    await expect(import('./site-url')).rejects.toThrow(/SITE_URL/)
  })

  it('localhost в рабочей сборке не принимается', async () => {
    vi.resetModules()
    process.env = { ...env, NODE_ENV: 'production', SITE_URL: 'http://localhost:3000', APP_URL: '' }
    await expect(import('./site-url')).rejects.toThrow(/localhost/)
  })

  it('настоящий домен принимается', async () => {
    vi.resetModules()
    process.env = { ...env, NODE_ENV: 'production', SITE_URL: 'https://tableapp.ru/', APP_URL: '' }
    const module = await import('./site-url')
    expect(module.SITE_URL).toBe('https://tableapp.ru')
    // Директива `Host` в robots.txt ждёт имя домена, а не ссылку.
    expect(module.siteHost()).toBe('tableapp.ru')
  })

  /*
   * А это — проверка того, из-за чего адрес вообще вынесли в свой файл.
   *
   * Переменные окружения в браузер не попадают. Пока `SITE_URL` жил
   * в `site.ts`, его читала шапка — клиентский компонент, — и в рабочей
   * сборке проверка срабатывала **в браузере**: скрипт страницы падал
   * на старте, разметка с сервера выглядела целой, а меню, выпадающие
   * списки и переходы без перезагрузки не работали. Такое не видно
   * ни в тестах разметки, ни при проверке страниц запросом: нужен либо
   * настоящий браузер, либо эта проверка.
   */
  it('карта ссылок не трогает окружение, а клиентские файлы — адрес сайта', () => {
    const map = readFileSync(join(process.cwd(), 'apps', 'web', 'src', 'lib', 'site.ts'), 'utf8')
    expect(map.includes('process.env'), 'site.ts читают клиентские компоненты').toBe(false)

    const files = clientFiles(join(process.cwd(), 'apps', 'web', 'src'))
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      if (!/^'use client'|^"use client"/m.test(text)) continue
      expect(
        text.includes("lib/site-url") || text.includes("./site-url") || text.includes("../site-url"),
        `${file} тянет адрес сайта в браузер`,
      ).toBe(false)
    }
  })
})

/** Все файлы исходников — чтобы найти среди них клиентские. */
function clientFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...clientFiles(full))
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}
