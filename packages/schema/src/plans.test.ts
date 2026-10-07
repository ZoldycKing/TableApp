import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PLAN,
  PLANS,
  PLAN_ORDER,
  USAGE_KINDS,
  nextPlan,
  planOf,
  usageLevel,
  usageRatio,
} from './plans'

/**
 * Тарифы.
 *
 * Цифры здесь меняются, и меняться должны свободно. Проверяется не они,
 * а свойства, на которые опирается всё остальное: что тариф всегда находится,
 * что потолки растут, что за людей не берут денег и что доля не ломается
 * на краях.
 */

describe('поиск тарифа', () => {
  it('неизвестный идентификатор даёт бесплатный', () => {
    /*
     * Самый узкий тариф как ответ на «не знаю» — единственный безопасный
     * выбор. Отдать по ошибке самый широкий значит раздать чужие потолки
     * тому, кто за них не платил.
     */
    expect(planOf('такого нет').id).toBe(DEFAULT_PLAN)
    expect(planOf(null).id).toBe(DEFAULT_PLAN)
    expect(planOf(undefined).id).toBe(DEFAULT_PLAN)
    expect(planOf(42).id).toBe(DEFAULT_PLAN)
  })

  it('известный — свой', () => {
    expect(planOf('business').id).toBe('business')
    expect(planOf('business').monthlyPrice).toBe(4_990)
  })
})

describe('устройство линейки', () => {
  it('в порядке перечислены все тарифы и ни одного лишнего', () => {
    expect([...PLAN_ORDER].sort()).toEqual(Object.keys(PLANS).sort())
  })

  it('каждый следующий шире предыдущего по всем потолкам', () => {
    // Иначе переход «наверх» что-то отнимает, и человек это заметит.
    for (let i = 1; i < PLAN_ORDER.length; i += 1) {
      const before = PLANS[PLAN_ORDER[i - 1]!]
      const after = PLANS[PLAN_ORDER[i]!]
      for (const kind of USAGE_KINDS) {
        expect(after.limits[kind], `${after.id}.${kind}`).toBeGreaterThan(before.limits[kind])
      }
      expect(after.monthlyPrice).toBeGreaterThan(before.monthlyPrice)
    }
  })

  it('бесплатный действительно бесплатный', () => {
    expect(PLANS.free.monthlyPrice).toBe(0)
  })

  it('в потолках нет числа людей', () => {
    /*
     * Главное свойство модели: цена зависит от объёма данных, а не от числа
     * тех, кто с ними работает. Появись здесь такой потолок — платить придётся
     * за каждого сотрудника, и это ровно то, от чего малый бизнес уходит.
     */
    for (const plan of Object.values(PLANS)) {
      expect(Object.keys(plan.limits).sort()).toEqual([...USAGE_KINDS].sort())
      expect(Object.keys(plan.limits)).not.toContain('users')
      expect(Object.keys(plan.limits)).not.toContain('appUsers')
    }
  })

  it('следующий тариф есть у всех, кроме самого широкого', () => {
    expect(nextPlan('free')?.id).toBe('start')
    expect(nextPlan('business')?.id).toBe('scale')
    expect(nextPlan('scale')).toBe(null)
  })
})

describe('доля израсходованного', () => {
  it('считается обычным делением', () => {
    expect(usageRatio(500, 2_000)).toBe(0.25)
    expect(usageRatio(0, 2_000)).toBe(0)
  })

  it('перерасход не обрезается', () => {
    // Показать «100%» там, где израсходовано вдвое больше, значит скрыть
    // от человека размер проблемы.
    expect(usageRatio(4_000, 2_000)).toBe(2)
  })

  it('нулевой потолок не даёт бесконечности', () => {
    // Такого тарифа нет, но бесконечность в разметке — это сломанная страница.
    expect(usageRatio(10, 0)).toBe(1)
    expect(usageRatio(0, 0)).toBe(0)
  })
})

describe('пороги предупреждений', () => {
  it('70, 85 и 100 процентов', () => {
    expect(usageLevel(0, 100)).toBe('ok')
    expect(usageLevel(69, 100)).toBe('ok')
    expect(usageLevel(70, 100)).toBe('notice')
    expect(usageLevel(84, 100)).toBe('notice')
    expect(usageLevel(85, 100)).toBe('warning')
    expect(usageLevel(99, 100)).toBe('warning')
    expect(usageLevel(100, 100)).toBe('reached')
  })

  it('перерасход — это «кончилось», а не отдельное состояние', () => {
    // Человеку нужно знать, что места нет; насколько именно нет — уже деталь.
    expect(usageLevel(250, 100)).toBe('reached')
  })

  it('пороги включающие: ровно 70% — уже предупреждение', () => {
    // Граница должна срабатывать, а не «почти срабатывать».
    expect(usageLevel(1_400, 2_000)).toBe('notice')
    expect(usageLevel(1_399, 2_000)).toBe('ok')
  })
})
