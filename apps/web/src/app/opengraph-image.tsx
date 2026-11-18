import { ImageResponse } from 'next/og'

export const alt = 'Scatta — приложения поверх ваших таблиц'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Картинка для ссылок в мессенджерах и соцсетях.
 *
 * Рисуется кодом, а не лежит файлом: тогда она не разъезжается с текстом
 * на сайте и её не нужно перерисовывать в редакторе при каждой правке
 * формулировки. Ссылками на продукт будут делиться в Telegram и WhatsApp,
 * где без этой картинки показывается пустой прямоугольник.
 */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#f6f2e9',
          padding: 72,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* Тот же знак, что и в шапке сайта: скруглённый квадрат и три строки. */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: '#618764',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 5,
              padding: 12,
            }}
          >
            <div style={{ height: 6, borderRadius: 3, background: '#ffffff', opacity: 0.95 }} />
            <div style={{ height: 6, width: 22, borderRadius: 3, background: '#ffffff', opacity: 0.72 }} />
            <div style={{ height: 6, width: 27, borderRadius: 3, background: '#ffffff', opacity: 0.5 }} />
          </div>
          <div style={{ fontSize: 30, color: '#3f4a3c', fontWeight: 600 }}>Scatta</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 72, lineHeight: 1.05, color: '#23261f', fontWeight: 700 }}>
            Ваши таблицы становятся приложением
          </div>
          <div style={{ fontSize: 30, color: '#5c6152', maxWidth: 900 }}>
            Загрузите таблицу — получите рабочее приложение для сотрудников и клиентов.
            Без программистов.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, fontSize: 24, color: '#5c6152' }}>
          <span style={{ background: '#e7e0d1', borderRadius: 999, padding: '10px 22px' }}>
            Данные в России
          </span>
          <span style={{ background: '#e7e0d1', borderRadius: 999, padding: '10px 22px' }}>
            Работает с телефона
          </span>
          <span style={{ background: '#e7e0d1', borderRadius: 999, padding: '10px 22px' }}>
            Бесплатный тариф
          </span>
        </div>
      </div>
    ),
    size,
  )
}
