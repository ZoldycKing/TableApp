import Link from 'next/link'
import { PLAN_ORDER, PLANS, type Plan } from '@tableapp/schema'

/**
 * Тарифы на сайте.
 *
 * Считаются из той же конфигурации, по которой работают ограничения
 * в продукте: [plans.ts](packages/schema/src/plans.ts). Второй список
 * с ценами здесь был, и он разошёлся с правдой — сайт обещал тысячу строк
 * на пробу, а продукт давал две тысячи и называл тариф иначе. Человек
 * замечает это на странице расхода, и это худшее место для такой встречи.
 */

const money = new Intl.NumberFormat('ru-RU')

function priceOf(plan: Plan): string {
  return plan.monthlyPrice === 0 ? 'бесплатно' : `${money.format(plan.monthlyPrice)} ₽`
}

/** Мегабайты и гигабайты словами: «262 144 000 байт» не значит ничего. */
export function filesOf(bytes: number): string {
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${money.format(Math.round(gb))} ГБ файлов` : `${Math.round(bytes / 1024 ** 2)} МБ файлов`
}

/**
 * Склонение по числу: «1 приложение», «2 приложения», «5 приложений».
 *
 * Без него в карточке тарифа стояло «5 опубликованных приложения» —
 * мелочь, которую замечают все и которая сразу говорит, как сделано остальное.
 */
function plural(count: number, forms: [string, string, string]): string {
  const tens = count % 100
  const ones = count % 10
  if (tens >= 11 && tens <= 14) return forms[2]
  if (ones === 1) return forms[0]
  if (ones >= 2 && ones <= 4) return forms[1]
  return forms[2]
}

/** Что входит в тариф — четырьмя строками, в том же порядке, что и учёт. */
export function limitsOf(plan: Plan): string[] {
  const apps = plan.limits.publishedApps
  const tables = plan.limits.tables
  return [
    `${money.format(plan.limits.rows)} ${plural(plan.limits.rows, ['строка', 'строки', 'строк'])}`,
    `${apps} ${plural(apps, ['опубликованное приложение', 'опубликованных приложения', 'опубликованных приложений'])}`,
    `${tables} ${plural(tables, ['таблица', 'таблицы', 'таблиц'])}`,
    filesOf(plan.limits.fileBytes),
  ]
}

/*
 * Сетка карточек.
 *
 * Четыре колонки включаются только там, где карточке остаётся не меньше
 * 260 px: при контейнере 1200 px и промежутке 24 px это 267 px. Раньше
 * порогом был `lg` (1024 px) — карточка выходила 240 px, и слово «бесплатно»
 * упиралось во внутренние отступы, а лимиты ломались на четыре строки.
 * Ниже порога — две колонки, на телефоне одна.
 *
 * Внутри карточки — `subgrid`: пять строк карточки берутся из строк общей
 * сетки, поэтому название, цена, описание, начало списка лимитов и кнопка
 * стоят на одной линии во всех карточках, а не «примерно на одной», как
 * получается при подгонке отступами. Из-за этого вертикальный промежуток
 * сетки становится и внутренним ритмом карточки — он же задаёт расстояние
 * между её строками, поэтому по вертикали он один (20 px), а по горизонтали
 * на широком экране шире.
 */
const GRID =
  'grid gap-x-5 gap-y-5 sm:grid-cols-2 sm:grid-rows-[repeat(10,auto)] plans:grid-cols-4 plans:grid-rows-[repeat(5,auto)] plans:gap-x-6'

const CARD =
  'flex min-w-0 flex-col gap-5 rounded-2xl border p-6 transition-all duration-300 sm:row-span-5 sm:grid sm:grid-rows-subgrid sm:p-7'

export function Pricing({ signedIn = false }: { signedIn?: boolean }) {
  const entry = signedIn ? '/app' : '/login'

  return (
    <div>
      {/*
        Условия — до цен, а не после. Человек должен понимать, за что смотрит
        на таблицу: что доступно сейчас, что пока нельзя оплатить и что такое
        пространство, к которому всё привязано.
      */}
      <div className="mb-8 grid gap-4 rounded-2xl border border-sand-200 bg-white/70 p-6 sm:grid-cols-3">
        <p className="text-sm leading-relaxed text-ink-soft">
          <span className="font-medium text-ink">Сейчас доступен бесплатный тариф.</span> Он
          не ограничен по времени и не требует карты.
        </p>
        <p className="text-sm leading-relaxed text-ink-soft">
          <span className="font-medium text-ink">Платные тарифы пока нельзя оплатить:</span>{' '}
          приём оплаты не подключён. Цены ниже ориентировочные.
        </p>
        <p className="text-sm leading-relaxed text-ink-soft">
          <span className="font-medium text-ink">Пространство</span> — это ваши таблицы
          и приложения вместе с людьми, которым вы дали доступ. Лимиты считаются на него целиком.
        </p>
      </div>

      <div className={GRID}>
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id]
          // Выделен «Старт»: он подходит одной команде с парой рабочих
          // процессов. Это подсказка по размеру, а не заявление о популярности:
          // данных о том, что выбирают чаще, у нас пока нет.
          const highlight = plan.id === 'start'
          const free = plan.monthlyPrice === 0

          return (
            <div
              key={plan.id}
              className={`${CARD} ${
                highlight
                  ? 'border-sage-300 bg-white shadow-lift'
                  : 'border-sand-200 bg-white/70 shadow-soft hover:-translate-y-1 hover:shadow-lift'
              }`}
            >
              {/* Строка 1: бейдж и название. */}
              <div className="min-w-0">
                {/*
                  Место под бейдж есть в каждой карточке, иначе «Старт»
                  сдвигал бы свою цену вниз относительно соседей. На телефоне
                  карточки идут друг под другом, сравнивать построчно нечего —
                  пустую строку там не рисуем.
                */}
                <div
                  className={`mb-2 h-6 items-center ${highlight ? 'flex' : 'hidden sm:flex'}`}
                  aria-hidden={highlight ? undefined : true}
                >
                  {highlight ? (
                    <span className="rounded-full bg-sage-100 px-2.5 py-1 text-[11px] font-medium text-sage-700">
                      для одной команды
                    </span>
                  ) : null}
                </div>
                <h3 className="font-display text-lg font-bold">{plan.name}</h3>
              </div>

              {/* Строка 2: цена и период. */}
              <div className="min-w-0">
                {/*
                  28 px вместо 30: «11 990 ₽» в Unbounded шире, чем кажется,
                  и при четырёх карточках в ряд не помещалось в отступы —
                  ровно то, что было видно на «бесплатно» в прежней вёрстке.
                */}
                <p className="font-display text-[1.75rem] font-extrabold tracking-tight">
                  {priceOf(plan)}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {free ? 'навсегда' : 'в месяц за пространство'}
                </p>
              </div>

              {/* Строка 3: кому подходит. Тексты разной длины, строка общая. */}
              <p className="text-sm leading-relaxed text-ink-soft">{plan.fit}</p>

              {/* Строка 4: лимиты. */}
              <ul className="space-y-2">
                {limitsOf(plan).map((line) => (
                  <li key={line} className="flex gap-2.5 text-sm text-ink-soft">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-sage-400" />
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
                <li className="flex gap-2.5 text-sm text-ink-soft">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-sage-400" />
                  <span className="min-w-0">сколько угодно людей</span>
                </li>
              </ul>

              {/*
                Строка 5: действие. Кнопка идёт первой в строке, поэтому во всех
                карточках она на одной высоте, а пояснение под ней — только там,
                где оно есть. На платных тарифах кнопки «Попробовать» быть
                не может: оплата не подключена, и нажатие привело бы
                на бесплатный тариф. Честное следующее действие — запросить
                счёт письмом, как и написано в оферте.
              */}
              <div className="flex flex-col">
                {free ? (
                  <Link
                    href={entry}
                    className="w-full rounded-xl bg-ink px-5 py-3 text-center text-sm font-medium text-sand-50 transition-all hover:-translate-y-0.5 hover:bg-ink/90"
                  >
                    Начать бесплатно
                  </Link>
                ) : (
                  <>
                    <a
                      href={`mailto:hello@tableapp.ru?subject=${encodeURIComponent(`Тариф «${plan.name}»`)}`}
                      className="w-full rounded-xl border border-sand-300 px-5 py-3 text-center text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-ink/25 hover:bg-white"
                    >
                      Запросить счёт
                    </a>
                    <p className="mt-2 text-center text-[11px] leading-snug text-ink-muted">
                      Пока подключаем вручную: пришлём счёт и документы
                    </p>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/*
        Два предложения, без которых таблица врёт. Первое — про людей: это
        главное отличие от зарубежных сервисов, и оно должно стоять рядом
        с ценой. Второе — про то, что оплаты пока нет: обещать кнопку,
        которой не существует, нельзя.
      */}
      <p className="mt-8 max-w-3xl text-sm leading-relaxed text-ink-muted">
        <span className="font-medium text-ink">Пользователи не тарифицируются.</span> Сколько
        сотрудников и клиентов открывают приложение — на цену не влияет: считается объём данных,
        а не количество людей. Цены ориентировочные и до первых платящих клиентов могут
        измениться. Приём оплаты пока не подключён: все пространства работают на бесплатном
        тарифе. Нужен счёт для организации — напишите на hello@tableapp.ru.
      </p>
    </div>
  )
}
