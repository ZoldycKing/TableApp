import { describe, expect, it } from 'vitest'
import {
  PLANS,
  explain,
  explainToCustomer,
  graceReserve,
  graceUsed,
  isOverLimit,
  type PlanLimitDetails,
} from './plans'

/**
 * Правила отказа.
 *
 * Сам отказ ходит в базу, и проверять его здесь нечем. Проверяется то,
 * что от базы не зависит и при этом решает: величина резерва, слова, которыми
 * человеку объясняют отказ, и то, что клиенту приложения не рассказывают
 * про чужой тариф.
 */

const ru = (text: string) => text.replace(/ /g, ' ')

const details = (partial: Partial<PlanLimitDetails> = {}): PlanLimitDetails => ({
  code: 'PLAN_ROW_LIMIT',
  plan: 'free',
  resource: 'rows',
  used: 2_000,
  limit: 2_000,
  requested: 1,
  nextPlan: 'start',
  ...partial,
})

describe('аварийный резерв строк', () => {
  it('пять процентов потолка, но не меньше пятидесяти и не больше тысячи', () => {
    /*
     * На маленьком тарифе процент от потолка слишком мал, чтобы пережить
     * наплыв заказов; на большом — слишком велик, чтобы оставаться аварийным
     * запасом, а не бесплатной прибавкой к тарифу.
     */
    expect(graceReserve(2_000)).toBe(100)
    expect(graceReserve(25_000)).toBe(1_000)
    expect(graceReserve(100_000)).toBe(1_000)
    expect(graceReserve(500_000)).toBe(1_000)
  })

  it('нижняя граница держит совсем маленькие потолки', () => {
    // Пять процентов от ста — это пять строк: на них не переживёшь и минуты.
    expect(graceReserve(100)).toBe(50)
    expect(graceReserve(10)).toBe(50)
    expect(graceReserve(0)).toBe(50)
  })

  it('резерв есть у каждого тарифа и он конечен', () => {
    for (const plan of Object.values(PLANS)) {
      const reserve = graceReserve(plan.limits.rows)
      expect(reserve, plan.id).toBeGreaterThan(0)
      expect(reserve, plan.id).toBeLessThanOrEqual(1_000)
    }
  })
})

describe('израсходованный резерв', () => {
  it('до потолка резерв не тронут', () => {
    expect(graceUsed(1_999, 2_000)).toBe(0)
    expect(graceUsed(2_000, 2_000)).toBe(0)
    expect(isOverLimit(2_000, 2_000)).toBe(false)
  })

  it('первая же строка сверх потолка делает пространство превысившим', () => {
    // Это событие, которое владелец обязан увидеть, а не плавное ухудшение.
    expect(graceUsed(2_001, 2_000)).toBe(1)
    expect(isOverLimit(2_001, 2_000)).toBe(true)
  })
})

describe('что говорят владельцу', () => {
  it('названо, что кончилось, сколько есть и что дальше', () => {
    // «Превышен лимит тарифного плана» не отвечает ни на один из трёх вопросов.
    const text = ru(explain(details()))
    expect(text).toContain('Закончились строки: 2 000 из 2 000')
    expect(text).toContain('Бесплатный')
    expect(text).toContain('Старт')
    expect(text).toContain('25 000')
    expect(text).toContain('/usage')
  })

  it('кончившийся резерв — отдельная фраза, а не та же самая', () => {
    /*
     * Это разные события: в первом случае встало только то, что человек
     * делает руками; во втором — перестали приниматься заказы клиентов,
     * и узнать об этом он должен не из той же фразы.
     */
    const text = ru(
      explain(details({ code: 'PLAN_ROW_GRACE_EXHAUSTED', used: 2_100, graceUsed: 100, graceLimit: 100 })),
    )
    expect(text).toContain('аварийный резерв')
    expect(text).toContain('больше не принимаются')
  })

  it('объём просьбы называют, только когда он больше одной единицы', () => {
    // «Не поместилась 1 строка» ничего не добавляет; «не поместились 5 000» —
    // сразу объясняет, почему импорт не прошёл целиком.
    expect(ru(explain(details()))).not.toContain('Не поместилось')
    expect(ru(explain(details({ requested: 5_000 })))).toContain('Не поместилось: 5 000')
  })

  it('про приложения говорят «опубликовать», а не «использовано»', () => {
    const text = explain(
      details({ code: 'PLAN_APP_LIMIT', resource: 'publishedApps', used: 1, limit: 1 }),
    )
    expect(text).toContain('опубликовать 1')
    expect(text).toContain('уже опубликовано 1')
  })

  it('файлы названы в мегабайтах, а не в байтах', () => {
    // «262144000 из 262144000» человек не прочитает.
    const text = ru(
      explain(
        details({
          code: 'PLAN_STORAGE_LIMIT',
          resource: 'fileBytes',
          used: 250 * 1024 ** 2,
          limit: 250 * 1024 ** 2,
        }),
      ),
    )
    expect(text).toContain('Закончилось место под файлы')
    expect(text).toContain('250 МБ')
    expect(text).not.toContain('262144000')
  })

  it('на самом широком тарифе предлагают не тариф, а разговор', () => {
    // Отправлять человека на несуществующий следующий тариф — тупик.
    const text = explain(details({ plan: 'scale', nextPlan: null }))
    expect(text).toContain('Напишите нам')
    expect(text).not.toContain('undefined')
    expect(text).toContain('/usage')
  })
})

describe('что говорят клиенту приложения', () => {
  it('ни слова о тарифе, потолке и чужих деньгах', () => {
    /*
     * Клиент пришёл заказать услугу. Что у владельца кончилось место
     * на тарифе — не его дело и не его ответственность, и сообщать ему это
     * значит выставлять хозяина в плохом свете чужими руками.
     */
    const text = explainToCustomer()
    for (const word of ['тариф', 'лимит', 'потолок', 'строк', 'резерв', '₽', 'Бесплатный', '/usage']) {
      expect(text.toLowerCase(), word).not.toContain(word.toLowerCase())
    }
  })

  it('сказано, что делать дальше', () => {
    // Тупик без выхода хуже отказа: человеку нужен второй путь.
    expect(explainToCustomer()).toMatch(/позже|свяжитесь/i)
  })
})
