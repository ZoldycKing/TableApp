import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CUSTOMER_APP_PAGE } from '@/lib/seo'
import { AppLogin } from '@/components/runtime/app-login'
import { AppShell } from '@/components/runtime/app-shell'
import { appEntry } from '@/lib/app-entry'
import { homeScreenFor, screensFor } from '@/lib/app-roles'
import { currentAppAccess } from '@/lib/app-session'
import { loadAppMeta, loadPublishedApp } from '@/lib/app-runtime'
import {isPublishedBuilderV2,PublishedBuilderV2Page,publishedBuilderV2Title} from '@/components/builder/v2/published-page'

// Приложение читает живые данные: кэшировать страницу между запросами нельзя.
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  if(await isPublishedBuilderV2(slug)) return {title:await publishedBuilderV2Title(slug),...CUSTOMER_APP_PAGE}
  const meta = await loadAppMeta(slug)
  if (!meta) return { title: 'Приложение не найдено', ...CUSTOMER_APP_PAGE }
  return {
    title: meta.business ? `${meta.business.name} · ${meta.name}` : meta.name,
    manifest: `/a/${slug}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: meta.business?.name ?? meta.name, statusBarStyle: 'default' },
    /*
     * Приложения клиентов не индексируются по умолчанию: за адресом стоит
     * либо внутреннее приложение сотрудников, либо кабинет с чужими заказами.
     * Витрина, открытая по ссылке, — осознанный выбор владельца, и открывать
     * её поиску нужно будет тоже осознанно, отдельной настройкой.
     */
    ...CUSTOMER_APP_PAGE,
  }
}

export default async function AppRuntimePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ error?: string; login?: string; screen?: string; row?: string; e?: string; r?: string }>
}) {
  const { slug } = await params
  const query=await searchParams
  if(await isPublishedBuilderV2(slug))return <PublishedBuilderV2Page slug={slug} query={query}/>
  const {error,login}=query

  const meta = await loadAppMeta(slug)
  if (!meta) notFound()

  const { visitor, viewer } = await currentAppAccess(meta.app)
  const entry = appEntry(query.e, query.r)
  const requestedScreen = entry && meta.app.screens.find(screen => screen.id === entry.e)
  const openScreens = screensFor(meta.app, visitor)
  const requested = openScreens.find(screen => screen.id === requestedScreen?.id)

  /*
   * Три размера, а не два. На телефоне приложение во весь экран. На планшете —
   * карточка в рамке, как раньше. На компьютере рамку убираем совсем: там
   * у приложения своё боковое меню и широкая раскладка, и телефонная полоса
   * посреди монитора выглядела бы недоразумением.
   */
  const shell =
    'mx-auto h-dvh w-full max-w-md overflow-hidden bg-white sm:my-6 sm:h-[min(860px,calc(100dvh-3rem))] sm:rounded-3xl sm:border sm:border-sand-200 sm:shadow-lift lg:my-0 lg:h-dvh lg:max-w-none lg:rounded-none lg:border-0 lg:shadow-none'

  const backdrop = 'min-h-dvh bg-white sm:bg-sand-100 lg:bg-white'

  // Дверь закрыта не режимом доступа, а тем, что этой роли не открыт
  // ни один экран: гость с формой заявки должен войти без пароля.
  // Гость может открыть вход сам: в открытом приложении он видит витрину
  // и форму, а свои заявки — только после входа по коду на почту.
  const wantsLogin = !viewer && (login === '1' || (requestedScreen && !requested))

  if (wantsLogin || !openScreens.length) {
    return (
      <div className={backdrop}>
        <main className={`${shell} flex items-center lg:mx-auto lg:max-w-md`}>
          <AppLogin slug={slug} appName={meta.business ? `${meta.business.name} · ${meta.name}` : meta.name} accent={meta.accent} initialError={error ?? null} entry={requestedScreen ? entry : undefined} />
        </main>
      </div>
    )
  }

  // Правила видимости строк применяются на сервере по адресу вошедшего.
  const initial = requested ?? homeScreenFor(meta.app, visitor)
  const runtime = await loadPublishedApp(slug, visitor, { screenId: initial?.id ?? '', ...(requested && entry?.r ? { rowId: entry.r } : {}) })
  if (!runtime) notFound()

  return (
    <div className={backdrop}>
      <main className={shell}>
        <AppShell
          runtime={runtime}
          viewer={viewer ? { id: viewer.id, email: viewer.email, name: viewer.name, ...(viewer.workspaceSession ? { workspaceSession: true } : {}) } : null}
          // Предлагать вход есть смысл, только если за ним что-то есть:
          // экран, открытый вошедшим, а не всем подряд.
          canSignIn={!viewer && meta.app.screens.some((item) => item.access.roles.length > 0)}
          // Настоящее приложение — единственное место, где оболочка занимает
          // страницу целиком. Здесь «Назад» обязано ходить по её экранам:
          // на телефоне это тот же жест, которым закрывают что угодно.
          browserHistory
        />
      </main>
    </div>
  )
}
