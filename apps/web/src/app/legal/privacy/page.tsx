import { pageMetadata } from '@/lib/seo'

export const metadata = {
  ...pageMetadata({
    path: '/legal/privacy',
    title: 'Обработка персональных данных',
    description:
      'Какие данные собирает Scatta, где они лежат, кто их видит, сколько хранятся и как их забрать или удалить.',
    type: 'article',
  }),
  // Пока политика не в окончательной редакции, странице нечего делать в поиске.
  robots: { index: false, follow: false },
}

/**
 * Политика обработки данных.
 *
 * Фактическая часть здесь правдива уже сейчас: описывается то, что делает код,
 * и числа взяты из него же. Чего нет — реквизитов оператора, сроков хранения
 * журналов и перечня подрядчиков: это решения владельца, и выдумывать их
 * нельзя. Такие места помечены прямо в тексте.
 *
 * Главное разделение, без которого политика врёт: **данные владельца** мы
 * обрабатываем как оператор, а **данные его клиентов**, которые он сам внёс
 * в свои таблицы, — по его поручению. Оператором там остаётся он.
 */
export default function PrivacyPage() {
  return (
    <article className="space-y-5">
      <h1 className="font-display text-3xl font-extrabold leading-tight">
        Обработка персональных данных
      </h1>

      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
        <span className="font-medium">Проект.</span> Окончательная редакция
        с реквизитами оператора будет опубликована до приёма первой оплаты.
        Фактическая часть — как система устроена сегодня — правдива уже сейчас:
        она описывает поведение кода, а не намерения.
      </p>

      <h2 className="pt-2 text-lg font-semibold">Два разных набора данных</h2>
      <p className="leading-relaxed text-ink-soft">
        Их важно не путать, потому что отвечают за них разные люди.
      </p>
      <ul className="space-y-2 text-ink-soft">
        <li className="leading-relaxed">
          <span className="font-medium text-ink">Данные вашего аккаунта</span> — почта,
          имя, записи о входах, сведения об оплате. Здесь оператор мы: мы решаем,
          зачем они нужны, и отвечаем за них.
        </li>
        <li className="leading-relaxed">
          <span className="font-medium text-ink">Данные в ваших таблицах</span> — всё,
          что вы туда внесли: клиенты, сотрудники, заказы, файлы. Эти данные мы
          обрабатываем <span className="font-medium text-ink">по вашему поручению</span>:
          храним, показываем тем, кому вы открыли доступ, и выдаём вам обратно.
          Оператор здесь вы — вы собирали эти сведения и решаете, зачем они вам.
          Мы в них не заглядываем и не используем ни для чего, кроме работы сервиса.
        </li>
      </ul>
      <p className="leading-relaxed text-ink-soft">
        По закону такое поручение оформляется договором, в котором сказано, что
        исполнитель обязан соблюдать конфиденциальность и требования к защите
        данных; ответственность перед человеком, чьи это данные, остаётся
        на операторе (ч. 3 ст. 6 Федерального закона № 152-ФЗ). Текст поручения
        войдёт в договор-оферту отдельным разделом — он готовится вместе с ней.
      </p>

      <h2 className="pt-2 text-lg font-semibold">Что мы получаем и зачем</h2>
      <div className="overflow-x-auto rounded-xl border border-sand-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-sand-200 bg-sand-50 text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Что</th>
              <th className="px-3 py-2 font-medium">Зачем</th>
              <th className="px-3 py-2 font-medium">Сколько хранится</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200 text-ink-soft">
            <tr>
              <td className="px-3 py-2">Адрес почты</td>
              <td className="px-3 py-2">вход в сервис: пароля нет, вместо него код в письме</td>
              <td className="px-3 py-2">пока существует аккаунт</td>
            </tr>
            <tr>
              <td className="px-3 py-2">Имя, если указали</td>
              <td className="px-3 py-2">подпись в команде и в истории изменений</td>
              <td className="px-3 py-2">пока существует аккаунт</td>
            </tr>
            <tr>
              <td className="px-3 py-2">Код и ссылка для входа</td>
              <td className="px-3 py-2">подтверждение почты</td>
              <td className="px-3 py-2">15 минут, затем удаляются</td>
            </tr>
            <tr>
              <td className="px-3 py-2">Сессия браузера</td>
              <td className="px-3 py-2">чтобы не входить заново на каждой странице</td>
              <td className="px-3 py-2">30 дней или до выхода</td>
            </tr>
            <tr>
              <td className="px-3 py-2">Записи о входах: время, адрес, браузер</td>
              <td className="px-3 py-2">вы видите их на странице «Безопасность» и замечаете чужой вход</td>
              <td className="px-3 py-2">срок хранения определяется (см. ниже)</td>
            </tr>
            <tr>
              <td className="px-3 py-2">Содержимое ваших таблиц и файлы</td>
              <td className="px-3 py-2">это и есть сервис</td>
              <td className="px-3 py-2">пока вы их не удалите</td>
            </tr>
            <tr>
              <td className="px-3 py-2">Сведения о платеже</td>
              <td className="px-3 py-2">подписка, счёт, возврат</td>
              <td className="px-3 py-2">по требованиям бухгалтерского учёта</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-sm leading-relaxed text-ink-muted">
        Данных карты у нас нет и быть не может: оплата проходит на стороне
        платёжного провайдера, нам возвращается только отметка о платеже.
      </p>

      <h2 className="pt-2 text-lg font-semibold">Где всё лежит</h2>
      <p className="leading-relaxed text-ink-soft">
        На серверах в России. Файлы — в объектном хранилище, доступ к ним
        выдаётся по подписанной ссылке и выводится из прав на строку таблицы:
        нет доступа к строке — нет доступа к её вложениям.
      </p>

      <h2 className="pt-2 text-lg font-semibold">Кто видит данные ваших таблиц</h2>
      <p className="leading-relaxed text-ink-soft">
        Только те, кому вы открыли доступ. Сотрудники приложения видят строки
        по правилам, которые задаёте вы, и проверка делается на сервере — чужие
        строки не доходят до браузера. Мы не передаём данные третьим лицам
        и не используем их для обучения чего-либо.
      </p>
      <p className="leading-relaxed text-ink-soft">
        Подрядчики, через которых проходят данные: почтовый сервис (письма
        с кодом входа) и платёжный провайдер (оплата подписки). Их список
        с названиями появится здесь, когда договоры будут подписаны, — называть
        их заранее значило бы обещать чужую работу.
      </p>

      <h2 className="pt-2 text-lg font-semibold">Как забрать и удалить</h2>
      <p className="leading-relaxed text-ink-soft">
        Выгрузка таблицы в CSV или книгу Excel доступна из интерфейса в любой
        момент и без обращения к нам. Удалённые строки уходят в корзину и
        остаются там, пока вы их не удалите окончательно. Для удаления всего
        пространства напишите на{' '}
        <a href="mailto:hello@tableapp.ru" className="underline">hello@tableapp.ru</a> —
        мы удалим его вместе с таблицами, файлами и приложениями.
      </p>

      <h2 className="pt-2 text-lg font-semibold">Чего здесь пока нет</h2>
      <p className="leading-relaxed text-ink-soft">
        Реквизитов оператора, точного срока хранения журналов входов и имён
        подрядчиков. Это не формальности: по ним человек понимает, кому писать
        и с кого спрашивать. Выдумывать их мы не станем — они появятся
        в окончательной редакции до приёма первой оплаты.
      </p>
    </article>
  )
}
