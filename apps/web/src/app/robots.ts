import type { MetadataRoute } from 'next'
import { PRIVATE_PREFIXES } from '@/lib/site'
import { absolute, siteHost } from '@/lib/site-url'

/**
 * Что можно обходить.
 *
 * Закрыто рабочее пространство: там за каждым адресом стоит вход, и обходить
 * его бессмысленно. А вот приложения клиентов (`/a/...`) здесь намеренно
 * **не** закрыты: запрет в этом файле не мешает адресу попасть в выдачу —
 * он мешает поисковику прочитать на странице «не индексировать». Поэтому
 * приложения закрыты там, где это работает: отказом в самой странице
 * ([seo.ts](apps/web/src/lib/seo.ts)).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [...PRIVATE_PREFIXES],
      },
    ],
    sitemap: absolute('/sitemap.xml'),
    host: siteHost(),
  }
}
