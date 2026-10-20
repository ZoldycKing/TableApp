import Link from 'next/link'
import { ShellIcon } from './shell/icons'
import { ownerPrimary, ownerSecondary } from './owner-ui'

export function FirstEntry() {
  return <main className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-20">
    <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-ink">С чего начнём ваш бизнес?</h1>
    <p className="mt-4 max-w-xl text-base leading-7 text-ink-soft">Добавьте данные — затем подготовим удобные экраны для вас, команды и клиентов.</p>
    <div className="mt-10 grid gap-5 sm:grid-cols-2">
      <section className="flex flex-col items-start rounded-2xl border border-sand-200 bg-white p-6 sm:p-7" data-guide="start-import">
        <ShellIcon name="table" className="mb-6 size-8 text-sage-700" />
        <h2 className="text-lg font-semibold">У меня есть таблица</h2>
        <p className="mb-7 mt-3 flex-1 text-sm leading-6 text-ink-soft">Загрузите Excel или CSV. Проверьте данные и выберите, как с ними будут работать пользователи.</p>
        <Link href="/import" className={ownerPrimary}>Загрузить таблицу <span aria-hidden>→</span></Link>
      </section>
      <section className="flex flex-col items-start rounded-2xl border border-sand-200 bg-white p-6 sm:p-7" data-guide="start-template">
        <ShellIcon name="template" className="mb-6 size-8 text-sage-700" />
        <h2 className="text-lg font-semibold">Начну с готового сценария</h2>
        <p className="mb-7 mt-3 flex-1 text-sm leading-6 text-ink-soft">Выберите задачу бизнеса. Таблицы, связи и основные экраны уже подготовлены — останется добавить своё.</p>
        <Link href="/templates" className={ownerSecondary}>Выбрать сценарий <span aria-hidden>→</span></Link>
      </section>
    </div>
    <p className="mt-7 text-sm leading-6 text-ink-soft">Хотите настроить всё самостоятельно? <Link href="/tables" className="rounded font-medium underline decoration-sand-300 underline-offset-4 focus-visible:ring-2 focus-visible:ring-sage-400">Создайте пустую таблицу</Link>.</p>
    <p className="mt-10 max-w-xl text-sm leading-6 text-ink-muted">Пока вы готовите приложение, оно недоступно по рабочей ссылке. Перед публикацией проверим, что увидит каждая роль.</p>
  </main>
}
