import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/marketing/logo'
import { TemplateIcon } from '@/components/template-icon'
import { MemberLogin } from '@/components/member-login'
import { safeNext } from '@/lib/safe-next'
import { findStarter, TEMPLATES } from '@/lib/templates/catalog'
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
  const previousChoice = TEMPLATES.find(
    (template) => target === `/templates?take=${template.id}`,
  )
  const chosen = findStarter(previousChoice?.id) ?? previousChoice

  return (
    <div className="platform-surface">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
        <Link href="/" className="mb-8 self-start transition-opacity hover:opacity-80">
          <Logo height={34} />
        </Link>

        {chosen ? (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-sand-200 bg-sand-100 p-4 text-sm text-ink">
            <TemplateIcon id={chosen.id} className="size-8 shrink-0" />
            <p>Продолжите с шаблоном <span className="font-semibold">«{chosen.name}»</span> после входа.</p>
          </div>
        ) : null}

        <div className="rounded-3xl border border-sand-200 bg-white p-6 sm:p-8">
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
