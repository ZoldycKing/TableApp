import type { App } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import { ANONYMOUS_ID, DEVICES, resolveDemoView, type Device } from './demo-view'

/**
 * Витрина `/demo`.
 *
 * Проверяем одно главное утверждение страницы: **размер экрана ничего
 * не решает**. Роль уходит на сервер и отбирает экраны и строки, размер —
 * это ширина рамки. Если однажды размер начнёт влиять на то, чьими глазами
 * читаются данные, упадёт вот этот файл, а не доверие к продукту.
 */

const CLIENT = 'irina@vektor.ru'

const app = {
  roles: [
    { id: 'client', name: 'Клиент', isDefault: true },
    { id: 'staff', name: 'Сотрудник', isDefault: false },
    { id: 'manager', name: 'Ведущий', isDefault: false },
  ],
  rowAccessRules: [
    { tableId: 'tbl_orders', fieldId: 'fld_owner', match: 'email', appliesTo: ['guest', 'client'] },
  ],
} as unknown as App

describe('какая роль показана', () => {
  it('роль из адреса, если она есть в приложении', () => {
    expect(resolveDemoView(app, { role: 'staff' }, CLIENT).role).toBe('staff')
  })

  it('«без входа» выбирается наравне с ролями, но ролью не является', () => {
    expect(resolveDemoView(app, { role: ANONYMOUS_ID }, CLIENT).role).toBe(ANONYMOUS_ID)
    // Прежнее имя этого состояния в адресе: ссылки на него уже разошлись.
    expect(resolveDemoView(app, { role: 'guest' }, CLIENT).role).toBe(ANONYMOUS_ID)
    // И среди ролей приложения его нет.
    expect(app.roles.some((role) => role.id === ANONYMOUS_ID)).toBe(false)
  })

  it('чужой идентификатор в ссылке не открывает ничего нового', () => {
    // Подставили несуществующую роль — получили роль по умолчанию,
    // а не «всё подряд» и не пустую страницу.
    expect(resolveDemoView(app, { role: 'rol_podstavnoy' }, CLIENT).role).toBe('client')
    expect(resolveDemoView(app, { role: '' }, CLIENT).role).toBe('client')
    expect(resolveDemoView(app, {}, CLIENT).role).toBe('client')
  })

  it('без роли по умолчанию показываем «без входа»', () => {
    const noDefault = { ...app, roles: app.roles.map((item) => ({ ...item, isDefault: false })) } as App
    expect(resolveDemoView(noDefault, { role: 'kto-to' }, CLIENT).role).toBe(ANONYMOUS_ID)
  })

  it('прежнее имя параметра ещё читается', () => {
    // Ссылки на /demo?rol=staff уже разошлись, ломать их незачем.
    expect(resolveDemoView(app, { rol: 'staff' }, CLIENT).role).toBe('staff')
    // Новое имя главнее, если указаны оба.
    expect(resolveDemoView(app, { role: 'manager', rol: 'staff' }, CLIENT).role).toBe('manager')
  })
})

describe('какой размер экрана показан', () => {
  it('по умолчанию компьютер, и это не выбор человека', () => {
    const view = resolveDemoView(app, {}, CLIENT)
    expect(view.device).toBe('desktop')
    expect(view.deviceChosen).toBe(false)
  })

  it('выбранный размер сохраняется и помечается выбранным', () => {
    for (const device of DEVICES) {
      const view = resolveDemoView(app, { device }, CLIENT)
      expect(view.device).toBe(device)
      expect(view.deviceChosen).toBe(true)
    }
  })

  it('мусор в параметре не считается выбором', () => {
    // Иначе страница, открытая с телефона по кривой ссылке, показала бы
    // уменьшенный до четверти монитор и не стала бы это исправлять.
    const view = resolveDemoView(app, { device: 'planshet' }, CLIENT)
    expect(view.device).toBe('desktop')
    expect(view.deviceChosen).toBe(false)
  })
})

describe('чьими глазами читаются строки', () => {
  it('роли с правилом «только свои» нужен человек', () => {
    expect(resolveDemoView(app, { role: 'client' }, CLIENT).viewerEmail).toBe(CLIENT)
  })

  it('не вошедшему почту не подставляем: её у него нет', () => {
    expect(resolveDemoView(app, { role: ANONYMOUS_ID }, CLIENT).viewerEmail).toBe(null)
  })

  it('сотруднику подставлять почту не нужно: правило к нему не применяется', () => {
    expect(resolveDemoView(app, { role: 'staff' }, CLIENT).viewerEmail).toBe(null)
    expect(resolveDemoView(app, { role: 'manager' }, CLIENT).viewerEmail).toBe(null)
  })
})

describe('размер экрана не влияет на права', () => {
  const everyRole = ['guest', 'client', 'staff', 'manager', 'rol_podstavnoy']

  it('роль и почта не зависят от выбранного размера', () => {
    for (const role of everyRole) {
      const [first, ...rest] = DEVICES.map((device) => resolveDemoView(app, { role, device }, CLIENT))
      for (const other of rest) {
        expect(other.role, role).toBe(first!.role)
        expect(other.viewerEmail, role).toBe(first!.viewerEmail)
      }
    }
  })

  it('размер отличается — и только он', () => {
    const desktop = resolveDemoView(app, { role: 'client', device: 'desktop' }, CLIENT)
    const mobile = resolveDemoView(app, { role: 'client', device: 'mobile' }, CLIENT)

    expect({ ...desktop, device: null }).toEqual({ ...mobile, device: null })
    expect(desktop.device).not.toBe(mobile.device)
  })

  it('роль и размер меняются независимо', () => {
    const combos: { role: string; device: Device }[] = []
    for (const role of ['guest', 'client', 'staff', 'manager']) {
      for (const device of DEVICES) combos.push({ role, device })
    }

    // Каждое сочетание рабочее: восемь ответов, роль и размер в каждом свои.
    const seen = combos.map(({ role, device }) => {
      const view = resolveDemoView(app, { role, device }, CLIENT)
      return `${view.role}/${view.device}`
    })
    expect(new Set(seen).size).toBe(combos.length)
  })
})
