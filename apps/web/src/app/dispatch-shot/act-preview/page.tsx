import type { CSSProperties, ReactNode } from 'react'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Акт', robots: { index: false, follow: false } }

const page: CSSProperties = {
  margin: 0,
  minHeight: '100vh',
  background: '#e8ebe4',
  color: '#253c2d',
  fontFamily: "'ActSans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontSynthesis: 'none',
}
const sheet: CSSProperties = {
  boxSizing: 'border-box',
  width: 'min(100%, 720px)',
  minHeight: '100vh',
  margin: '0 auto',
  padding: '36px 40px 48px',
  background: '#fff',
  boxShadow: '0 0 0 1px #d7ddd0',
}
const muted = { color: '#687568', fontSize: 13 } as const

/** HTML stand-in of the Moscow demo act for viewport screenshots. The real PDF is `/dispatch-shot/act`. */
export default async function ActPreviewPage({ searchParams }: { searchParams: Promise<{ refuse?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const refused = (await searchParams).refuse === '1'
  return (
    <main style={page}>
      <style>{`
        @font-face{font-family:'ActSans';src:url('/template-media/dispatch/NotoSans-Regular.ttf') format('truetype');font-weight:400 700;font-style:normal;font-display:swap}
        [data-act-preview], [data-act-preview] * { font-family: 'ActSans', ui-sans-serif, system-ui, sans-serif !important; }
      `}</style>
      <article style={{ ...sheet, fontFamily: "'ActSans', ui-sans-serif, system-ui, sans-serif" }} data-act-preview>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>Акт выполненных работ</h1>
        <p style={{ margin: '0 0 18px', color: '#687568', fontSize: 14 }}>Сервис «Мастерская» · Акт № 1042 · 17.11.2026</p>
        <hr style={{ border: 0, borderTop: '1px solid #dbe1d4', margin: '0 0 18px' }} />
        <FactList rows={[
          ['Клиент', 'Аптека «Здоровье»'],
          ['Адрес', 'Москва, ул. Пятницкая, 18'],
          ['Мастер', 'Игорь Белов'],
          ['Дата', '17.11.2026'],
          ['Фактическое время', '38 мин'],
          ['Сумма', '4 200 ₽'],
        ]} />
        <Section title="Работы">
          <Money name="Замена ламп витрины" amount="2 800 ₽" />
          <Money name="Выезд мастера" amount="1 000 ₽" />
        </Section>
        <Section title="Материалы">
          <Money name="Лампа LED 10 Вт, 6 шт." amount="400 ₽" />
        </Section>
        <Section title="Чек-лист">
          {['Отключить группу', 'Снять рассеиватель', 'Заменить лампы', 'Проверить автомат'].map(item => (
            <p key={item} style={{ margin: '0 0 6px', fontSize: 14 }}>✓ {item}</p>
          ))}
        </Section>
        <Section title="Что сделано">
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>Заменили 6 ламп витрины, проверили автомат. Клиент принял работу.</p>
        </Section>
        {!refused ? (
          <Section title="Фото">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/template-media/dispatch/act-photo.jpg" alt="Фото с выезда" width={96} height={96} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8 }} />
          </Section>
        ) : null}
        <section data-act-acceptance style={{ marginTop: 22 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700 }}>Приёмка работ</h2>
          <hr style={{ border: 0, borderTop: '1px solid #dbe1d4', margin: '0 0 12px' }} />
          <FactList rows={refused ? [
            ['Работу принял', 'Иванова Мария Петровна, администратор'],
            ['Статус', 'Отказ от подписи зафиксирован 17.11.2026 в 14:32'],
            ['Причина', 'Уполномоченный сотрудник уже ушёл, подписать некому.'],
            ['Исполнитель', 'Игорь Белов'],
          ] : [
            ['Работу принял', 'Иванова Мария Петровна, администратор'],
            ['Дата подписи', '17.11.2026 в 14:32'],
            ['Замечания', 'Претензий нет'],
            ['Исполнитель', 'Игорь Белов'],
          ]} />
          <div style={{ height: 12 }} />
          <p style={{ margin: '0 0 18px', fontSize: 14 }}>Исполнитель ________________ / Игорь Белов</p>
          <p style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>Заказчик</span>
            {!refused ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/template-media/dispatch/act-signature.png" alt="Подпись клиента" width={140} height={40} style={{ display: 'block', width: 140, height: 40, objectFit: 'contain', background: '#fff', borderBottom: '1px solid #253c2d' }} />
            ) : <span>________________</span>}
            <span>/ Иванова Мария Петровна</span>
          </p>
        </section>
      </article>
    </main>
  )
}

function FactList({ rows }: { rows: [string, string][] }) {
  return (
    <dl style={{ display: 'grid', gap: 10, margin: '0 0 8px', fontSize: 15 }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'grid', gridTemplateColumns: '160px minmax(0, 1fr)', gap: 12 }}>
          <dt style={{ margin: 0, ...muted }}>{label}</dt>
          <dd style={{ margin: 0 }}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 22 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700 }}>{title}</h2>
      <hr style={{ border: 0, borderTop: '1px solid #dbe1d4', margin: '0 0 12px' }} />
      {children}
    </section>
  )
}

function Money({ name, amount }: { name: string; amount: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 6, fontSize: 14 }}>
      <span>{name}</span>
      <span style={{ whiteSpace: 'nowrap' }}>{amount}</span>
    </div>
  )
}
