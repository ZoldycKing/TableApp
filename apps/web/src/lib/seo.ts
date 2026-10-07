import type { Metadata } from 'next'
import { absolute } from './site-url'

/**
 * Метаданные страницы.
 *
 * Один помощник вместо двадцати одинаковых блоков. Списывать заголовок,
 * описание, канонический адрес и четыре поля OpenGraph руками на каждой
 * странице — это не работа, а способ однажды забыть половину и узнать
 * об этом из поиска, где у трёх страниц окажется одно описание.
 */

export type PageMeta = {
  /** Адрес страницы от корня: по нему считается canonical и OpenGraph. */
  path: string
  /** Заголовок вкладки и ссылки в поиске. Без хвоста «· TableApp» — он общий. */
  title: string
  /** Описание для выдачи: одно предложение о том, что человек здесь найдёт. */
  description: string
  /** Тип страницы для соцсетей. Статья — для правовых документов. */
  type?: 'website' | 'article'
  /**
   * Заголовок целиком, без общего хвоста «· TableApp».
   *
   * Нужен главной: её заголовок уже начинается с имени продукта, и хвост
   * превратил бы его в «TableApp — … · TableApp».
   */
  exact?: boolean
}

export function pageMetadata({ path, title, description, type = 'website', exact }: PageMeta): Metadata {
  const url = absolute(path)
  /*
   * В соцсети уходит название продукта вместе с заголовком — так ссылка
   * узнаётся в ленте. Но не дважды: заголовок главной уже начинается
   * с «TableApp», и хвост превращал его в «TableApp — … · TableApp».
   */
  const social = exact ? title : `${title} · TableApp`

  return {
    title: exact ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      locale: 'ru_RU',
      siteName: 'TableApp',
      url,
      title: social,
      description,
    },
    twitter: { card: 'summary_large_image', title: social, description },
  }
}

/**
 * Страницы рабочего пространства и приложений клиентов.
 *
 * `robots.txt` закрывает обход, но не индексацию: адрес, на который кто-то
 * сослался, попадёт в выдачу и без обхода — заголовком и пустым описанием.
 * Отказ в индексации говорится на самой странице, и говорить его нужно там,
 * где поисковик её всё-таки открыл.
 */
export const PRIVATE_PAGE: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

/**
 * Приложения, созданные клиентами.
 *
 * По умолчанию закрыты от индексации: за адресом стоит либо внутреннее
 * приложение сотрудников, либо кабинет с чужими заказами. Витрина, открытая
 * по ссылке, — это осознанный выбор владельца, и открывать её поиску нужно
 * будет тоже осознанно, отдельной настройкой.
 */
export const CUSTOMER_APP_PAGE: Metadata = {
  robots: { index: false, follow: false },
}
