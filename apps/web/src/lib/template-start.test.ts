import { describe, expect, it } from 'vitest'
import { safeNext } from './safe-next'
import { isCurrent, templateStart } from './site'
import { TEMPLATES } from './templates/catalog'

/**
 * Выбранный шаблон и текущий раздел.
 *
 * Две вещи, которые ломаются молча. Потерянный выбор шаблона человек
 * обнаруживает уже после входа — и ищет его заново в списке из одиннадцати.
 * Потерянная отметка «вы здесь» не видна вообще никому, кроме тех,
 * кто ходит по сайту голосом.
 */

describe('выбор шаблона переживает вход', () => {
  it('вошедшего ведём прямо на витрину с этим шаблоном', () => {
    expect(templateStart('proizvodstvo', true)).toBe('/templates?take=proizvodstvo')
  })

  it('не вошедшего — через вход, с адресом возврата', () => {
    expect(templateStart('portal', false)).toBe('/login?next=%2Ftemplates%3Ftake%3Dportal')
  })

  it('адрес возврата проходит проверку на увод с сайта', () => {
    /*
     * `safeNext` — единственная защита от открытого редиректа, и наш адрес
     * обязан через неё проходить: иначе после входа человек окажется
     * не там, куда шёл.
     */
    for (const template of TEMPLATES) {
      const href = templateStart(template.id, false)
      const next = new URL(href, 'https://tableapp.ru').searchParams.get('next')
      expect(safeNext(next), template.id).toBe(`/templates?take=${template.id}`)
    }
  })

  it('чужой сайт в адресе возврата не проходит', () => {
    expect(safeNext('https://evil.example/templates')).toBe(null)
    expect(safeNext('//evil.example')).toBe(null)
  })
})

describe('отметка «вы здесь»', () => {
  it('раздел подсвечен и на своей странице, и на вложенной', () => {
    expect(isCurrent('/templates', '/templates')).toBe(true)
    expect(isCurrent('/templates/proizvodstvo', '/templates')).toBe(true)
    expect(isCurrent('/solutions/production', '/solutions/production')).toBe(true)
  })

  it('соседний раздел не подсвечивается', () => {
    // «/templates» не должен подсвечиваться на «/templates-2» — если такой
    // адрес когда-нибудь появится.
    expect(isCurrent('/templates-2', '/templates')).toBe(false)
    expect(isCurrent('/solutions', '/solutions/production')).toBe(false)
  })

  it('главная — только сама главная', () => {
    expect(isCurrent('/', '/')).toBe(true)
    expect(isCurrent('/pricing', '/')).toBe(false)
  })
})
