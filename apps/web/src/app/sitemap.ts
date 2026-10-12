import type { MetadataRoute } from 'next'
import { PUBLIC_ROUTES } from '@/lib/site'
import { absolute } from '@/lib/site-url'
import { SOLUTIONS } from '@/lib/solutions'
import { STARTER_TEMPLATES } from '@/lib/templates/catalog'

/**
 * Карта сайта.
 *
 * Собирается из тех же списков, по которым строятся сами страницы: решения —
 * из перечня решений, шаблоны — из каталога шаблонов. Второй список здесь
 * означал бы, что новый шаблон появляется на сайте, но не появляется в карте,
 * и узнаём мы об этом через месяц по отсутствию страницы в поиске.
 *
 * Чего здесь нет: рабочего пространства, входа и приложений клиентов —
 * им в поиске делать нечего. Правовых страниц тоже нет, пока они заготовки
 * и закрыты от индексации: карта сайта не должна звать поисковика туда,
 * откуда он получит отказ.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return [
    { url: absolute(PUBLIC_ROUTES.home), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: absolute(PUBLIC_ROUTES.features), lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: absolute(PUBLIC_ROUTES.howItWorks), lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: absolute(PUBLIC_ROUTES.solutions), lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    ...SOLUTIONS.map((solution) => ({
      url: absolute(`/solutions/${solution.slug}`),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    { url: absolute(PUBLIC_ROUTES.templates), lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    ...STARTER_TEMPLATES.map((template) => ({
      url: absolute(`/templates/${template.id}`),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    { url: absolute(PUBLIC_ROUTES.pricing), lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: absolute(PUBLIC_ROUTES.demo), lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
  ]
}
