import type { App, Field } from '@tableapp/schema'
import { appSchema } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import { ANONYMOUS, asRole } from './app-roles'
import {
  checkPending,
  draftFromAnonymous,
  newPendingToken,
  PENDING_TTL_MS,
  pendingExpiry,
  revalidatePending,
  verifiedIntakeEnabled,
  type PendingRecord,
} from './pending-submission'

/**
 * Основание для приёма заявок с подтверждением почты.
 *
 * Путь ещё не включён, но проверяется уже сейчас: его смысл не в удобстве,
 * а в том, что запись появляется от проверенного человека и по действующим
 * правилам. Ошибка здесь — это чужая заявка в кабинете и запись в обход прав.
 */

const field = (id: string, name: string, type = 'text'): Field =>
  ({ id, tableId: 'tbl_orders', name, type, position: id, options: {} }) as unknown as Field

const fields: Field[] = [
  field('fld_what', 'Что нужно'),
  field('fld_email', 'Почта', 'email'),
  field('fld_status', 'Статус'),
]

const formField = (id: string, fieldId: string) => ({
  id,
  position: id,
  visibleWhen: null,
  roles: null,
  type: 'form_field',
  fieldId,
  label: null,
  required: false,
  placeholder: null,
})

function app(partial: Record<string, unknown> = {}): App {
  return appSchema.parse({
    id: 'app_1',
    workspaceId: 'wsp_1',
    name: 'Заявки',
    slug: 'zayavki',
    theme: {},
    screens: [
      {
        id: 'scr_intake',
        appId: 'app_1',
        name: 'Оставить заявку',
        position: 'a',
        tab: null,
        type: 'form',
        tableId: 'tbl_orders',
        mode: 'create',
        access: { public: true, publicFields: [], roles: ['client'] },
        components: [formField('cmp_what', 'fld_what'), formField('cmp_email', 'fld_email')],
      },
    ],
    ...partial,
  })
}

const pending = (partial: Partial<PendingRecord> = {}): PendingRecord => ({
  id: 'tok',
  appId: 'app_1',
  screenId: 'scr_intake',
  tableId: 'tbl_orders',
  values: { fld_what: 'Починить ноутбук', fld_email: 'kto@example.ru' },
  email: 'kto@example.ru',
  expiresAt: new Date(Date.now() + PENDING_TTL_MS),
  usedAt: null,
  ...partial,
})

describe('ключ отложенной заявки', () => {
  it('случайный, длинный и каждый раз новый', () => {
    const first = newPendingToken()
    const second = newPendingToken()

    expect(first).not.toBe(second)
    expect(first.length).toBeGreaterThanOrEqual(40)
    // Не порядковый номер и не идентификатор строки: угадать нельзя.
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('срок годности считается от текущего времени', () => {
    const now = new Date('2026-09-25T10:00:00Z')
    expect(pendingExpiry(now).getTime() - now.getTime()).toBe(PENDING_TTL_MS)
  })
})

describe('годность заявки', () => {
  it('неизвестный ключ не принимается', () => {
    expect(checkPending(null)).toEqual({ ok: false, reason: 'not_found' })
  })

  it('просроченная не принимается', () => {
    const stale = pending({ expiresAt: new Date(Date.now() - 1000) })
    expect(checkPending(stale)).toEqual({ ok: false, reason: 'expired' })
  })

  it('использованная не принимается повторно', () => {
    // Иначе по одной ссылке из письма можно создать сколько угодно записей.
    const used = pending({ usedAt: new Date() })
    expect(checkPending(used)).toEqual({ ok: false, reason: 'already_used' })
  })

  it('свежая и неиспользованная проходит', () => {
    expect(checkPending(pending()).ok).toBe(true)
  })

  it('срок и одноразовость проверяются раньше прав', () => {
    // Просроченный ключ не должен доходить до проверки прав: по разнице
    // в ответе иначе видно, что происходит с приложением.
    const both = pending({ usedAt: new Date(), expiresAt: new Date(Date.now() - 1000) })
    expect(checkPending(both)).toEqual({ ok: false, reason: 'already_used' })
  })
})

describe('пересчёт прав после подтверждения почты', () => {
  const client = asRole('client', 'kto@example.ru')

  it('подтверждённый человек получает свои поля', () => {
    const result = revalidatePending(app(), pending(), fields, client)
    expect(result).toEqual({
      ok: true,
      values: { fld_what: 'Починить ноутбук', fld_email: 'kto@example.ru' },
    })
  })

  it('роль из браузера не участвует: считаем по контексту после входа', () => {
    /*
     * В отложенной заявке роли не хранится вовсе. Здесь это видно прямо:
     * одни и те же сохранённые значения дают разный результат в зависимости
     * от того, кем человек оказался после подтверждения почты.
     */
    const stored = pending()
    expect('roleId' in stored).toBe(false)
    expect(revalidatePending(app(), stored, fields, client).ok).toBe(true)
    // Не вошедший завершить заявку не может — в этом весь смысл подтверждения.
    expect(revalidatePending(app(), stored, fields, ANONYMOUS)).toEqual({
      ok: false,
      reason: 'not_allowed',
    })
  })

  it('поле, удалённое владельцем за это время, не записывается', () => {
    // T0: человек заполнил «Что нужно» и почту.
    // T1: владелец убрал поле из формы.
    // T2: человек подтвердил почту — старое разрешение не действует.
    const changed = app({
      screens: [
        {
          ...app().screens[0]!,
          components: [formField('cmp_email', 'fld_email')],
        },
      ],
    })

    expect(revalidatePending(changed, pending(), fields, client)).toEqual({
      ok: true,
      values: { fld_email: 'kto@example.ru' },
    })
  })

  it('форма, закрытая за это время, заявку не пропускает', () => {
    const closed = app({
      screens: [
        {
          ...app().screens[0]!,
          access: { public: false, publicFields: [], roles: ['staff'] },
        },
      ],
    })

    expect(revalidatePending(closed, pending(), fields, client)).toEqual({
      ok: false,
      reason: 'not_allowed',
    })
  })

  it('удалённый экран заявку не пропускает', () => {
    expect(revalidatePending(app({ screens: [] }), pending(), fields, client)).toEqual({
      ok: false,
      reason: 'screen_gone',
    })
  })

  it('подменённая таблица не проходит', () => {
    // Идентификатор таблицы в отложенной заявке сверяется с экраном,
    // а не принимается на веру.
    const swapped = pending({ tableId: 'tbl_zarplaty' })
    expect(revalidatePending(app(), swapped, fields, client)).toEqual({
      ok: false,
      reason: 'screen_gone',
    })
  })

  it('поле не из формы отбрасывается, даже если его прислали', () => {
    const sneaky = pending({
      values: { fld_what: 'Починить', fld_status: 'Решено' },
    })
    expect(revalidatePending(app(), sneaky, fields, client)).toEqual({
      ok: true,
      values: { fld_what: 'Починить' },
    })
  })

  it('удалённое поле среди значений ничего не ломает', () => {
    const stale = pending({ values: { fld_what: 'Починить', fld_udalili: 'что-то' } })
    expect(revalidatePending(app(), stale, fields, client)).toEqual({
      ok: true,
      values: { fld_what: 'Починить' },
    })
  })

  it('если записывать нечего, заявка не создаётся', () => {
    const empty = pending({ values: { fld_status: 'Решено' } })
    expect(revalidatePending(app(), empty, fields, client)).toEqual({
      ok: false,
      reason: 'nothing_to_write',
    })
  })
})

describe('включение', () => {
  it('без подключённой рассылки путь выключен', () => {
    // Требовать код у постороннего человека, не умея отправить письмо,
    // значит закрыть приём заявок совсем.
    const was = process.env.SMTP_URL
    delete process.env.SMTP_URL
    expect(verifiedIntakeEnabled()).toBe(false)

    process.env.SMTP_URL = 'smtp://localhost'
    expect(verifiedIntakeEnabled()).toBe(true)

    if (was === undefined) delete process.env.SMTP_URL
    else process.env.SMTP_URL = was
  })
})

describe('что берём на хранение от постороннего', () => {
  it('поля формы проходят', () => {
    const result = draftFromAnonymous(app(), app().screens[0]!, {
      fld_what: 'Починить ноутбук',
      fld_email: 'kto@example.ru',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.values).sort()).toEqual(['fld_email', 'fld_what'])
  })

  it('поле не из формы отбрасывается сразу, а не при подтверждении', () => {
    // Статус на форме не предлагают. Хранить его сорок пять минут, чтобы потом
    // выбросить, значит позволить постороннему решать, что лежит у нас в базе.
    const result = draftFromAnonymous(app(), app().screens[0]!, {
      fld_what: 'Починить ноутбук',
      fld_status: 'Выполнено',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.values).toEqual({ fld_what: 'Починить ноутбук' })
  })

  it('закрытая для посторонних форма заявку не принимает', () => {
    const closed = app({
      screens: [
        {
          ...app().screens[0],
          access: { public: false, publicFields: [], roles: ['client'] },
        },
      ],
    })
    const result = draftFromAnonymous(closed, closed.screens[0]!, { fld_what: 'Что-то' })
    expect(result).toEqual({ ok: false, reason: 'not_allowed' })
  })

  it('если после отсева не осталось ничего — заявки нет', () => {
    const result = draftFromAnonymous(app(), app().screens[0]!, { fld_status: 'Выполнено' })
    expect(result).toEqual({ ok: false, reason: 'nothing_to_write' })
  })

  it('объём ограничен: заявку присылает тот, кого мы не знаем', () => {
    const result = draftFromAnonymous(
      app(),
      app().screens[0]!,
      { fld_what: 'я'.repeat(200) },
      100,
    )
    expect(result).toEqual({ ok: false, reason: 'too_large' })
  })

  it('потолок по умолчанию обычной заявке не мешает', () => {
    const result = draftFromAnonymous(app(), app().screens[0]!, {
      fld_what: 'Починить ноутбук, экран мигает после падения',
    })
    expect(result.ok).toBe(true)
  })

  it('экран не той формы не принимается', () => {
    const detail = appSchema.parse({
      id: 'app_1',
      workspaceId: 'wsp_1',
      name: 'Заявки',
      slug: 'zayavki',
      theme: {},
      screens: [
        {
          id: 'scr_list',
          appId: 'app_1',
          name: 'Заявки',
          position: 'a',
          tab: null,
          type: 'list',
          tableId: 'tbl_orders',
          access: { public: true, publicFields: [], roles: [] },
          source: { viewId: 'viw_1', searchFieldIds: [] },
          components: [],
        },
      ],
    })
    const result = draftFromAnonymous(detail, detail.screens[0]!, { fld_what: 'Что-то' })
    expect(result).toEqual({ ok: false, reason: 'screen_gone' })
  })
})
