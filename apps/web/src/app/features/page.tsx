import Link from 'next/link'
import { FIELD_TYPES } from '@tableapp/schema'
import { FUNCTIONS } from '@tableapp/formula'
import {
  CtaSection,
  MarketingShell,
  PageHero,
  PrimaryLink,
  SecondaryLink,
  Section,
} from '@/components/marketing/blocks'
import { ComputedOrderDemo, RolesDemo, ViewsDemo } from '@/components/marketing/demos'
import { MotionStory } from '@/components/marketing/motion-lab/motion-lab'
import { ScreenCard, ScreenForm, ScreenFrame, ScreenList, ScreenTable } from '@/components/marketing/screens'
import { pageMetadata } from '@/lib/seo'
import { currentMember } from '@/lib/session'

export const dynamic = 'force-dynamic'

export const metadata = pageMetadata({
  path: '/features',
  title: 'Возможности — от таблицы до приложения с правами',
  description:
    'Как это работает: одни данные в четырёх представлениях, суммы считаются сами, экраны собираются по таблице, каждый видит только своё.',
})

/**
 * Возможности.
 *
 * Страница показывает, а не перечисляет. Пять одинаковых сеток карточек —
 * это пять раз одно и то же движение глазами, после которого человек помнит
 * оформление, а не продукт.
 *
 * Порядок отвечает порядку работы: данные → вычисления → приложение → права
 * → защита. Термины продукта (подстановка, свёртка, одноразовый пароль) живут
 * вторым уровнем, под «как это устроено»: основной текст читает человек,
 * который их не знает.
 */
export default async function FeaturesPage() {
  const member = await currentMember()

  return (
    <MarketingShell signedIn={Boolean(member)}>
      <PageHero
        trail={[{ href: '/', label: 'TableApp' }, { label: 'Возможности' }]}
        title="Что умеет TableApp"
        lead="Таблица остаётся таблицей — и становится приложением, у которого есть экраны, роли и права. Ниже примеры на данных, которые можно переключать и считать прямо здесь."
        actions={
          <>
            <PrimaryLink href={member ? '/import' : '/login?next=%2Fimport'}>
              {member ? 'Импортировать таблицу' : 'Загрузить свою таблицу'}
            </PrimaryLink>
            <SecondaryLink href="/demo">Открыть живое демо</SecondaryLink>
          </>
        }
      />

      {/* --- Данные ---------------------------------------------------- */}
      <Section
        id="dannye"
        title="Данные"
        lead="Одни и те же строки под разным углом. Переключите представление — меняется только взгляд, данные остаются одними."
      >
        <ViewsDemo />

        <div className="mt-8 grid gap-6 text-sm leading-relaxed text-ink-soft sm:grid-cols-2">
          <p>
            Таблица приезжает файлом из Excel или выгрузкой из 1С: кодировка, разделитель и типы
            колонок определяются сами, а перед загрузкой видно, что получится. В книге Excel
            можно выбрать несколько листов — каждый станет своей таблицей. Начать можно
            и с пустой таблицы, и с готового шаблона.
          </p>
          <p>
            Колонок {FIELD_TYPES.length} видов: числа с рублями и процентами, даты, списки выбора,
            файлы и фотографии, почта и телефон, связи с другими таблицами. Кто и когда изменил
            строку — видно в истории, выгрузить всё обратно можно в любой момент.
          </p>
        </div>
      </Section>

      {/* --- Вычисления ------------------------------------------------ */}
      <Section
        id="vychisleniya"
        title="Вычисления"
        lead="Считает продукт, а не человек в конце месяца. Заказ состоит из позиций, и его сумма — не колонка, которую кто-то заполняет руками."
        tone="white"
      >
        <ComputedOrderDemo />

        <div className="mt-8">
          <MotionStory variantId="sync" />
        </div>

        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-ink-soft">
          В формулах {Object.keys(FUNCTIONS).length} функций, имена колонок пишутся по-русски
          в фигурных скобках. Ошибка видна при вводе, а не после сохранения. Ничего не хранится
          дважды: поправили цену — пересчиталось везде, где она участвует.
        </p>
      </Section>

      {/* --- Приложение ------------------------------------------------ */}
      <Section
        id="prilozheniya"
        title="Приложение"
        lead="Из таблицы собираются экраны: список, карточка и форма. Сотруднику достаётся его часть работы, а не двадцать колонок."
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start">
          <ScreenFrame
            device="desktop"
            title="Было: таблица у вас"
            note="Те же строки, что и выше, — рабочая таблица со всеми колонками."
          >
            <ScreenTable
              caption="Заявки в таблице"
              columns={['Заявка', 'Клиент', 'Статус', 'Мастер', 'Сумма']}
              rows={[
                ['Заявка 1042', 'ООО «Вектор»', 'В работе', 'Сергей', '18 500 ₽'],
                ['Заявка 1043', 'Кафе «Пион»', 'Новая', '—', '9 500 ₽'],
              ]}
            />
          </ScreenFrame>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <ScreenFrame title="Стало: список у мастера">
              <ScreenList
                title="Мои выезды"
                right="2"
                rows={[
                  { title: 'Заявка 1042', subtitle: 'ООО «Вектор» · 26 сентября', status: { label: 'В работе', tone: 'amber' } },
                  { title: 'Заявка 1048', subtitle: 'ИП Соколов · 29 сентября', status: { label: 'Новая' } },
                ]}
              />
            </ScreenFrame>

            <ScreenFrame title="И форма вместо ячеек">
              <ScreenForm
                title="Отметить работу"
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

        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Экраны собираются по таблице сами, дальше правятся мышкой: что показать, что спросить,
          что скрыть. Справа в конструкторе — предпросмотр глазами выбранной роли, так что
          увидеть чужой экран можно до того, как его увидит сотрудник. Приложение открывается
          по ссылке в браузере и ставится на домашний экран телефона.
        </p>
      </Section>

      {/* --- Права ----------------------------------------------------- */}
      <Section
        id="dostup"
        title="Кто что видит"
        lead="Одна таблица, три человека — три разных экрана. Не оформление: закрытые строки не приходят в браузер."
        tone="white"
      >
        <RolesDemo />

        <details className="group mt-6 max-w-2xl">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-sm font-medium text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            Как это настраивается
            <span aria-hidden className="transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-ink-muted">
            <p>
              Роли вы называете сами: мастер, диспетчер, кладовщик, клиент. Для каждой решаете,
              какие экраны открыты и какие строки видны — все или только свои.
            </p>
            <p>
              «Только свои» — это правило сравнения: в строке есть колонка с почтой или
              организацией, и человек видит те строки, где стоит его. Отдельные колонки —
              себестоимость, внутренние заметки — можно оставить только своим людям.
            </p>
            <p>
              Проверка идёт на сервере при каждом запросе. Убрали человека из списка доступа —
              он теряет доступ на следующем же действии.
            </p>
          </div>
        </details>
      </Section>

      {/* --- Защита ---------------------------------------------------- */}
      <Section id="bezopasnost" title="Вход и защита" width="narrow">
        <div className="grid gap-6 sm:grid-cols-[19rem_minmax(0,1fr)] sm:items-start">
          <ScreenFrame title="Вход сотрудника" note="Пароля нет: приходит шестизначный код на почту.">
            <ScreenCard
              title="Вход в приложение"
              fields={[
                { label: 'Почта', value: 'master@vektor.ru' },
                { label: 'Код из письма', value: '· · · · · ·', strong: true },
                { label: 'Действует', value: `${LOGIN_CODE_TTL_MINUTES} минут` },
              ]}
              actions={['Войти']}
            />
          </ScreenFrame>

          <div className="space-y-3 text-sm leading-relaxed text-ink-soft">
            <p>
              Паролей в продукте нет ни у кого — ни у вас, ни у ваших сотрудников, ни у клиентов.
              Вместо пароля код из письма, привязанный к тому браузеру, где начали вход.
              Забывать, восстанавливать и хранить в блокноте нечего.
            </p>
            <p>
              Дополнительно можно включить одноразовые коды из приложения-аутентификатора.
              В настройках видно список устройств и журнал входов: откуда и когда заходили.
              Там же можно завершить сеанс на любом устройстве или сразу на всех.
            </p>
            <p>
              Файлы лежат в хранилище и выдаются по временной подписанной ссылке, а право
              на файл выводится из права на строку: нет доступа к строке — нет доступа
              к её вложениям. Данные хранятся в России.
            </p>
          </div>
        </div>
      </Section>

      {/* --- Границы --------------------------------------------------- */}
      <Section title="Чего пока нет" tone="sand" width="narrow">
        <ul className="max-w-2xl space-y-2.5 text-sm leading-relaxed text-ink-soft">
          {[
            'Уведомлений и автоматизаций «когда X → сделать Y»',
            'Обмена с 1С: данные переносятся файлом в обе стороны',
            'Приёма оплаты внутри приложений',
            'Своих доменов у приложений',
            'Работы без интернета',
          ].map((line) => (
            <li key={line} className="flex gap-3">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-muted/50" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Это не планы на будущее, а сегодняшнее положение дел. Если что-то из списка нужно вам
          для работы — напишите на{' '}
          <a href="mailto:hello@tableapp.ru" className="underline underline-offset-4 hover:text-ink">
            hello@tableapp.ru
          </a>
          , мы ответим честно, есть это в работе или нет.
        </p>
      </Section>

      <Section title="Где это уже собрано" width="narrow">
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Готовые шаблоны под частые дела: таблицы, связи и приложение поверх них.{' '}
          <Link href="/templates" className="font-medium text-sage-700 underline underline-offset-4">
            Посмотреть шаблоны
          </Link>{' '}
          или{' '}
          <Link href="/solutions" className="font-medium text-sage-700 underline underline-offset-4">
            выбрать по задаче
          </Link>
          .
        </p>
      </Section>

      <CtaSection
        title="Посмотрите на"
        accent="своей таблице"
        text="Загрузите файл — увидите, какие колонки получились и что из них соберётся. Бесплатный тариф без ограничения по времени, карта не нужна."
        href={member ? '/import' : '/login?next=%2Fimport'}
        label={member ? 'Импортировать таблицу' : 'Загрузить свою таблицу'}
        secondary={{ href: '/how-it-works', label: 'Как это работает' }}
      />
    </MarketingShell>
  )
}
import { LOGIN_CODE_TTL_MINUTES } from '@/lib/auth-constants'
