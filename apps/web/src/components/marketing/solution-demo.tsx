import { MotionStory } from './motion-lab/motion-lab'
import { CoverArt, type CoverKind } from './cover-art'
import { ProductGlyph } from './product-glyph'
import {
  ScreenCard,
  ScreenForm,
  ScreenFrame,
  ScreenList,
  ScreenTable,
} from './screens'

/**
 * Что видно на экране — для каждого решения своё.
 *
 * Раньше здесь у всех стоял один и тот же список строчек с числами, и шесть
 * страниц выглядели одинаково, хотя рассказывают про разную работу. Теперь
 * каждое решение показывает свои экраны: у портала — кабинет клиента,
 * у производства — форма выпуска с расчётом, у склада — остатки.
 *
 * Данные взяты из строк-примеров соответствующих шаблонов, поэтому после
 * установки человек увидит ровно это.
 */
/**
 * Решения, у которых есть свой показ.
 *
 * Список нужен проверке: страница решения без экрана снова становится
 * страницей текста, а заметить это на глаз можно только открыв все шесть.
 */
export const DEMO_SLUGS = [
  'client-portal',
  'order-management',
  'production',
  'employee-app',
  'warehouse',
  'catalog',
] as const

export function SolutionDemo({ slug }: { slug: string }) {
  if (slug === 'client-portal') {
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        <ScreenFrame title="Что видно без входа" note="Витрина: только те колонки, которые вы отметили публичными.">
          <ScreenList
            title="Услуги и цены"
            right="4"
            rows={[
              { title: 'Монтаж сплит-системы', subtitle: 'в течение 3 дней', meta: '9 500 ₽' },
              { title: 'Годовое обслуживание', subtitle: 'по графику', meta: '12 000 ₽' },
              { title: 'Работа мастера, час', subtitle: 'по записи', meta: '2 200 ₽' },
              { title: 'Доставка по городу', subtitle: 'день в день', meta: '900 ₽' },
            ]}
          />
        </ScreenFrame>

        <ScreenFrame title="Кабинет клиента" note="После входа по коду: только заказы его организации.">
          <ScreenCard
            title="Заказ 1042"
            fields={[
              { label: 'Статус', value: 'В работе', strong: true },
              { label: 'Выезд', value: '26 сентября' },
              { label: 'Мастер', value: 'Сергей' },
              { label: 'Сумма', value: '18 500 ₽', strong: true },
              { label: 'Оплата', value: 'Счёт оплачен' },
              { label: 'Документы', value: 'Акт, фото с объекта' },
            ]}
          />
        </ScreenFrame>
      </div>
    )
  }

  if (slug === 'order-management') {
    return (
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">Доска диспетчера</p>
          <MotionStory variantId="workflow" />
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">Колонки — из колонки статуса. Перетащили карточку — статус изменился.</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <ScreenFrame title="Телефон мастера" note="Его заявки и больше ничего — правило «видит только свои».">
            <ScreenList
              title="Мои выезды"
              right="2"
              rows={[
                { title: 'Заявка 1042', subtitle: 'ООО «Вектор» · 26 сентября', status: { label: 'В работе', tone: 'amber' } },
                { title: 'Заявка 1048', subtitle: 'ИП Соколов · 29 сентября', status: { label: 'Новая' } },
              ]}
            />
          </ScreenFrame>

          <ScreenFrame title="Отметка о работе" note="Форма на три поля вместо таблицы на одиннадцать колонок.">
            <ScreenForm
              title="Заявка 1042"
              fields={[
                { label: 'Статус', value: 'Готово', kind: 'select' },
                { label: 'Что сделано', value: 'Заменили фильтр, дозаправка' },
                { label: 'Фото с объекта', value: '1 файл' },
              ]}
              submit="Сохранить"
            />
          </ScreenFrame>
        </div>
      </div>
    )
  }

  if (slug === 'production') {
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        <ScreenFrame
          title="Ввод выпуска"
          note="Расход считается до сохранения — теми же нормами, по которым потом спишется."
        >
          <ScreenForm
            title="Новый выпуск"
            fields={[
              { label: 'Продукт', value: 'Пивной пакет 1 л', kind: 'select' },
              { label: 'Произведено', value: '20 000', kind: 'number' },
              { label: 'Брак', value: '320', kind: 'number' },
              { label: 'Смена', value: 'Дневная', kind: 'select' },
            ]}
            hint={
              <>
                <p className="font-medium text-ink">Спишется при сохранении</p>
                <ul className="mt-1.5 space-y-1 text-ink-soft">
                  <li className="flex justify-between gap-3">
                    <span>Пластик</span>
                    <span className="tabular-nums">240 кг из 1 538</span>
                  </li>
                  <li className="flex justify-between gap-3">
                    <span>Коробки</span>
                    <span className="tabular-nums">200 шт. из 4 615</span>
                  </li>
                  <li className="flex justify-between gap-3">
                    <span>Клей</span>
                    <span className="tabular-nums">6 кг из 88,45</span>
                  </li>
                </ul>
              </>
            }
            submit="Сохранить выпуск"
          />
        </ScreenFrame>

        <div className="space-y-5">
          <ScreenFrame device="desktop" title="Журнал склада" note="Движения появляются вместе с выпуском, одной операцией.">
            <ScreenTable
              caption="Движение материалов"
              columns={['Движение', 'Дата', 'Тип', 'Количество']}
              rows={[
                ['Пластик', '29.09.2026', 'Производство', '−240'],
                ['Коробки', '29.09.2026', 'Производство', '−200'],
                ['Пластик', '26.09.2026', 'Приход', '+500'],
              ]}
            />
          </ScreenFrame>

          <ScreenFrame device="desktop" title="Сводка директора" note="Три числа и список материалов ниже минимума.">
            <div className="grid grid-cols-3 gap-px bg-sand-200">
              {[
                { label: 'Произведено сегодня', value: '20 000' },
                { label: 'Брак', value: '320' },
                { label: 'Ниже нормы', value: '2' },
              ].map((metric) => (
                <div key={metric.label} className="bg-white px-3 py-4 text-center">
                  <p className="font-display text-xl font-extrabold tabular-nums">{metric.value}</p>
                  <p className="mt-1 text-[11px] leading-tight text-ink-muted">{metric.label}</p>
                </div>
              ))}
            </div>
            <ScreenList
              title="Пора закупать"
              rows={[
                { title: 'Клей', subtitle: 'кг', meta: '88,45' },
                { title: 'Краситель', subtitle: 'кг', meta: '46,15' },
              ]}
            />
          </ScreenFrame>
        </div>
      </div>
    )
  }

  if (slug === 'employee-app') {
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        <ScreenFrame title="Что видит сотрудник" note="Свои записи. Чужие не приходят в браузер.">
          <ScreenList
            title="Мои задачи"
            right="3"
            rows={[
              { title: 'Заявка 1042', subtitle: 'ООО «Вектор» · сегодня', status: { label: 'В работе', tone: 'amber' } },
              { title: 'Заявка 1048', subtitle: 'ИП Соколов · завтра', status: { label: 'Новая' } },
              { title: 'Заявка 1039', subtitle: 'Кафе «Пион» · вчера', status: { label: 'Готово', tone: 'sage' } },
            ]}
          />
        </ScreenFrame>

        <ScreenFrame title="Карточка и действия" note="Кнопки — это то, что роли разрешено менять.">
          <ScreenCard
            title="Заявка 1042"
            fields={[
              { label: 'Клиент', value: 'ООО «Вектор»' },
              { label: 'Адрес', value: 'Ленина, 14, офис 3' },
              { label: 'Что сделать', value: 'Плановое обслуживание' },
              { label: 'Статус', value: 'В работе', strong: true },
            ]}
            actions={['Отметить «Готово»', 'Приложить фото']}
          />
        </ScreenFrame>
      </div>
    )
  }

  if (slug === 'warehouse') {
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        <ScreenFrame title="Остатки на телефоне" note="Нашли позицию, поменяли число — всё, что нужно у стеллажа.">
          <ScreenList
            title="Позиции"
            right="8"
            rows={[
              { title: 'Фильтр воздушный FA-120', subtitle: 'Стеллаж А, полка 2', meta: '4 шт.', status: { label: 'Заканчивается', tone: 'amber' } },
              { title: 'Термостат KTS-011', subtitle: 'Стеллаж Б, ящик 1', meta: '12 шт.' },
              { title: 'Хладагент R-410A', subtitle: 'Склад ГСМ', meta: '2 шт.', status: { label: 'Заканчивается', tone: 'amber' } },
              { title: 'Гофра алюминиевая 125 мм', subtitle: 'Стеллаж В', meta: '18 шт.' },
            ]}
          />
        </ScreenFrame>

        <ScreenFrame
          device="desktop"
          title="Представление «Заканчивается»"
          note="Отбор по колонке «Пора докупать»: она считается сама из остатка и минимума."
        >
          <ScreenTable
            caption="Позиции ниже минимума"
            columns={['Наименование', 'Остаток', 'Минимум', 'Стоимость остатка']}
            rows={[
              ['Фильтр воздушный FA-120', '4', '6', '3 560 ₽'],
              ['Хладагент R-410A', '2', '3', '28 400 ₽'],
              ['Перчатки рабочие', '25', '30', '2 375 ₽'],
            ]}
          />
        </ScreenFrame>
      </div>
    )
  }

  if (slug === 'catalog') {
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        <ScreenFrame title="Витрина у менеджера" note="Плитки с фотографиями: клиент смотрит вместе с ним.">
          <div className="grid grid-cols-2 gap-3 p-3">
            {[
              { cover: 'cooling' as const, name: 'Кондиционер настенный, 09', price: '38 900 ₽', tag: 'со склада' },
              { cover: 'tool' as const, name: 'Монтаж сплит-системы', price: '9 500 ₽', tag: '3 дня' },
              { cover: 'tool' as const, name: 'Годовое обслуживание', price: '12 000 ₽', tag: 'по графику' },
              { cover: 'parcel' as const, name: 'Увлажнитель промышленный', price: '74 500 ₽', tag: 'под заказ' },
            ].map((item) => (
              <div key={item.name} className="overflow-hidden rounded-xl border border-sand-200">
                {/*
                  Обложка нарисована нами: своя графика, чужих прав нет.
                  Фотографий товара у нас и быть не может — чужой снимок обещал
                  бы чужой товар. Свои снимки владельца встанут на это же место.
                */}
                <div className="bg-sand-100">
                  <CoverArt kind={item.cover} className="h-16 w-full" />
                </div>
                <div className="p-2.5">
                  <p className="line-clamp-2 text-[11px] font-medium leading-tight text-ink">{item.name}</p>
                  <p className="mt-1 text-xs font-semibold tabular-nums">{item.price}</p>
                  <p className="text-[10px] text-ink-muted">{item.tag}</p>
                </div>
              </div>
            ))}
          </div>
        </ScreenFrame>

        <ScreenFrame title="Карточка позиции" note="То, что клиент спрашивает на встрече: цена, наличие, срок.">
          <ScreenCard
            title="Кондиционер настенный, 09"
            fields={[
              { label: 'Цена', value: '38 900 ₽', strong: true },
              { label: 'Единица', value: 'шт.' },
              { label: 'Категория', value: 'Оборудование' },
              { label: 'Есть в наличии', value: 'Да' },
              { label: 'Срок поставки', value: 'со склада' },
              { label: 'Описание', value: 'До 25 м², гарантия 3 года' },
            ]}
          />
        </ScreenFrame>
      </div>
    )
  }

  return null
}
