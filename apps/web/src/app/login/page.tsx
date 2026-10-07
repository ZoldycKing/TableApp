import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/marketing/logo'
import { MemberLogin } from '@/components/member-login'
import { safeNext } from '@/lib/safe-next'
import { TEMPLATES } from '@/lib/templates/catalog'
import { currentMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'

export const dynamic = 'force-dynamic'
/*
 * В поиске этой странице делать нечего: за ней рабочее пространство.
 * Запрет в robots.txt обход закрывает, но не индексацию — адрес, на который
 * кто-то сослался, попадает в выдачу и без обхода. Отказ говорится здесь.
 */
export const metadata = { title: 'Вход', ...PRIVATE_PAGE }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await searchParams
  const target = safeNext(next)
  if (await currentMember()) redirect(target ?? '/app')

  /*
   * Человек пришёл со страницы шаблона: скажем, чем закончится вход.
   * Идентификатор проверяем по каталогу — в адресе может стоять что угодно.
   */
  const chosen = TEMPLATES.find(
    (template) => target === `/templates?take=${template.id}`,
  )

  return (
    <div className="relative min-h-dvh overflow-hidden bg-sand-50">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="animate-drift absolute -left-40 -top-32 h-[28rem] w-[28rem] rounded-full bg-sage-100 opacity-70 blur-3xl" />
        <div className="animate-drift absolute -bottom-40 -right-32 h-[26rem] w-[26rem] rounded-full bg-clay-400 opacity-[0.14] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
        <Link href="/" className="mb-8 self-start transition-opacity hover:opacity-80">
          <Logo />
        </Link>

        {chosen ? (
          <p className="mb-4 rounded-xl border border-sage-300 bg-sage-50 px-4 py-3 text-sm text-ink">
            <span aria-hidden className="mr-1.5">{chosen.emoji}</span>
            После входа вернём вас к шаблону <span className="font-semibold">«{chosen.name}»</span>.
          </p>
        ) : null}

        <div className="rounded-2xl border border-sand-200 bg-white p-7 shadow-lift">
          <MemberLogin initialError={error ?? null} next={target} />
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-ink-muted">
          Продолжая, вы соглашаетесь с{' '}
          <Link href="/legal/terms" className="underline transition-colors hover:text-ink">
            условиями использования
          </Link>{' '}
          и{' '}
          <Link href="/legal/privacy" className="underline transition-colors hover:text-ink">
            обработкой персональных данных
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
