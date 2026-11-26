/**
 * Deterministic demo clients for the cabinet screenshots. Pure data: no clock, no randomness,
 * so the list and the card read the same on every reload.
 */

export type DemoTone = 'b' | 'y' | 'n'
export type PillTone = 'ok' | 'wt' | 'nw' | 'bd' | 'mu'

export type DemoClient = {
  id: string
  name: string
  phone: string
  email: string
  /** `dd.mm.yyyy` */
  lastDate: string
  lastTime: string
  /** Sortable `yyyymmddhhmm`. */
  lastKey: number
  /** `dd.mm.yyyy` — first visit. */
  since: string
  sinceKey: number
  kind: { label: string; tone: DemoTone }
  used: { done: number; total: number } | null
  paid: number
  next: string | null
  /** What the client has now, for the phone list. */
  doing: string
  open: boolean
}

export const DEMO_CLIENT_TOTAL = 148
export const DEMO_CLIENT_PAGE = 12

type Seed = readonly [name: string, phone: string, last: string, kind: string, tone: DemoTone, used: string, paid: number, next: string, doing: string]

const HEAD: readonly Seed[] = [
  ['Алина Морозова', '+7 913 204-11-87', '24.11.2026 19:00', 'Абонемент на 8 прокатов', 'b', '5/8', 14600, '28.11.2026 12:00', 'Велосипед Trek Marlin 7 · выдан'],
  ['Денис Ковалёв', '+7 926 118-40-02', '22.11.2026 12:00', 'Разовая аренда', 'n', '', 4250, '', 'SUP-доска Red Paddle · возвращена'],
  ['Марина Лосева', '+7 921 330-17-45', '21.11.2026 17:00', 'Курс «Тур выходного дня»', 'y', '3/6', 21000, '01.12.2026 12:00', 'Палатка MSR · подтверждена'],
  ['Ольга Нечаева', '+7 903 771-52-08', '20.11.2026 12:00', 'Абонемент на 4 проката', 'b', '3/4', 7200, '', 'Перфоратор Bosch · возвращён'],
  ['Кирилл Ан', '+7 916 405-28-31', '19.11.2026 18:00', 'Подарочный сертификат', 'n', '', 4500, '', 'Гидрокостюм 3 мм · возвращён'],
  ['Екатерина Шульц', '+7 985 612-09-44', '18.11.2026 16:00', 'Курс «Тур выходного дня»', 'y', '4/6', 16900, '29.11.2026 12:00', 'Велосипед Electra · выдан'],
  ['Тимур Галиев', '+7 927 540-63-19', '17.11.2026 12:00', 'Разовая аренда', 'n', '', 1800, '', 'Сноуборд Burton · возвращён'],
  ['Светлана Ким', '+7 909 218-75-60', '09.11.2026 12:00', 'Абонемент на 12 прокатов', 'b', '9/12', 18400, '30.11.2026 12:00', 'Планшет для SUP · возвращён'],
  ['Павел Рябов', '+7 912 663-04-27', '07.11.2026 11:00', 'Корпоративный пакет', 'y', '2/10', 32400, '', 'Палатка 4 места · возвращена'],
  ['Анастасия Белова', '+7 964 087-31-52', '03.11.2026 12:00', 'Разовая аренда', 'n', '', 2400, '', 'Ролики Rollerblade · возвращены'],
  ['Роман Власов', '+7 905 349-80-16', '28.10.2026 15:00', 'Абонемент на 8 прокатов', 'b', '6/8', 12800, '', 'Шлем и защита · возвращены'],
  ['Ирина Власова', '+7 931 502-18-73', '24.10.2026 12:00', 'Подарочный сертификат', 'n', '', 3200, '', 'Велосипед Trek · возвращён'],
]

const FEMALE_FIRST = ['Анна', 'Елена', 'Дарья', 'Юлия', 'Полина', 'Вера', 'Наталья', 'Ксения', 'Виктория', 'Алёна', 'Татьяна', 'Лидия']
const FEMALE_LAST = ['Смирнова', 'Кузнецова', 'Попова', 'Соколова', 'Лебедева', 'Козлова', 'Новикова', 'Морозова', 'Петрова', 'Волкова', 'Соловьёва', 'Васильева', 'Зайцева', 'Павлова']
const MALE_FIRST = ['Алексей', 'Дмитрий', 'Сергей', 'Андрей', 'Максим', 'Никита', 'Илья', 'Глеб', 'Михаил', 'Владимир', 'Артём', 'Егор']
const MALE_LAST = ['Иванов', 'Смирнов', 'Кузнецов', 'Попов', 'Соколов', 'Лебедев', 'Козлов', 'Новиков', 'Морозов', 'Волков', 'Соловьёв', 'Васильев', 'Зайцев', 'Павлов']
const KINDS: readonly [string, DemoTone, number][] = [
  ['Разовая аренда', 'n', 0],
  ['Абонемент на 8 прокатов', 'b', 8],
  ['Курс «Тур выходного дня»', 'y', 6],
  ['Абонемент на 4 проката', 'b', 4],
  ['Подарочный сертификат', 'n', 0],
  ['Разовая аренда', 'n', 0],
]
const DOING = ['Велосипед Trek · возвращён', 'SUP-доска · возвращена', 'Палатка MSR · возвращена', 'Самокат Xiaomi · возвращён', 'Рюкзак 60 л · возвращён', 'Сноуборд · возвращён']
const SINCE = ['14.03.2025', '02.08.2025', '19.01.2026', '11.05.2026', '27.09.2026', '06.11.2026', '21.04.2025', '30.10.2025', '08.12.2025', '15.02.2026', '03.07.2026', '12.09.2025']

const pad = (value: number) => String(value).padStart(2, '0')
const keyOf = (date: string, time: string) => {
  const [day = '', month = '', year = ''] = date.split('.')
  return Number(`${year}${month}${day}${time.replace(':', '')}`)
}

let cache: DemoClient[] | null = null

export function prokatDemoClients(): DemoClient[] {
  if (cache) return cache
  const list: DemoClient[] = HEAD.map((seed, index) => {
    const [name, phone, last, label, tone, used, paid, next, doing] = seed
    const [lastDate = '', lastTime = ''] = last.split(' ')
    const [done = 0, total = 0] = used ? used.split('/').map(Number) : []
    const since = SINCE[index % SINCE.length] ?? '14.03.2025'
    return {
      id: `demo-client-${index + 1}`,
      name,
      phone,
      email: emailOf(name, index),
      lastDate,
      lastTime,
      lastKey: keyOf(lastDate, lastTime),
      since,
      sinceKey: keyOf(since, '00:00'),
      kind: { label, tone },
      used: used ? { done, total } : null,
      paid,
      next: next || null,
      doing,
      open: Boolean(next),
    }
  })
  for (let index = HEAD.length; index < DEMO_CLIENT_TOTAL; index += 1) {
    const female = index % 2 === 0
    const first = (female ? FEMALE_FIRST : MALE_FIRST)[(index * 5) % 12] ?? 'Анна'
    const last = (female ? FEMALE_LAST : MALE_LAST)[(index * 3 + Math.floor(index / 7)) % 14] ?? 'Иванова'
    const name = `${first} ${last}`
    const kind = KINDS[index % KINDS.length] ?? KINDS[0]!
    const stale = index % 6 === 0
    const lastDate = stale
      ? `${pad(1 + ((index * 5) % 27))}.${pad(3 + ((index * 7) % 6))}.2026`
      : `${pad(1 + ((index * 5) % 22))}.10.2026`
    const lastTime = `${pad(10 + (index % 9))}:00`
    const since = SINCE[index % SINCE.length] ?? '14.03.2025'
    const total = kind[2]
    list.push({
      id: `demo-client-${index + 1}`,
      name,
      phone: `+7 9${pad(10 + ((index * 7) % 80))} ${pad(100 + ((index * 13) % 800)).padStart(3, '0')}-${pad((index * 17) % 100)}-${pad((index * 29) % 100)}`,
      email: emailOf(name, index),
      lastDate,
      lastTime,
      lastKey: keyOf(lastDate, lastTime),
      since,
      sinceKey: keyOf(since, '00:00'),
      kind: { label: kind[0], tone: kind[1] },
      used: total ? { done: 1 + (index % (total - 1)), total } : null,
      paid: 1800 + ((index * 1300) % 30600),
      next: null,
      doing: DOING[index % DOING.length] ?? DOING[0]!,
      open: false,
    })
  }
  cache = list
  return list
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}
const slug = (word: string) => [...word.toLowerCase()].map(char => TRANSLIT[char] ?? char).join('')
function emailOf(name: string, index: number) {
  const [first = '', last = ''] = name.split(' ')
  const domain = ['mail.ru', 'yandex.ru', 'gmail.com'][index % 3] ?? 'mail.ru'
  return `${slug(first).slice(0, 1)}.${slug(last)}@${domain}`
}

export function demoClientById(id: string | undefined) {
  return prokatDemoClients().find(client => client.id === id)
}

export type DemoCardStep = { label: string; date: string; state: 'done' | 'cur' | 'todo' }
export type DemoCardMessage = { id: string; kind: 'in' | 'out' | 'note' | 'sys'; head: string; text: string }
export type DemoCard = {
  since: string
  tags: { label: string; tone: DemoTone }[]
  count: number
  average: number
  paid: number
  /** Bookings the client holds right now. */
  open: number
  active: { title: string; sub: string; number: string; status: { label: string; tone: PillTone }; amount: number; steps: DemoCardStep[] } | null
  past: { date: string; title: string; sub: string; status: { label: string; tone: PillTone }; amount: number }[]
  fields: { label: string; value: string; mono?: boolean }[]
  messages: DemoCardMessage[]
}

const PAST: readonly [string, string, number][] = [
  ['Городской велосипед Electra', '2 дня · шлем, замок', 2900],
  ['SUP-доска Red Paddle 10\'6"', 'сутки · весло, насос', 3400],
  ['Палатка MSR, 3 места', '3 дня · коврики', 4200],
  ['Горный велосипед Trek Marlin 7', 'выходные · фляга', 3800],
  ['Гидрокостюм 3 мм', 'сутки', 1800],
  ['Сноуборд Burton', '2 дня · ботинки', 5100],
]

/** Same shape of card for every demo client; the numbers follow the client's seed. */
export function prokatDemoCard(client: { id: string; name: string; since?: string }): DemoCard {
  const clients = prokatDemoClients()
  const found = clients.find(item => item.id === client.id)
  const seed = Math.max(0, found ? clients.indexOf(found) : client.id.length)
  const first = client.name.split(' ')[0] ?? client.name
  const past = [0, 1, 2].map(step => {
    const [title, sub, amount] = PAST[(seed + step * 2) % PAST.length] ?? PAST[0]!
    const dates = ['12.09.2026', '03.06.2026', '14.03.2025']
    return { date: dates[step] ?? '14.03.2025', title, sub, status: { label: 'Возвращено', tone: 'ok' as const }, amount }
  })
  const active = PAST[(seed + 1) % PAST.length] ?? PAST[0]!
  const amount = 6200
  const paid = past.reduce((sum, item) => sum + item.amount, 0) + amount
  const number = 1042 + (seed % 9)
  const steps: DemoCardStep[] = [
    { label: 'Заявка', date: '20.11.2026', state: 'done' },
    { label: 'Подтверждена', date: '21.11.2026', state: 'done' },
    { label: 'Оплачена', date: '21.11.2026', state: 'done' },
    { label: 'Выдано', date: '24.11.2026', state: 'cur' },
    { label: 'Возврат', date: '—', state: 'todo' },
  ]
  return {
    since: client.since ?? found?.since ?? '14.03.2025',
    tags: [{ label: 'Постоянный', tone: 'b' }, { label: 'Залог внесён', tone: 'y' }],
    count: past.length + 1,
    open: 1,
    average: Math.round(paid / (past.length + 1) / 100) * 100,
    paid,
    active: { title: active[0], sub: `${active[1]} · выдал Сергей`, number: `№ ПР-${number} · с 24.11.2026`, status: { label: 'Выдан', tone: 'nw' }, amount, steps },
    past,
    fields: [
      { label: 'Адрес', value: 'ул. Кирова, 28, кв. 14' },
      { label: 'Как связаться', value: 'Telegram, после 18:00' },
      { label: 'Откуда узнал', value: 'Яндекс Карты' },
      { label: 'Скидка', value: '5% постоянному' },
      { label: 'День рождения', value: '02.08.1988', mono: true },
    ],
    messages: [
      { id: 'sys-1', kind: 'sys', head: '', text: `Заявка № ПР-${number} · ${active[0]}` },
      { id: 'in-1', kind: 'in', head: `${first} · 24.11.2026, 10:12`, text: 'Добрый день! Можно забрать велосипед сегодня после 12:00?' },
      { id: 'note-1', kind: 'note', head: 'Заметка администратора · 24.11.2026, 11:40', text: 'Залог внесён, документы не оставляли. Перед выдачей проверить тормоза и давление в шинах.' },
      { id: 'out-1', kind: 'out', head: 'Вы · 24.11.2026, 12:05', text: 'Да, всё готово, ждём в пункте проката до 20:00. К оплате 6 200 ₽.' },
      { id: 'in-2', kind: 'in', head: `${first} · 24.11.2026, 12:20`, text: 'Спасибо, заеду после работы.' },
    ],
  }
}
