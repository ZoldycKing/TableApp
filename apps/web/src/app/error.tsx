'use client'

import Link from 'next/link'
import { ownerPrimary, ownerSecondary } from '@/components/owner-ui'

/**
 * Что человек видит, когда страница не собралась.
 *
 * Без этого файла Next показывает собственную заглушку: по-английски,
 * без выхода и без намёка, что делать. Для сайта, который продают, это хуже,
 * чем сама ошибка.
 *
 * Правила здесь три.
 *
 * Первое: **не рассказывать подробности**. `error.message` в рабочей сборке
 * Next и так заменяет на общий текст, но показывать его всё равно нельзя —
 * в тексте ошибки оказываются имена таблиц, адреса и куски запросов.
 * Человеку они не помогут, а чужому — помогут.
 *
 * Второе: **предложить повтор**. Большая часть таких отказов — разовые:
 * оборвалось соединение с базой, не дождались ответа. `reset()` перерисовывает
 * ветку заново, и это дешевле перезагрузки всей страницы.
 *
 * Третье: **не зависеть ни от чего**. Ни базы, ни сессии, ни общей оболочки
 * сайта: страница ошибки, которой для показа нужен работающий сервер, —
 * это вторая ошибка поверх первой. Поэтому здесь только разметка и ссылки.
 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="platform-surface mx-auto flex min-h-[70vh] w-full max-w-xl flex-col justify-center px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold">Страница не открылась</h1>
      <p className="mt-5 text-ink-soft">
        Что-то не сработало на нашей стороне. Данные это не затронуло — попробуйте ещё раз.
      </p>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className={ownerPrimary}
        >
          Попробовать снова
        </button>
        <Link
          href="/"
          className={ownerSecondary}
        >
          На главную
        </Link>
      </div>
    </main>
  )
}
