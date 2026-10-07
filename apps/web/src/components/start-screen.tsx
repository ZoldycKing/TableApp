'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createTableAction } from '@/app/actions'
import { ImportScreen } from '@/components/import/import-screen'

/**
 * Первый экран нового пространства.
 *
 * Раньше человек сразу попадал на форму загрузки файла — и тот, у кого файла
 * нет, упирался в тупик. Здесь три честных пути, и у каждого сказано, чем
 * он заканчивается. Порядок не случаен: файл есть у большинства, но начать
 * с готового шаблона быстрее всего.
 */
export function StartScreen() {
  const [path, setPath] = useState<'choose' | 'import'>('choose')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  if (path === 'import') {
    return (
      <div>
        <div className="mx-auto w-full max-w-6xl px-6 pt-8">
          <button
            type="button"
            onClick={() => setPath('choose')}
            className="text-sm text-ink-muted transition-colors hover:text-ink"
          >
            ← С чего начать
          </button>
        </div>
        <ImportScreen />
      </div>
    )
  }

  const createEmpty = () =>
    startTransition(async () => {
      const result = await createTableAction('Новая таблица')
      if (result.ok) router.push(`/t/${result.tableId}`)
      else setError(result.error)
    })

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-14">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">С чего начнём?</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        Дальше всё одинаково: таблица на компьютере, приложение на телефоне, ссылка для сотрудников.
        Разница только в том, откуда взять первые данные.
      </p>

      {error ? (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <button
          type="button"
          onClick={() => router.push('/templates')}
          className="group flex flex-col rounded-2xl border border-sand-200 bg-white p-6 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-sage-400"
        >
          <span aria-hidden className="text-2xl">🛠</span>
          <span className="mt-3 font-semibold text-ink">Взять готовый шаблон</span>
          <span className="mt-1.5 text-sm text-ink-soft">
            Заявки, склад или каталог — с колонками, примерами и готовым приложением. Потом всё правится под себя.
          </span>
          <span className="mt-4 text-sm font-medium text-sage-700 group-hover:underline">Посмотреть шаблоны →</span>
        </button>

        <button
          type="button"
          onClick={() => setPath('import')}
          className="group flex flex-col rounded-2xl border border-sand-200 bg-white p-6 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-sage-400"
        >
          <span aria-hidden className="text-2xl">📄</span>
          <span className="mt-3 font-semibold text-ink">Загрузить свою таблицу</span>
          <span className="mt-1.5 text-sm text-ink-soft">
            Excel или CSV. Колонки и их типы определятся сами, вы проверите и подтвердите.
          </span>
          <span className="mt-4 text-sm font-medium text-sage-700 group-hover:underline">Выбрать файл →</span>
        </button>

        <button
          type="button"
          onClick={createEmpty}
          disabled={pending}
          className="group flex flex-col rounded-2xl border border-sand-200 bg-white p-6 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-sage-400 disabled:opacity-50"
        >
          <span aria-hidden className="text-2xl">⬜</span>
          <span className="mt-3 font-semibold text-ink">Начать с пустой</span>
          <span className="mt-1.5 text-sm text-ink-soft">
            Две колонки и ни одной строки. Для тех, кто знает, что хочет получить.
          </span>
          <span className="mt-4 text-sm font-medium text-sage-700 group-hover:underline">
            {pending ? 'Создаём…' : 'Создать таблицу →'}
          </span>
        </button>
      </div>
    </main>
  )
}
