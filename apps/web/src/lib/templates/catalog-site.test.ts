import { describe, expect, it } from 'vitest'
import { REQUESTS, ROLE_VIEWS } from '@/components/marketing/demos'
import { TEMPLATE_DEMO_IDS } from '@/components/marketing/template-demo'
import { SOLUTIONS } from '@/lib/solutions'
import { findTemplate, TEMPLATES } from './catalog'

/**
 * Что сайт показывает про шаблоны.
 *
 * Проверки не повторяют разметку: они держат обещания, которые легко нарушить
 * при следующей правке. Новый шаблон без своего экрана снова станет страницей
 * текста; шаблон без раздела о границах пообещает то, чего не делает;
 * а роль, которой дорисовали заявку, разрушит сравнение на первом же взгляде.
 */

describe('у каждого шаблона свой показ', () => {
  it('ни один шаблон не остался без экрана', () => {
    const covered = new Set<string>(TEMPLATE_DEMO_IDS)
    for (const template of TEMPLATES) {
      expect(covered.has(template.id), template.id).toBe(true)
    }
  })

  it('показов не больше, чем шаблонов', () => {
    for (const id of TEMPLATE_DEMO_IDS) expect(findTemplate(id), id).toBeDefined()
  })
})

describe('границы названы у каждого шаблона', () => {
  it('либо у самого шаблона, либо у его решения', () => {
    /*
     * Календарь в «Салоне» не означает онлайн-запись, а список в «Доставке» —
     * маршруты и карту. Об этом человек должен прочитать до установки.
     */
    for (const template of TEMPLATES) {
      const solution = SOLUTIONS.find((item) => item.templateId === template.id)
      const limits = template.limits ?? solution?.limits ?? []
      expect(limits.length, template.id).toBeGreaterThan(0)
    }
  })
})

describe('родство шаблонов', () => {
  it('ведёт на существующие шаблоны и не на себя', () => {
    for (const template of TEMPLATES) {
      for (const id of template.kin ?? []) {
        expect(id, template.id).not.toBe(template.id)
        expect(findTemplate(id), `${template.id} → ${id}`).toBeDefined()
      }
    }
  })

  it('у каждого шаблона есть хотя бы один сосед по делу', () => {
    // Иначе внизу страницы окажется одна и та же тройка «первых из каталога».
    for (const template of TEMPLATES) {
      const solution = SOLUTIONS.find((item) => item.templateId === template.id)
      const hasKin = (template.kin ?? []).length > 0 || Boolean(solution)
      expect(hasKin, template.id).toBe(true)
    }
  })
})

describe('примеры на странице возможностей — один набор', () => {
  it('роли показывают только те заявки, что есть в таблице', () => {
    /*
     * Так было не всегда: у мастера стояла заявка 1048, которой в таблице
     * выше не существовало, — и обещание «одни и те же строки» рушилось.
     */
    const known = new Set(REQUESTS.map((item) => `Заявка ${item.id}`))
    for (const role of ROLE_VIEWS) {
      for (const row of role.rows) {
        expect(known.has(row.title), `${role.name}: ${row.title}`).toBe(true)
      }
    }
  })

  it('владельцу видно всё, остальным — часть', () => {
    const owner = ROLE_VIEWS.find((role) => role.id === 'owner')!
    expect(owner.rows).toHaveLength(REQUESTS.length)

    for (const role of ROLE_VIEWS) {
      if (role.id === 'owner') continue
      expect(role.rows.length, role.name).toBeLessThan(REQUESTS.length)
      expect(role.rows.length, role.name).toBeGreaterThan(0)
    }
  })

  it('в примерах есть валюта и единицы', () => {
    // «18 500» без рубля и «2» без штук — это не число, а загадка.
    for (const item of REQUESTS) expect(item.sum).toMatch(/₽$/)
  })
})
