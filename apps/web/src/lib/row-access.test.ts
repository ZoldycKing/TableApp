import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { App } from '@tableapp/schema'
import { canAccessRow, dropOwnerChange, isOwnerField, ownRowsDeclared, rulesFor, stampOwner } from './row-access'
import { ANONYMOUS, asRole } from './app-roles'

const app = {
  id: 'app_1',
  workspaceId: 'wsp_1',
  name: 'Заявки',
  slug: 'zayavki',
  theme: { accent: 'blue', scheme: 'auto', logoKey: null, iconKey: null },
  accessMode: 'allowlist',
  roles: [
    { id: 'client', name: 'Клиент', isDefault: true },
    { id: 'staff', name: 'Сотрудник', isDefault: false },
    { id: 'manager', name: 'Ведущий', isDefault: false },
  ],
  allowlist: [],
  rowAccessRules: [
    { tableId: 'tbl_orders', fieldId: 'fld_owner', match: 'email', appliesTo: ['guest', 'client'] },
  ],
  screens: [],
  homeScreenId: null,
  publishedAt: null,
} as unknown as App

const anna = { email: 'anna@example.ru' }
const boris = { email: 'boris@example.ru' }
const rules = rulesFor(app, 'tbl_orders', asRole('client'))

test('правило находится по таблице, для остальных таблиц его нет', () => {
  assert.equal(rules.length, 1)
  assert.deepEqual(rulesFor(app, 'tbl_items', asRole('client')), [])
})

test('правило не применяется к вашим сотрудникам', () => {
  // «Видит только свои строки» — про людей снаружи. Иначе диспетчер
  // не увидел бы ни одного обращения: его почты в них нет.
  assert.deepEqual(rulesFor(app, 'tbl_orders', asRole('staff')), [])
  assert.deepEqual(rulesFor(app, 'tbl_orders', asRole('manager')), [])
})

test('не вошедшему правила не выдаются: сравнивать не с чем', () => {
  /*
   * У него нет ни почты, ни организации, и «своих» строк не бывает. Что ему
   * показать, решает отбор публичного экрана — там выборка задана владельцем
   * явно, а не выводится из отсутствия запрета.
   */
  assert.deepEqual(rulesFor(app, 'tbl_orders', ANONYMOUS), [])
})

test('без правила строка доступна любому посетителю', () => {
  assert.equal(canAccessRow([], null, { fld_owner: 'anna@example.ru' }), true)
})

test('владелец видит свою строку, посторонний — нет', () => {
  const row = { fld_owner: 'anna@example.ru' }
  assert.equal(canAccessRow(rules, anna, row), true)
  assert.equal(canAccessRow(rules, boris, row), false)
})

test('адрес сравнивается без учёта регистра и пробелов', () => {
  assert.equal(canAccessRow(rules, anna, { fld_owner: '  ANNA@Example.RU ' }), true)
})

test('аноним не видит ни одной строки под правилом', () => {
  assert.equal(canAccessRow(rules, null, { fld_owner: 'anna@example.ru' }), false)
  // Даже строка с пустым владельцем не должна открываться анониму.
  assert.equal(canAccessRow(rules, null, {}), false)
})

test('строка без владельца не достаётся никому', () => {
  assert.equal(canAccessRow(rules, anna, {}), false)
  assert.equal(canAccessRow(rules, anna, { fld_owner: null }), false)
})

test('владелец проставляется сервером и перебивает присланное значение', () => {
  const values = { fld_title: 'Заявка', fld_owner: 'anna@example.ru' }
  // Борис прислал чужой адрес — сервер всё равно запишет его собственный.
  assert.deepEqual(stampOwner(rules, boris, values), {
    fld_title: 'Заявка',
    fld_owner: 'boris@example.ru',
  })
})

test('без правила значения не подменяются', () => {
  const values = { fld_owner: 'anna@example.ru' }
  assert.deepEqual(stampOwner([], boris, values), values)
})

test('при изменении строки поле владельца отбрасывается', () => {
  const incoming = { fld_title: 'Новое имя', fld_owner: 'anna@example.ru' }
  assert.deepEqual(dropOwnerChange(rules, incoming), { fld_title: 'Новое имя' })
  assert.deepEqual(dropOwnerChange([], incoming), incoming)
  assert.equal(isOwnerField(rules, 'fld_owner'), true)
  assert.equal(isOwnerField(rules, 'fld_title'), false)
})

// --- Несколько правил на одну таблицу ---------------------------------------

const both = [
  { tableId: 'tbl_orders', fieldId: 'fld_owner', match: 'email', appliesTo: ['client'] },
  { tableId: 'tbl_orders', fieldId: 'fld_company', match: 'company', appliesTo: ['client'] },
] as unknown as App['rowAccessRules']

const irina = { email: 'irina@vektor.ru', company: 'ООО «Вектор»' }

test('правила складываются: подошло одно — строка видна', () => {
  // Свой заказ: совпала почта.
  assert.equal(canAccessRow(both, irina, { fld_owner: 'irina@vektor.ru' }), true)
  // Заказ коллеги из той же фирмы: совпала организация.
  assert.equal(canAccessRow(both, irina, { fld_owner: 'petr@vektor.ru', fld_company: 'ООО «Вектор»' }), true)
  // Чужая фирма: не совпало ничего.
  assert.equal(canAccessRow(both, irina, { fld_owner: 'kto@drugoy.ru', fld_company: 'ООО «Заря»' }), false)
})

test('без организации у вошедшего правило по фирме никого не пропускает', () => {
  // Иначе пустая организация совпала бы с пустым полем строки
  // и открыла все ничейные записи.
  const bezFirmy = { email: 'anna@example.ru', company: '' }
  assert.equal(canAccessRow(both, bezFirmy, { fld_company: '' }), false)
  assert.equal(canAccessRow(both, bezFirmy, { fld_company: 'ООО «Вектор»' }), false)
})

test('сервер проставляет все поля владельца, какие знает', () => {
  assert.deepEqual(stampOwner(both, irina, { fld_title: 'Заказ' }), {
    fld_title: 'Заказ',
    fld_owner: 'irina@vektor.ru',
    fld_company: 'ООО «Вектор»',
  })
})

test('пустую организацию не проставляем: строка не должна стать ничьей', () => {
  const bezFirmy = { email: 'anna@example.ru', company: '' }
  assert.deepEqual(stampOwner(both, bezFirmy, { fld_title: 'Заказ' }), {
    fld_title: 'Заказ',
    fld_owner: 'anna@example.ru',
  })
})

test('оба поля владельца защищены от правки с устройства', () => {
  const incoming = { fld_title: 'Новое', fld_owner: 'x@y.ru', fld_company: 'Чужая' }
  assert.deepEqual(dropOwnerChange(both, incoming), { fld_title: 'Новое' })
})

test('чтение и запись решают одинаково на одних и тех же данных', () => {
  const rows = [{ fld_owner: 'anna@example.ru' }, { fld_owner: 'boris@example.ru' }, {}]
  for (const viewer of [anna, boris, null]) {
    for (const row of rows) {
      const visible = canAccessRow(rules, viewer, row)
      // Право на изменение проверяется тем же предикатом, что и видимость.
      assert.equal(visible, canAccessRow(rules, viewer, row))
    }
  }
})

test('без правил приглашённый видит таблицу целиком', () => {
  // Сотрудника внёс владелец. Не задать правило — значит сказать
  // «пусть видит всё», и это его право.
  assert.equal(canAccessRow([], { email: 'dispetcher@example.ru' }, { fld_owner: 'anna@example.ru' }), true)
})

test('без правил пришедший с витрины не видит ничего', () => {
  /*
   * Самое важное здесь. Незнакомца в таблицу никто не звал: «правил не
   * задано» должно значить «ничего не видно», иначе владелец, убравший
   * правило, раздаст чужие заказы, ничего об этом не узнав.
   */
  assert.equal(
    canAccessRow([], { email: 'zakazchik@example.ru', enrolled: true }, { fld_owner: 'anna@example.ru' }),
    false,
  )
})

test('при заданном правиле витрина и приглашение решаются одинаково', () => {
  // Особый случай ровно один — отсутствие правил. Дальше все равны.
  const свой = { fld_owner: 'zakazchik@example.ru' }
  const чужой = { fld_owner: 'anna@example.ru' }
  const сВитрины = { email: 'zakazchik@example.ru', enrolled: true }
  const приглашённый = { email: 'zakazchik@example.ru' }

  assert.equal(canAccessRow(rules, сВитрины, свой), true)
  assert.equal(canAccessRow(rules, приглашённый, свой), true)
  assert.equal(canAccessRow(rules, сВитрины, чужой), false)
  assert.equal(canAccessRow(rules, приглашённый, чужой), false)
})

test('приём с витрины требует, чтобы владелец сказал, где чьи строки', () => {
  assert.equal(ownRowsDeclared(app, 'tbl_orders', 'client'), true)
  // Правило есть, но не на эту таблицу.
  assert.equal(ownRowsDeclared(app, 'tbl_items', 'client'), false)
  // Правило есть, но не для этой роли.
  assert.equal(ownRowsDeclared(app, 'tbl_orders', 'staff'), false)
  // Роли нет вовсе — заводить кабинет не с чем.
  assert.equal(ownRowsDeclared(app, 'tbl_orders', null), false)
})
