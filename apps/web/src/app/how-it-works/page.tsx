import type { ReactNode } from 'react'
import {
  CtaSection,
  FaqList,
  MarketingShell,
  PageHero,
  PrimaryLink,
  SecondaryLink,
  Section,
} from '@/components/marketing/blocks'
import { ScreenCard, ScreenFrame, ScreenList, ScreenTable } from '@/components/marketing/screens'
import { pageMetadata } from '@/lib/seo'
import { currentMember } from '@/lib/session'
import { EXAMPLE_CSV, exampleImportColumns } from '@/lib/import-example'

export const dynamic = 'force-dynamic'

export const metadata = pageMetadata({
  path: '/how-it-works',
  title: 'Как это работает — один пример от файла до приложения',
  description:
    'Проходим один путь целиком: выгрузка заявок из Excel, импорт, порядок в таблице, приложение, роли и ссылка сотруднику. На каждом шаге видно, что изменилось.',
})

/**
 * Как это работает.
 *
 * Один пример, доведённый до конца, вместо шести абзацев про этапы. На каждом
 * шаге показано, что именно изменилось: был файл — стала таблица, была
 * таблица — стал экран у мастера.
 *
 * Это отдельный CSV-пример. Типы колонок получены настоящим импортёром;
 * представления, формат денег и ограничения записей настраиваются по шагам.
 */

type Step = {
  title: string
  text: string
  /** Что изменилось после шага — показано, а не описано. */
  result: ReactNode
}

const STEPS: Step[] = [
  {
    title: 'Выгрузка, с которой всё начинается',
    text:
      'Файл из Excel или CSV из 1С — тот, что уже лежит у вас. Кодировку и разделитель определять не нужно: windows-1251 с точкой с запятой читается так же, как обычный UTF-8. В книге Excel видно все листы: выбираете один или несколько, каждый станет своей таблицей.',
    result: (
      <ScreenFrame device="desktop" title="zayavki.csv" note="Обычный файл: первая строка — заголовки.">
        <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-ink-soft">
{EXAMPLE_CSV}
        </pre>
      </ScreenFrame>
    ),
  },
  {
    title: 'Импорт: вы подтверждаете, что получилось',
    text:
      'Типы предлагаются по содержимому. В этом файле «Сумма» распознаётся обычным числом, а «Статус» — текстом. Перед загрузкой выберите для статуса список выбора. Денежный формат суммы с рублями задайте в настройках колонки уже после импорта. При загрузке в существующую таблицу проверьте сопоставление колонок. Формулы Excel и связи между листами автоматически не переносятся.',
    result: (
      <ScreenFrame device="desktop" title="Что предложит импорт" note="Реальный результат распознавания этого CSV. До подтверждения данные не загружаются; тип статуса можно изменить вручную.">
        <ScreenTable
          caption="Сопоставление колонок"
          columns={['Колонка файла', 'Станет колонкой', 'Тип']}
          rows={exampleImportColumns()}
        />
      </ScreenFrame>
    ),
  },
  {
    title: 'Порядок в данных',
    text:
      'После импорта выберите рубли в настройках колонки «Сумма». Затем настройте фильтры и сортировку. Доска и календарь открываются в рабочем пространстве. Список приложения использует те же данные и фильтры выбранного вида таблицы; календарная раскладка в приложение автоматически не переносится.',
    result: (
      <ScreenFrame device="desktop" title="Таблица «Заявки»" note="Те же строки, уже с типами и представлениями.">
        <ScreenTable
          caption="Заявки после импорта"
          columns={['Клиент', 'Что сделать', 'Статус', 'Мастер', 'Сумма']}
          rows={[
            ['ООО «Вектор»', 'Плановое ТО', 'В работе', 'Сергей', '18 500 ₽'],
            ['Кафе «Пион»', 'Не морозит', 'Новая', '—', '9 500 ₽'],
            ['ИП Соколов', 'Замена фильтров', 'Готово', 'Андрей', '12 000 ₽'],
          ]}
        />
      </ScreenFrame>
    ),
  },
  {
    title: 'Приложение поверх таблицы',
    text:
      'Одно нажатие — и по таблице собираются экраны: список, карточка записи, формы добавления и правки, сводка с числами. Дальше правится мышкой: что показать, что спросить, что скрыть.',
    result: (
      <div className="grid gap-4 sm:grid-cols-2">
        <ScreenFrame title="Список">
          <ScreenList
            title="Заявки"
            right="3"
            rows={[
              { title: 'ООО «Вектор»', subtitle: 'Плановое ТО', status: { label: 'В работе', tone: 'amber' } },
              { title: 'Кафе «Пион»', subtitle: 'Не морозит', status: { label: 'Новая' } },
              { title: 'ИП Соколов', subtitle: 'Замена фильтров', status: { label: 'Готово', tone: 'sage' } },
            ]}
          />
        </ScreenFrame>
        <ScreenFrame title="Карточка">
          <ScreenCard
            title="ООО «Вектор»"
            fields={[
              { label: 'Что сделать', value: 'Плановое ТО' },
              { label: 'Адрес', value: 'Ленина 14, оф. 3' },
              { label: 'Мастер', value: 'Сергей' },
              { label: 'Сумма', value: '18 500 ₽', strong: true },
            ]}
            actions={['Изменить']}
          />
        </ScreenFrame>
      </div>
    ),
  },
  {
    title: 'Роли и доступ',
    text:
      'Вы называете роли своими словами и решаете, кому какие экраны открыты и какие строки видны: все или только свои. В этом примере сначала добавляют почту мастера и правило по ней. Предпросмотр роли проверяет экраны; для проверки своих записей укажите почту и, при необходимости, организацию.',
    result: (
      <div className="grid gap-4 sm:grid-cols-2">
        <ScreenFrame device="desktop" title="Настройка доступа">
          <ScreenTable
            caption="Роли приложения"
            columns={['Роль', 'Экраны', 'Какие строки']}
            rows={[
              ['Диспетчер', 'Все разделы', 'Все заявки'],
              ['Мастер', 'Список, карточка', 'Только свои'],
              ['Мастер без правила', 'Открытые ему разделы', 'Все доступные записи'],
            ]}
          />
        </ScreenFrame>
        <ScreenFrame title="Предпросмотр: мастер" note="Пример после настройки правила по почте мастера. Имя в колонке «Мастер» само по себе записи не ограничивает.">
          <ScreenList
            title="Мои выезды"
            right="1"
            rows={[{ title: 'ООО «Вектор»', subtitle: 'Плановое ТО · сегодня', status: { label: 'В работе', tone: 'amber' } }]}
          />
        </ScreenFrame>
      </div>
    ),
  },
  {
    title: 'Публикация и ссылка',
    text:
      'До публикации приложение видите только вы. После — отправляете ссылку: человек открывает её в браузере, входит по коду из письма и ставит приложение на домашний экран. Магазины приложений не нужны.',
    result: (
      <ScreenFrame device="desktop" title="Ссылка для сотрудников">
        <div className="space-y-3 px-4 py-4">
          <p className="rounded-lg border border-sand-300 bg-sand-50 px-3 py-2 font-mono text-xs text-ink-soft">
            tableapp.ru/a/zayavki
          </p>
          <p className="text-sm leading-relaxed text-ink-soft">
            Доступ открывается адресам из списка. Убрали адрес — человек теряет доступ
            на следующем же действии.
          </p>
        </div>
      </ScreenFrame>
    ),
  },
]

const QUESTIONS = [
  {
    question: 'Нужно ли переносить данные вручную?',
    answer:
      'Нет. Таблица загружается файлом, колонки сопоставляются по названиям, а то, что не совпало, вы выбираете сами перед загрузкой.',
  },
  {
    question: 'Сколько времени занимает первый раз?',
    answer:
      'Шаблон разворачивается сразу, импорт своей таблицы — минуты. Сколько уйдёт на настройку экранов и ролей, зависит от того, насколько подробно вы хотите их настроить.',
  },
  {
    question: 'Что видят сотрудники до публикации?',
    answer:
      'Ничего. Черновик виден только вам и не входит в лимит тарифа. Приложение появляется у людей после того, как вы его опубликовали.',
  },
  {
    question: 'Можно ли потом всё переделать?',
    answer:
      'Да. Приложение — это взгляд на ваши таблицы: экраны, роли и права меняются в любой момент, а данные остаются на месте. Шаблон после установки тоже становится обычными вашими таблицами.',
  },
]

export default async function HowItWorksPage() {
  const member = await currentMember()

  return (
    <MarketingShell signedIn={Boolean(member)}>
      <PageHero
        trail={[{ href: '/', label: 'TableApp' }, { label: 'Как это работает' }]}
        title="Как это работает"
        lead="Проходим один путь целиком: выгрузка заявок из Excel превращается в приложение, которым пользуется мастер с телефона. На каждом шаге видно, что изменилось."
        actions={
          <>
            <PrimaryLink href={member ? '/import' : '/login?next=%2Fimport'}>
              {member ? 'Импортировать таблицу' : 'Загрузить свою таблицу'}
            </PrimaryLink>
            <SecondaryLink href="/demo">Открыть живое демо</SecondaryLink>
          </>
        }
      />

      {STEPS.map((step, index) => (
        <Section key={step.title} tone={index % 2 === 0 ? 'plain' : 'white'}>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
            {/* min-w-0: без него колонка сетки растягивается самым широким
                содержимым — на 320 точках страницу распирала строка файла. */}
            <div className="min-w-0 lg:sticky lg:top-24">
              <p className="font-display text-4xl font-extrabold text-sage-300">0{index + 1}</p>
              <h2 className="mt-3 font-display text-2xl font-extrabold">{step.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{step.text}</p>
            </div>
            <div className="min-w-0">{step.result}</div>
          </div>
        </Section>
      ))}

      <Section title="Частые вопросы" tone="sand" width="narrow">
        <FaqList items={QUESTIONS} />
      </Section>

      <CtaSection
        title="Пройдите этот путь"
        accent="на своих данных"
        text="Возьмите шаблон под своё дело или загрузите свою таблицу. Бесплатный тариф без ограничения по времени, карта не нужна."
        href="/templates"
        label="Посмотреть шаблоны"
        secondary={{ href: '/features', label: 'Что умеет продукт' }}
      />
    </MarketingShell>
  )
}
