import { CoverArt, type CoverKind } from './cover-art'
import { ProductGlyph, type GlyphKind } from './product-glyph'
import {
  ScreenBoard,
  ScreenCard,
  ScreenFrame,
  ScreenList,
  ScreenTable,
} from './screens'
import { SolutionDemo } from './solution-demo'

/**
 * Главная операция шаблона, показанная экраном.
 *
 * У каждого шаблона своя: у заказов — состав и итог, у салона — расписание дня,
 * у сервиса — этап ремонта и остаток к доплате. Один и тот же список из четырёх
 * строк не объяснял разницы между делами и не помогал выбрать.
 *
 * Значения взяты из строк-примеров самого шаблона: после установки человек
 * увидит их же. Считаемые числа (итог заказа, остаток к доплате) посчитаны
 * теми же формулами, что записаны в шаблоне.
 */

/** Шаблоны, чью главную операцию уже показывает страница решения. */
const BY_SOLUTION: Record<string, string> = {
  zayavki: 'order-management',
  portal: 'client-portal',
  proizvodstvo: 'production',
  sklad: 'warehouse',
  katalog: 'catalog',
}

/** Витрина объектов: обложка, цена и короткая подпись — как в приложении. */
function Showcase({
  items,
}: {
  items: { cover: CoverKind; name: string; price: string; note: string }[]
}) {
  return (
    <div className="grid grid-cols-2 gap-3 p-3">
      {items.map((item) => (
        <div key={item.name} className="overflow-hidden rounded-xl border border-sand-200">
          {/*
            Обложка нарисована нами: своя графика, чужих прав нет. Фотографий
            товара у нас и быть не может — чужой снимок обещал бы чужой товар.
            Когда у владельца появятся свои снимки, они встанут на это же
            место: колонка с изображением в шаблоне уже есть.
          */}
          <div className="bg-sand-100">
            <CoverArt kind={item.cover} className="h-20 w-full" />
          </div>
          <div className="p-2.5">
            <p className="line-clamp-2 text-[11px] font-medium leading-tight text-ink">{item.name}</p>
            <p className="mt-1 text-xs font-semibold tabular-nums">{item.price}</p>
            <p className="text-[10px] text-ink-muted">{item.note}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Шаблоны, у которых показ есть.
 *
 * Список для проверки: шаблон без своего экрана снова превращается в страницу
 * текста, а заметить это можно, только открыв все одиннадцать.
 */
export const TEMPLATE_DEMO_IDS = [
  ...Object.keys(BY_SOLUTION),
  'zakazy',
  'crm',
  'service',
  'salon',
  'nedvizhimost',
  'dostavka',
] as const

export function TemplateDemo({ id }: { id: string }) {
  const solution = BY_SOLUTION[id]
  if (solution) return <SolutionDemo slug={solution} />

  if (id === 'zakazy') {
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        <ScreenFrame
          device="desktop"
          title="Заказ и его позиции"
          note="Стоимость строки — количество на цену, итог заказа — сумма строк. Оба числа считаются сами."
        >
          <ScreenTable
            caption="Позиции заказа №118"
            columns={['Что', 'Кол-во', 'Цена', 'Стоимость']}
            rows={[
              ['Кондиционер настенный, 09', '2 шт.', '38 900 ₽', '77 800 ₽'],
              ['Монтаж сплит-системы', '2 шт.', '9 500 ₽', '19 000 ₽'],
              ['Кронштейн усиленный', '2 шт.', '1 800 ₽', '3 600 ₽'],
            ]}
          />
          <div className="flex items-baseline justify-between border-t border-sand-200 bg-sand-50 px-4 py-3">
            <span className="text-sm font-medium text-ink">
              Итого по заказу
              <span className="ml-1.5 rounded bg-sage-100 px-1.5 py-0.5 text-[10px] font-medium text-sage-700">
                считается само
              </span>
            </span>
            <span className="font-display text-base font-bold tabular-nums">100 400 ₽</span>
          </div>
        </ScreenFrame>

        <ScreenFrame title="Карточка заказа у сборщика" note="Три позиции, адрес и отметка об оплате.">
          <ScreenCard
            title="№118, ООО «Вектор»"
            fields={[
              { label: 'Статус', value: 'Собирается', strong: true },
              { label: 'Позиций', value: '3' },
              { label: 'Итого', value: '100 400 ₽', strong: true },
              { label: 'Оплачен', value: 'Нет' },
              { label: 'Отгрузка', value: 'через 2 дня' },
              { label: 'Адрес', value: 'Москва, Профсоюзная 56' },
            ]}
            actions={['Отгружен']}
          />
        </ScreenFrame>
      </div>
    )
  }

  if (id === 'crm') {
    return (
      <div className="space-y-5">
        <ScreenFrame
          device="desktop"
          title="Воронка сделок"
          note="Колонки — этапы сделки. Под каждой видно, сколько денег на этом этапе."
        >
          <ScreenBoard
            columns={[
              {
                title: 'Новая · 416 000 ₽',
                count: 2,
                cards: [
                  { title: 'Монтаж вентиляции на складе', meta: 'ООО «Северный ветер» · 320 000 ₽' },
                  { title: 'Обслуживание на второй точке', meta: 'ООО «Вектор» · 96 000 ₽' },
                ],
              },
              {
                title: 'Переговоры · 144 000 ₽',
                count: 1,
                cards: [{ title: 'Годовое обслуживание', meta: 'Кафе «Огонёк» · 144 000 ₽' }],
              },
              {
                title: 'Счёт выставлен · 778 000 ₽',
                count: 1,
                cards: [{ title: 'Поставка 20 кондиционеров', meta: 'ООО «Вектор» · 778 000 ₽' }],
              },
            ]}
          />
        </ScreenFrame>

        <div className="grid gap-5 sm:grid-cols-2">
          <ScreenFrame title="Карточка сделки" note="Телефон подставлен из карточки клиента.">
            <ScreenCard
              title="Поставка 20 кондиционеров"
              fields={[
                { label: 'Клиент', value: 'ООО «Вектор»' },
                { label: 'Телефон', value: '+7 495 120-44-00' },
                { label: 'Этап', value: 'Счёт выставлен', strong: true },
                { label: 'Сумма', value: '778 000 ₽', strong: true },
                { label: 'Вернуться', value: 'через 3 дня' },
                { label: 'Ответственный', value: 'Сергей' },
              ]}
              actions={['Оплачено', 'Записать разговор']}
            />
          </ScreenFrame>

          <ScreenFrame title="Когда вернуться" note="Календарь по колонке «Вернуться к разговору».">
            <ScreenList
              title="Ближайшие"
              right="3"
              rows={[
                { title: 'Годовое обслуживание', subtitle: 'Кафе «Огонёк» · завтра', meta: '144 000 ₽' },
                { title: 'Поставка 20 кондиционеров', subtitle: 'ООО «Вектор» · через 3 дня', meta: '778 000 ₽' },
                { title: 'Монтаж вентиляции', subtitle: 'Северный ветер · через 5 дней', meta: '320 000 ₽' },
              ]}
            />
          </ScreenFrame>
        </div>
      </div>
    )
  }

  if (id === 'service') {
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        <ScreenFrame title="Приёмка техники" note="Квитанцию с номером клиент получает на руки.">
          <ScreenCard
            title="Холодильник Atlant ХМ-4021"
            fields={[
              { label: 'Квитанция', value: 'К-1041' },
              { label: 'Клиент', value: 'Петров А.' },
              { label: 'Неисправность', value: 'Гудит и не морозит' },
              { label: 'Этап', value: 'Ждём запчасть', strong: true },
              { label: 'Обещали к', value: 'через 2 дня' },
              { label: 'Стоимость', value: '8 400 ₽' },
              { label: 'Предоплата', value: '2 000 ₽' },
              { label: 'Осталось доплатить', value: '6 400 ₽', strong: true },
            ]}
            actions={['В ремонте', 'Позвонить клиенту']}
          />
        </ScreenFrame>

        <ScreenFrame
          device="desktop"
          title="Доска ремонтов"
          note="Этапы — колонки. Видно, что лежит дольше всех и что обещано на этой неделе."
        >
          <ScreenBoard
            columns={[
              {
                title: 'Диагностика',
                count: 1,
                cards: [{ title: 'Ноутбук Lenovo IdeaPad', meta: 'К-1043 · обещали через 3 дня' }],
              },
              {
                title: 'Ждём запчасть',
                count: 1,
                cards: [{ title: 'Холодильник Atlant', meta: 'К-1041 · термостат заказан' }],
              },
              {
                title: 'Готово',
                count: 1,
                cards: [{ title: 'Кофемашина Delonghi', meta: 'К-1039 · доплата 6 500 ₽' }],
              },
            ]}
          />
        </ScreenFrame>
      </div>
    )
  }

  if (id === 'salon') {
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        <ScreenFrame title="Расписание на сегодня" note="Записи по времени: услуга, мастер и состояние.">
          <ScreenList
            title="Сегодня"
            right="3 записи"
            rows={[
              {
                title: '14:00 · Женская стрижка',
                subtitle: 'Мария К. · мастер Оля · 60 мин',
                meta: '2 500 ₽',
                status: { label: 'Пришёл', tone: 'sage' },
              },
              {
                title: '16:30 · Мужская стрижка',
                subtitle: 'Алексей Г. · мастер Женя · 40 мин',
                meta: '1 500 ₽',
                status: { label: 'Записан' },
              },
              {
                title: '18:00 · Окрашивание',
                subtitle: 'Ольга Д. · мастер Наташа · 120 мин',
                meta: '5 500 ₽',
                status: { label: 'Записан' },
              },
            ]}
          />
        </ScreenFrame>

        <ScreenFrame title="Запись клиента" note="Цена и длительность подставляются из услуги.">
          <ScreenCard
            title="Маникюр с покрытием"
            fields={[
              { label: 'Клиент', value: 'Светлана М.' },
              { label: 'Телефон', value: '+7 921 444-66-77' },
              { label: 'Когда', value: 'завтра, 10:00', strong: true },
              { label: 'Мастер', value: 'Наташа' },
              { label: 'Длительность', value: '90 мин' },
              { label: 'Цена', value: '2 800 ₽', strong: true },
              { label: 'Заметка', value: 'Аллергия на базу' },
            ]}
            actions={['Пришёл', 'Перенести']}
          />
        </ScreenFrame>
      </div>
    )
  }

  if (id === 'nedvizhimost') {
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        <ScreenFrame title="Витрина объектов" note="Обложка берётся из колонки с фотографиями объекта.">
          <Showcase
            items={[
              { cover: 'apartment', name: 'Профсоюзная 56, кв. 41', price: '14 900 000 ₽', note: '2 комнаты · 54,3 м²' },
              { cover: 'office', name: 'Химки, Ленинский 12, офис 3', price: '9 400 000 ₽', note: 'офис · 86 м²' },
              { cover: 'apartment', name: 'Тула, Ленина 5, кв. 12', price: '4 300 000 ₽', note: '1 комната · 33,8 м²' },
              { cover: 'plot', name: 'д. Ново, участок 14', price: '3 100 000 ₽', note: 'участок · 12 соток' },
            ]}
          />
        </ScreenFrame>

        <ScreenFrame title="Карточка объекта" note="Состояние объекта — колонка выбора: свободен, бронь, показы.">
          <ScreenCard
            title="Москва, Профсоюзная 56, кв. 41"
            fields={[
              { label: 'Тип', value: 'Квартира' },
              { label: 'Комнат', value: '2' },
              { label: 'Площадь', value: '54,3 м²' },
              { label: 'Цена', value: '14 900 000 ₽', strong: true },
              { label: 'Состояние', value: 'Показы', strong: true },
              { label: 'Собственник', value: 'Петрова И.' },
              { label: 'Агент', value: 'Сергей' },
            ]}
            actions={['Записать показ']}
          />
        </ScreenFrame>
      </div>
    )
  }

  if (id === 'dostavka') {
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        <ScreenFrame title="Доставки на сегодня" note="Курьер видит адрес, окно и что везти.">
          <ScreenList
            title="Сегодня"
            right="2"
            rows={[
              {
                title: 'Профсоюзная 56, офис 401',
                subtitle: 'Документы и счёт · Пётр · с 10 до 14',
                meta: '400 ₽',
                status: { label: 'В пути', tone: 'amber' },
              },
              {
                title: 'Химки, Ленинский 12',
                subtitle: '2 кондиционера · Пётр · после 18',
                meta: '1 200 ₽',
                status: { label: 'Принята' },
              },
            ]}
          />
        </ScreenFrame>

        <ScreenFrame title="Карточка доставки" note="Оплата — колонка выбора: заранее, наличными, картой курьеру.">
          <ScreenCard
            title="Тула, Ленина 5, кв. 12"
            fields={[
              { label: 'Получатель', value: 'Алексей Гусев' },
              { label: 'Телефон', value: '+7 903 555-00-11' },
              { label: 'Что везём', value: 'Увлажнитель' },
              { label: 'Окно', value: 'с 14 до 18' },
              { label: 'Курьер', value: 'Иван' },
              { label: 'Стоимость', value: '1 800 ₽' },
              { label: 'Статус', value: 'Не застали', strong: true },
            ]}
            actions={['Перенести на завтра']}
          />
        </ScreenFrame>
      </div>
    )
  }

  return null
}
