import { describe, expect, it } from 'vitest'
import { NAV_GROUPS, NAV_ITEMS, activeNavId, navItemsFor, type NavItem } from './platform-nav'

/**
 * Навигация платформы.
 *
 * Список один на боковую панель, свёрнутую панель и выдвижную на телефоне,
 * поэтому ошибка здесь — это ошибка сразу во всех трёх. Проверяется главным
 * образом подсветка: она отвечает на вопрос «где я нахожусь», и неверный
 * ответ хуже отсутствия ответа.
 */

describe('состав', () => {
  it('у каждого пункта есть группа из списка групп', () => {
    const groups = new Set(NAV_GROUPS.map((group) => group.id))
    for (const item of NAV_ITEMS) {
      expect(groups.has(item.group), `${item.id}: группа ${item.group}`).toBe(true)
    }
  })

  it('адреса и опознаватели не повторяются', () => {
    // Повтор означал бы два пункта, подсвечивающихся вместе.
    expect(new Set(NAV_ITEMS.map((item) => item.id)).size).toBe(NAV_ITEMS.length)
    expect(new Set(NAV_ITEMS.map((item) => item.href)).size).toBe(NAV_ITEMS.length)
  })

  it('у каждого пункта есть иконка и хотя бы одно совпадение пути', () => {
    for (const item of NAV_ITEMS) {
      expect(item.icon, item.id).toBeTruthy()
      expect(item.match.length, item.id).toBeGreaterThan(0)
    }
  })

  it('собственный адрес пункта попадает под его же совпадения', () => {
    // Иначе на своей же странице раздел не подсвечен.
    for (const item of NAV_ITEMS) {
      expect(activeNavId(item.href), item.id).toBe(item.id)
    }
  })

  it('мёртвых разделов нет: ни тарифа, ни дорожной карты, ни настроек', () => {
    /*
     * Страниц под них ещё не существует. Пункт, ведущий в пустоту, хуже
     * отсутствующего: человек нажимает, попадает на ошибку и перестаёт
     * доверять остальному меню.
     */
    const hrefs = NAV_ITEMS.map((item) => item.href)
    expect(hrefs).not.toContain('/billing')
    expect(hrefs).not.toContain('/roadmap')
    expect(hrefs).not.toContain('/settings')
  })

  it('безопасность не в списке разделов', () => {
    // Она про учётную запись человека, а не про рабочее пространство,
    // и живёт в меню пользователя внизу панели.
    expect(NAV_ITEMS.map((item) => item.href)).not.toContain('/security')
  })
})

describe('подсветка вложенных страниц', () => {
  it('таблица подсвечивает «Данные»', () => {
    // Человек работает именно здесь — потерять подсветку тут хуже всего.
    expect(activeNavId('/t/tbl_123')).toBe('data')
    expect(activeNavId('/app')).toBe('data')
    expect(activeNavId('/import')).toBe('data')
  })

  it('конструктор приложения подсвечивает «Приложения»', () => {
    expect(activeNavId('/apps')).toBe('apps')
    expect(activeNavId('/apps/app_123')).toBe('apps')
    expect(activeNavId('/apps/app_123/settings')).toBe('apps')
  })

  it('расход и команда подсвечивают себя', () => {
    expect(activeNavId('/usage')).toBe('usage')
    expect(activeNavId('/team')).toBe('team')
  })

  it('похожие адреса не путаются', () => {
    /*
     * `/app` и `/apps` отличаются одной буквой. Сравнение по началу строки
     * без разделителя подсветило бы оба, и человек в конструкторе видел бы
     * открытыми «Данные».
     */
    expect(activeNavId('/app')).toBe('data')
    expect(activeNavId('/apps')).toBe('apps')
    expect(activeNavId('/application')).toBe(null)
  })

  it('на чужой странице не подсвечено ничего', () => {
    // Безопасность открывается из меню пользователя: подсвечивать
    // в разделах нечего, и выдумывать подсветку не надо.
    expect(activeNavId('/security')).toBe(null)
    expect(activeNavId('/login')).toBe(null)
    expect(activeNavId('/')).toBe(null)
  })

  it('из нескольких совпадений выигрывает самое длинное', () => {
    const items = [
      { ...NAV_ITEMS[0]!, id: 'outer', match: ['/app'] },
      { ...NAV_ITEMS[1]!, id: 'inner', match: ['/app/deep'] },
    ]
    expect(activeNavId('/app/deep/thing', items)).toBe('inner')
    expect(activeNavId('/app/other', items)).toBe('outer')
  })
})

describe('видимость по роли', () => {
  it('сейчас все разделы открыты всем участникам', () => {
    /*
     * Ни один раздел платформы не закрыт по роли — закрыты отдельные
     * действия внутри них. Список это лишь отражает.
     */
    for (const role of ['owner', 'editor', 'viewer']) {
      expect(navItemsFor(role).length, role).toBe(NAV_ITEMS.length)
    }
  })

  it('пункт с ролями показывается только им', () => {
    // Место под тариф, который будет только владельцу.
    const items: NavItem[] = [{ ...NAV_ITEMS[0]!, id: 'billing', roles: ['owner'] }]
    const forOwner = items.filter((item) => !item.roles || item.roles.includes('owner'))
    const forEditor = items.filter((item) => !item.roles || item.roles.includes('editor'))
    expect(forOwner.length).toBe(1)
    expect(forEditor.length).toBe(0)
  })

  it('неизвестная роль не получает ничего сверх положенного', () => {
    const items = navItemsFor('кто-то')
    expect(items.every((item) => !item.roles)).toBe(true)
  })
})
