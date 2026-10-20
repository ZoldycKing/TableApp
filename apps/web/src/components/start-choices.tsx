import Link from 'next/link'
import { OWNER_START_PATHS, type OwnerStartPath } from '@/lib/owner-start'
import { ShellIcon } from './shell/icons'
import { TemplateIcon } from './template-icon'
import { ownerPrimary, ownerSecondary } from './owner-ui'

/** Shared first step, both before and after the first workspace exists. */
export function StartChoices({ onChoose, disabled = false }: { onChoose?: (path: OwnerStartPath) => void; disabled?: boolean }) {
  const action = (path: OwnerStartPath, className: string) => onChoose
    ? <button type="button" disabled={disabled} className={className} onClick={() => onChoose(path)}>{OWNER_START_PATHS[path].label}</button>
    : <Link href={OWNER_START_PATHS[path].href} className={className}>{OWNER_START_PATHS[path].label}</Link>
  return <>
    <div className="mt-8 grid gap-5 md:grid-cols-2">
      <section data-guide="start-import" className="flex min-w-0 flex-col rounded-2xl border border-sand-200 bg-white p-5 transition-colors hover:border-sage-300 sm:p-7">
        <div aria-hidden="true" className="mb-6 hidden h-[196px] grid-rows-[42px_28px_repeat(3,1fr)] overflow-hidden rounded-xl border border-sand-200 text-xs sm:grid">
          <div className="flex items-center justify-between gap-3 bg-sage-50 px-4 py-3 text-sage-700"><span className="flex items-center gap-2 font-medium"><ShellIcon name="table" />Товары.xlsx</span><span>Пример данных</span></div>
          <div className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-x-3 bg-sand-50 px-4 text-ink-soft"><span>Товар</span><span className="text-right">Цена, ₽</span></div>
          {[['Ежедневник А5', '1 200'], ['Блокнот в точку', '680'], ['Планер на неделю', '890']].map(([name, price]) => <div key={name} className="grid grid-cols-[minmax(0,1fr)_5rem] gap-x-3 border-t border-sand-200 px-4 py-2.5 text-ink-soft"><span className="truncate">{name}</span><span className="text-right tabular-nums">{price}</span></div>)}
        </div>
        <h2 className="flex items-center gap-3 text-xl font-semibold tracking-tight"><ShellIcon name="table" className="size-7 shrink-0 text-sage-700 sm:hidden" />У меня есть таблица</h2>
        <p className="mb-6 mt-3 flex-1 text-sm leading-6 text-ink-soft">Перенесите данные из Excel или CSV. Редактируйте ячейки, добавляйте записи и подготовьте приложение на их основе.</p>
        {action('import', `${ownerPrimary} w-full`)}
      </section>
      <section data-guide="start-template" className="flex min-w-0 flex-col rounded-2xl border border-sand-200 bg-white p-5 transition-colors hover:border-sage-300 sm:p-7">
        <div aria-hidden="true" className="mb-6 hidden h-[196px] grid-cols-3 items-center gap-2 rounded-xl bg-sand-50 px-2 py-5 sm:grid">
          {[['zakazy', 'Магазин'], ['salon', 'Салон'], ['sklad', 'Склад']].map(([id, name]) => <div key={id} className="flex min-w-0 flex-col items-center gap-3 text-sm text-ink-soft"><TemplateIcon id={id!} className="size-16" /><span>{name}</span></div>)}
        </div>
        <h2 className="flex items-center gap-3 text-xl font-semibold tracking-tight"><ShellIcon name="template" className="size-7 shrink-0 text-sage-700 sm:hidden" />Начну с готового сценария</h2>
        <p className="mb-6 mt-3 flex-1 text-sm leading-6 text-ink-soft">Магазин, салон, склад и другие задачи. Таблицы, связи и основные экраны уже подготовлены — останется добавить своё.</p>
        {action('templates', `${ownerSecondary} w-full`)}
      </section>
    </div>
    <div className="mt-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      {action('blank', 'min-h-11 rounded-lg py-3 text-left text-sm text-ink-soft underline decoration-sand-300 underline-offset-4 focus-visible:ring-2 focus-visible:ring-sage-400 disabled:opacity-40')}
      <details className="max-w-lg text-sm text-ink-soft"><summary className="min-h-11 cursor-pointer rounded-lg py-3 underline decoration-sand-300 underline-offset-4 focus-visible:ring-2 focus-visible:ring-sage-400">Как это работает?</summary><ol className="mb-3 ml-5 list-decimal space-y-3 leading-6"><li>Добавьте данные из файла, готового сценария или вручную.</li><li>Проверьте таблицы и настройте, что видят разные пользователи.</li><li>Работайте с данными в кабинете и опубликуйте подготовленное приложение.</li></ol></details>
    </div>
    <div className="mt-6 flex items-start gap-4 border-t border-sand-200 pt-6 text-ink-soft"><ShellIcon name="apps" className="mt-1 size-6 shrink-0 text-sage-700" /><div><p className="font-medium text-ink">Данные одни — экраны под каждую задачу</p><p className="mt-2 max-w-3xl text-sm leading-6">Вы управляете данными, команда получает рабочие экраны. Если нужен каталог для клиентов, его можно подготовить вместе с личным кабинетом.</p></div></div>
  </>
}
