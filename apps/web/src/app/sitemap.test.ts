import { describe, expect, it } from 'vitest'
import { PRIVATE_PREFIXES, PUBLIC_ROUTES } from '@/lib/site'
import { SITE_URL, absolute } from '@/lib/site-url'
import { SOLUTIONS } from '@/lib/solutions'
import { TEMPLATES } from '@/lib/templates/catalog'
import robots from './robots'
import sitemap from './sitemap'

/**
 * Карта сайта и robots.
 *
 * Два файла, которые никто не открывает глазами и в которых ошибку замечают
 * поздно: карта, зовущая поисковика в рабочее пространство, и запрет, закрывший
 * половину сайта. Поэтому проверяются они, а не разметка страниц.
 */

const urls = () => sitemap().map((entry) => entry.url)

describe('карта сайта', () => {
  it('перечисляет публичные страницы', () => {
    const list = urls()
    for (const path of [
      PUBLIC_ROUTES.home,
      PUBLIC_ROUTES.features,
      PUBLIC_ROUTES.howItWorks,
      PUBLIC_ROUTES.solutions,
      PUBLIC_ROUTES.templates,
      PUBLIC_ROUTES.pricing,
      PUBLIC_ROUTES.demo,
    ]) {
      expect(list, path).toContain(absolute(path))
    }
  })

  it('перечисляет все решения и все шаблоны', () => {
    /*
     * Списки берутся из тех же перечней, по которым строятся страницы:
     * новый шаблон попадает в карту сам, и о его отсутствии в поиске
     * не приходится узнавать через месяц.
     */
    const list = urls()
    for (const solution of SOLUTIONS) {
      expect(list, solution.slug).toContain(absolute(`/solutions/${solution.slug}`))
    }
    for (const template of TEMPLATES) {
      expect(list, template.id).toContain(absolute(`/templates/${template.id}`))
    }
  })

  it('не зовёт поисковика в рабочее пространство', () => {
    for (const url of urls()) {
      const path = url.slice(SITE_URL.length)
      for (const prefix of PRIVATE_PREFIXES) {
        expect(path.startsWith(prefix), `${path} закрыт правилом ${prefix}`).toBe(false)
      }
      expect(path.startsWith('/a/'), path).toBe(false)
    }
  })

  it('не зовёт туда, где стоит отказ', () => {
    // Правовые страницы пока заготовки и закрыты от индексации.
    for (const url of urls()) expect(url).not.toContain('/legal/')
  })

  it('адреса абсолютные и не повторяются', () => {
    const list = urls()
    expect(new Set(list).size).toBe(list.length)
    for (const url of list) expect(url.startsWith(`${SITE_URL}/`)).toBe(true)
  })
})

describe('robots', () => {
  const rules = () => {
    const result = robots()
    const first = Array.isArray(result.rules) ? result.rules[0]! : result.rules!
    return (first.disallow ?? []) as string[]
  }

  it('закрывает рабочее пространство', () => {
    const disallow = rules()
    for (const prefix of PRIVATE_PREFIXES) expect(disallow, prefix).toContain(prefix)
  })

  it('не закрывает приложения клиентов обходом', () => {
    /*
     * Запрет обхода не мешает адресу попасть в выдачу — он мешает поисковику
     * прочитать на странице «не индексировать». Приложения закрыты отказом
     * в самой странице.
     */
    expect(rules()).not.toContain('/a/')
  })

  it('указывает на карту сайта', () => {
    expect(robots().sitemap).toBe(absolute('/sitemap.xml'))
  })
})
