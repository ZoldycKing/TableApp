import { describe, expect, it } from 'vitest'
import { CUSTOMER_APP_PAGE, pageMetadata, PRIVATE_PAGE } from './seo'
import { SITE_URL } from './site-url'

/**
 * Метаданные страниц.
 *
 * Проверяется то, что не видно глазом на самой странице и обнаруживается
 * через месяц в отчёте поиска: канонический адрес, указывающий не туда,
 * и отсутствие отказа на закрытых разделах.
 */

describe('помощник метаданных', () => {
  const meta = pageMetadata({
    path: '/solutions/production',
    title: 'Производственный учёт без сложных Excel-таблиц',
    description: 'Выпуск, нормы расхода и остатки материалов в одном приложении.',
  })

  it('канонический адрес — сама страница, а не главная', () => {
    /*
     * В корневом макете стоял общий canonical «/», и он наследовался вниз:
     * каждая страница сайта просила поисковик считать её копией главной.
     */
    expect(meta.alternates?.canonical).toBe('/solutions/production')
  })

  it('в соцсети уходит полный адрес страницы', () => {
    expect(meta.openGraph?.url).toBe(`${SITE_URL}/solutions/production`)
  })

  it('заголовок для соцсетей назван вместе с продуктом', () => {
    expect(meta.openGraph?.title).toContain('Scatta')
    expect(meta.title).toBe('Производственный учёт без сложных Excel-таблиц')
  })

  it('главной хвост «· Scatta» не приписывается', () => {
    // Её заголовок уже начинается с имени продукта.
    const home = pageMetadata({
      path: '/',
      title: 'Scatta — приложения из таблиц для сотрудников и клиентов',
      description: 'Загрузите таблицу — получите рабочее приложение.',
      exact: true,
    })
    expect(home.title).toEqual({ absolute: 'Scatta — приложения из таблиц для сотрудников и клиентов' })
    // И в соцсетях тоже один раз: «Scatta — … · Scatta» читается как ошибка.
    expect(home.openGraph?.title).toBe('Scatta — приложения из таблиц для сотрудников и клиентов')
  })
})

describe('закрытые страницы', () => {
  it('рабочее пространство просит себя не индексировать', () => {
    expect(PRIVATE_PAGE.robots).toMatchObject({ index: false, follow: false })
  })

  it('приложения клиентов — тоже', () => {
    /*
     * За адресом приложения стоит либо внутреннее приложение сотрудников,
     * либо кабинет с чужими заказами. Открывать их поиску нужно осознанно
     * и отдельной настройкой, а не по умолчанию.
     */
    expect(CUSTOMER_APP_PAGE.robots).toMatchObject({ index: false, follow: false })
  })
})
