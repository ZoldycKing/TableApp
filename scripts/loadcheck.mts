/**
 * Ограниченная нагрузочная проверка.
 *
 * Это **не** замер мощности сервиса. Сервер, база, браузер и сам скрипт
 * работают на одной машине и мешают друг другу, поэтому числа отсюда нельзя
 * переносить на рабочее окружение. Проверка отвечает на другие вопросы,
 * и каждый из них — про отказ, а не про скорость:
 *
 * 1. Держатся ли открытые потоки живых обновлений, или часть обрывается.
 * 2. Не появляются ли ошибки, когда обычные страницы читают одновременно.
 * 3. Освобождаются ли подписки после закрытия вкладок — утечка видна
 *    по тому, что следующий заход становится медленнее предыдущего.
 *
 * ## Профиль и почему он такой
 *
 * Цель пилота — малые команды: пространство на пять–двадцать человек.
 * Отсюда профиль, а не круглые числа:
 *
 * - **20 одновременных потоков живых обновлений.** Это вся команда с открытой
 *   вкладкой таблицы — обычный рабочий день, а не пик. Каждый такой поток
 *   занимает соединение целиком и переспрашивает права раз в 25 секунд,
 *   поэтому важна не скорость, а то, что они все живут.
 * - **10 одновременных читателей публичных страниц, по 10 запросов.**
 *   Сто запросов — это переход по ссылке из рассылки небольшим списком.
 *   Больше на одной машине проверять нечестно: упрёмся в машину.
 * - **60 секунд удержания потоков** — чуть больше двух сигналов жизни
 *   (25 с): достаточно, чтобы увидеть обрыв на прокси или по тайм-ауту.
 *
 * Запуск:
 *
 *     npx tsx scripts/loadcheck.mts --base http://localhost:3100 \
 *       --table tbl_... --cookie tableapp_session=ses_...
 */

type Args = { base: string; table: string; cookie: string; streams: number; readers: number; each: number; holdSec: number }

function parseArgs(): Args {
  const raw = process.argv.slice(2)
  const get = (name: string, fallback = '') => {
    const i = raw.indexOf(`--${name}`)
    return i === -1 ? fallback : (raw[i + 1] ?? fallback)
  }
  return {
    base: get('base', 'http://localhost:3100').replace(/\/$/, ''),
    table: get('table'),
    cookie: get('cookie'),
    streams: Number(get('streams', '20')),
    readers: Number(get('readers', '10')),
    each: Number(get('each', '10')),
    holdSec: Number(get('hold', '60')),
  }
}

const args = parseArgs()

function stats(values: number[]): string {
  if (values.length === 0) return 'нет замеров'
  const sorted = [...values].sort((a, b) => a - b)
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]!
  return `медиана ${Math.round(at(0.5))} мс, 95% быстрее ${Math.round(at(0.95))} мс, худший ${Math.round(sorted.at(-1)!)} мс`
}

/** Публичные страницы: что видит человек, пришедший по ссылке. */
async function readers(): Promise<void> {
  const pages = ['/', '/pricing', '/templates', '/solutions', '/features']
  const times: number[] = []
  const codes = new Map<number, number>()

  console.log(`\nПубличные страницы: ${args.readers} читателей по ${args.each} запросов`)
  const started = Date.now()

  await Promise.all(
    Array.from({ length: args.readers }, async (_, reader) => {
      for (let i = 0; i < args.each; i += 1) {
        const page = pages[(reader + i) % pages.length]!
        const at = Date.now()
        const response = await fetch(`${args.base}${page}`, { redirect: 'manual' })
        await response.arrayBuffer()
        times.push(Date.now() - at)
        codes.set(response.status, (codes.get(response.status) ?? 0) + 1)
      }
    }),
  )

  const total = Date.now() - started
  console.log(`  ${times.length} запросов за ${(total / 1000).toFixed(1)} с — ${stats(times)}`)
  console.log(`  ответы: ${[...codes].map(([code, n]) => `${code}×${n}`).join(', ')}`)
  const bad = [...codes].filter(([code]) => code >= 400)
  console.log(bad.length === 0 ? '  ошибок нет' : `  ОШИБКИ: ${bad.map(([c, n]) => `${c}×${n}`).join(', ')}`)
}

/**
 * Потоки живых обновлений.
 *
 * Считаем не скорость, а факты: сколько подключилось, сколько дожило
 * до конца, сколько сигналов жизни пришло. Поток, который молча оборвался,
 * в продукте выглядит как «таблица перестала обновляться» — и человек
 * узнаёт об этом последним.
 */
async function streams(): Promise<void> {
  if (!args.table || !args.cookie) {
    console.log('\nПотоки живых обновлений пропущены: не заданы --table и --cookie.')
    return
  }

  console.log(`\nЖивые обновления: ${args.streams} потоков, держим ${args.holdSec} с`)
  const opened: number[] = []
  const beats: number[] = []
  let failed = 0
  let broke = 0

  const controllers = Array.from({ length: args.streams }, () => new AbortController())

  const work = controllers.map(async (controller, index) => {
    const at = Date.now()
    let mine = 0
    try {
      const response = await fetch(`${args.base}/api/live/${args.table}`, {
        headers: { cookie: args.cookie, accept: 'text/event-stream' },
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        failed += 1
        if (index === 0) console.log(`  первый поток отказал: ${response.status}`)
        return
      }
      opened.push(Date.now() - at)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          // Конец до срока — это обрыв, а не нормальное завершение.
          if (!controller.signal.aborted) broke += 1
          break
        }
        const text = decoder.decode(value, { stream: true })
        mine += (text.match(/: жив/g) ?? []).length
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        failed += 1
        if (index === 0) console.log(`  первый поток упал: ${(error as Error).message}`)
      }
    } finally {
      beats.push(mine)
    }
  })

  await new Promise((done) => setTimeout(done, args.holdSec * 1000))
  for (const controller of controllers) controller.abort()
  await Promise.all(work)

  const alive = args.streams - failed - broke
  console.log(`  подключилось: ${opened.length} из ${args.streams} — ${stats(opened)}`)
  console.log(`  дожило до конца: ${alive}, оборвалось само: ${broke}, не подключилось: ${failed}`)
  console.log(`  сигналов жизни на поток: ${beats.length ? Math.min(...beats) : 0}…${beats.length ? Math.max(...beats) : 0}`)
  console.log(alive === args.streams ? '  все потоки дожили' : '  ЧАСТЬ ПОТОКОВ НЕ ДОЖИЛА')
}

/**
 * Освободились ли подписки.
 *
 * Прямо изнутри процесса сервера это не видно, поэтому смотрим косвенно:
 * после закрытия всех потоков обычная страница должна отвечать так же
 * быстро, как до них. Если нет — что-то осталось висеть.
 */
async function after(before: number[]): Promise<void> {
  const times: number[] = []
  for (let i = 0; i < 20; i += 1) {
    const at = Date.now()
    await (await fetch(`${args.base}/pricing`)).arrayBuffer()
    times.push(Date.now() - at)
  }
  const median = (list: number[]) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]!
  console.log(`\nПосле закрытия потоков: ${stats(times)}`)
  console.log(`  до нагрузки было ${Math.round(median(before))} мс, стало ${Math.round(median(times))} мс`)
}

async function warmup(): Promise<number[]> {
  const times: number[] = []
  for (let i = 0; i < 20; i += 1) {
    const at = Date.now()
    await (await fetch(`${args.base}/pricing`)).arrayBuffer()
    times.push(Date.now() - at)
  }
  console.log(`Разогрев: ${stats(times)}`)
  return times
}

console.log(`Проверка на ${args.base}. Это локальный замер поведения, а не мощности.`)
const before = await warmup()
await readers()
await streams()
await after(before)
