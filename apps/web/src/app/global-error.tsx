'use client'

/**
 * Последний рубеж: отказ в самой оболочке страницы.
 *
 * Обычная страница ошибки (`error.tsx`) живёт внутри общей разметки — и если
 * сломалась она сама, показать её нечем. Этот файл заменяет документ целиком,
 * поэтому в нём свои `<html>` и `<body>` и ни одного чужого компонента.
 *
 * Стили тоже свои, прямо в разметке: таблица стилей могла не загрузиться —
 * это одна из причин, по которым сюда вообще попадают. Текста ошибки здесь
 * нет намеренно, как и на обычной странице отказа.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#faf8f4',
          color: '#1c1b19',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        }}
      >
        <main style={{ maxWidth: '32rem', padding: '2rem 1.25rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, lineHeight: 1.2, margin: 0 }}>
            Сайт сейчас не открывается
          </h1>
          <p style={{ marginTop: '1.25rem', color: '#5c574f', lineHeight: 1.6 }}>
            Что-то не сработало на нашей стороне. Данные это не затронуло — попробуйте ещё раз
            или зайдите чуть позже.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '2rem',
              border: 0,
              borderRadius: '0.75rem',
              background: '#1c1b19',
              color: '#faf8f4',
              padding: '0.875rem 1.5rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Попробовать снова
          </button>
        </main>
      </body>
    </html>
  )
}
