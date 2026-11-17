import { readFileSync } from 'node:fs'
import { notFound } from 'next/navigation'
import { buildWorkActPdf } from '@/lib/dispatch-act'

export const dynamic = 'force-dynamic'

/** First page of the Moscow demo act, for the screenshot. Not part of the published app. */
export async function GET() {
  if (process.env.NODE_ENV === 'production') notFound()
  const font = readFileSync(new URL('../../../../public/template-media/dispatch/NotoSans-Regular.ttf', import.meta.url))
  const photo = readFileSync(new URL('../../../../public/template-media/dispatch/act-photo.png', import.meta.url))
  const signature = readFileSync(new URL('../../../../public/template-media/dispatch/act-signature.png', import.meta.url))
  const pdf = await buildWorkActPdf({
    client: 'Аптека «Здоровье»',
    address: 'Москва, ул. Пятницкая, 18',
    technician: 'Игорь Белов',
    date: '17.11.2026',
    actualTime: '38 мин',
    checklist: [
      { label: 'Отключить группу', done: true },
      { label: 'Снять рассеиватель', done: true },
      { label: 'Заменить лампы', done: true },
      { label: 'Проверить автомат', done: true },
    ],
    notes: 'Заменили 6 ламп витрины, проверили автомат. Клиент принял работу.',
    works: [{ name: 'Замена ламп витрины', amount: 2800 }, { name: 'Выезд мастера', amount: 1000 }],
    materials: [{ name: 'Лампа LED 10 Вт, 6 шт.', amount: 400 }],
    total: '4 200 ₽',
    photos: [{ bytes: photo, mime: 'image/png' }],
    signature: { bytes: signature, mime: 'image/png' },
  }, font)
  return new Response(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' } })
}
