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
          background: '#F6F5F2',
          padding: 72,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: '#3F6B5C',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 5,
              padding: 12,
              position: 'relative',
            }}
          >
            <div style={{ height: 6, borderRadius: 3, background: '#ffffff', opacity: 0.95 }} />
            <div style={{ height: 6, width: 22, borderRadius: 3, background: '#ffffff', opacity: 0.72 }} />
            <div style={{ height: 6, width: 27, borderRadius: 3, background: '#ffffff', opacity: 0.5 }} />
            <div
              style={{
                position: 'absolute',
                right: 10,
                bottom: 10,
                width: 8,
                height: 8,
                borderRadius: 999,
                background: '#C4623A',
              }}
            />
          </div>
          <div style={{ fontSize: 30, color: '#15151A', fontWeight: 600 }}>Scatta</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 72, lineHeight: 1.05, color: '#15151A', fontWeight: 700 }}>
            Ваши таблицы становятся приложением
          </div>
          <div style={{ fontSize: 30, color: '#5B5A60', maxWidth: 900 }}>
            Загрузите таблицу — получите рабочее приложение для сотрудников и клиентов.
            Без программистов.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, fontSize: 24, color: '#5B5A60' }}>
          <span style={{ background: '#E7F0EC', borderRadius: 10, padding: '10px 22px', color: '#3F6B5C' }}>
            Данные в России
          </span>
          <span style={{ background: '#E7F0EC', borderRadius: 10, padding: '10px 22px', color: '#3F6B5C' }}>
            Работает с телефона
          </span>
          <span style={{ background: '#E7F0EC', borderRadius: 10, padding: '10px 22px', color: '#3F6B5C' }}>
            Бесплатный тариф
          </span>
        </div>
      </div>
    ),
    size,
  )
}
