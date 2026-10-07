import type { App, Field, RoleId, Screen } from '@tableapp/schema'
import { appSchema } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import {
  canEnter,
  canOpenScreen,
  maySendAppCode,
  rowReach,
  defaultRole,
  homeScreenFor,
  permits,
  visitorFor,
  roleName,
  rolesForRowRules,
  fieldPolicy,
  formFields,
  onlyReadable,
  readableFields,
  screensFor,
  showsRows,
  visibleScreensFor,
  writableFields,
  asRole,
  ANONYMOUS,
} from './app-roles'

/**
 * Права проверяются на выдуманном приложении, собранном через схему: так
 * умолчания в тесте те же самые, что в продукте, и «забыли поле» не проходит.
 */

function screen(partial: Record<string, unknown>): Record<string, unknown> {
  return { id: 'scr_x', appId: 'app_1', name: 'Экран', position: 'a', tab: null, ...partial }
}

/** У сводки компонентов нет, поэтому читаем их через проверку типа. */
function componentIds(screen: Screen): string[] {
  return screen.type === 'dashboard' ? [] : screen.components.map((item) => item.id)
}

function app(partial: Record<string, unknown> = {}): App {
  return appSchema.parse({
    id: 'app_1',
    workspaceId: 'wsp_1',
    name: 'Заявки',
    slug: 'zayavki',
    theme: {},
    screens: [],
    ...partial,
  })
}

const listScreen = screen({
  id: 'scr_list',
  type: 'list',
  source: { viewId: 'viw_1' },
  tab: { icon: 'list', label: 'Заявки' },
})
const detailScreen = screen({ id: 'scr_detail', type: 'detail', tableId: 'tbl_1' })
/*
 * У формы есть поле: право писать — это право написать хоть что-то.
 * Пустая форма, открытая роли, редактором её не делает.
 */
const formField = (id: string, fieldId: string, roles: string[] | null = null) => ({
  id,
  position: 'a',
  visibleWhen: null,
  roles,
  type: 'form_field',
  fieldId,
  label: null,
  required: false,
  placeholder: null,
})

const createScreen = screen({
  id: 'scr_new',
  type: 'form',
  tableId: 'tbl_1',
  mode: 'create',
  components: [formField('cmp_new_what', 'fld_what')],
})
const editScreen = screen({
  id: 'scr_edit',
  type: 'form',
  tableId: 'tbl_1',
  mode: 'edit',
  components: [formField('cmp_edit_what', 'fld_what'), formField('cmp_edit_status', 'fld_status')],
})

describe('кто есть кто', () => {
  it('не вошёл — роли нет вовсе', () => {
    expect(visitorFor(app(), null).roleId).toBe(null)
  })

  it('роль берётся из списка доступа', () => {
    const subject = app({
      accessMode: 'allowlist',
      allowlist: [{ email: 'Master@Firma.ru', role: 'staff' }, { email: 'sef@firma.ru', role: 'manager' }],
    })
    expect(visitorFor(subject, 'master@firma.ru').roleId).toBe('staff')
    expect(visitorFor(subject, 'sef@firma.ru').roleId).toBe('manager')
  })

  it('в открытом приложении любой вошедший — клиент', () => {
    // Иначе приём заявок невозможен: адреса клиентов заранее не известны.
    expect(visitorFor(app({ accessMode: 'public' }), 'kto-to@pochta.ru').roleId).toBe('client')
  })

  it('в закрытом приложении неизвестный адрес роли не получает', () => {
    const subject = app({ accessMode: 'allowlist', allowlist: [{ email: 'svoy@firma.ru', role: 'staff' }] })
    expect(visitorFor(subject, 'chuzhoy@pochta.ru').roleId).toBe(null)
  })

  it('старый список из одних адресов читается как сотрудники', () => {
    const subject = app({ accessMode: 'allowlist', allowlist: ['master@firma.ru'] })
    expect(visitorFor(subject, 'master@firma.ru').roleId).toBe('staff')
  })
})

describe('что видно', () => {
  it('новый экран закрыт для гостя', () => {
    const subject = app({ screens: [listScreen] })
    expect(canOpenScreen(subject.screens[0]!, ANONYMOUS)).toBe(false)
    expect(canOpenScreen(subject.screens[0]!, asRole('client'))).toBe(true)
  })

  it('гостю видно только то, что ему открыли', () => {
    const subject = app({
      screens: [
        { ...listScreen, access: { roles: ['staff', 'manager'] } },
        { ...createScreen, access: { roles: ['guest', 'client'] } },
      ],
    })
    expect(screensFor(subject, ANONYMOUS).map((item: Screen) => item.id)).toEqual(['scr_new'])
    expect(screensFor(subject, asRole('manager')).map((item: Screen) => item.id)).toEqual(['scr_list'])
  })

  it('стартовый экран подбирается по роли', () => {
    const subject = app({
      homeScreenId: 'scr_list',
      screens: [
        { ...listScreen, access: { roles: ['staff'] } },
        { ...createScreen, access: { roles: ['guest'] } },
      ],
    })
    expect(homeScreenFor(subject, asRole('staff'))?.id).toBe('scr_list')
    // Гостю нельзя показать пустоту только потому, что домашним назначен чужой экран.
    expect(homeScreenFor(subject, ANONYMOUS)?.id).toBe('scr_new')
  })

  it('роль без единого экрана в приложение не попадает', () => {
    const subject = app({ screens: [{ ...listScreen, access: { roles: ['staff'] } }] })
    expect(canEnter(subject, ANONYMOUS)).toBe(false)
    expect(canEnter(subject, asRole('staff'))).toBe(true)
  })
})

describe('что можно делать', () => {
  const full = app({
    screens: [
      { ...listScreen, access: { roles: ['guest', 'client', 'staff', 'manager'] } },
      { ...detailScreen, access: { roles: ['client', 'staff', 'manager'], allowDelete: false } },
      { ...createScreen, access: { roles: ['guest', 'client'] } },
      { ...editScreen, access: { roles: ['staff', 'manager'] } },
    ],
  })

  it('не вошедший не пишет ничего, даже в открытую ему форму', () => {
    // Заказ с витрины идёт не через это право: посторонний сначала
    // подтверждает почту и пишет строку уже как известный человек.
    expect(permits(full, 'tbl_1', 'create', ANONYMOUS)).toBe(false)
    expect(permits(full, 'tbl_1', 'update', ANONYMOUS)).toBe(false)
    expect(permits(full, 'tbl_1', 'delete', ANONYMOUS)).toBe(false)
  })

  it('клиент создаёт и смотрит, но не правит', () => {
    expect(permits(full, 'tbl_1', 'create', asRole('client'))).toBe(true)
    expect(permits(full, 'tbl_1', 'update', asRole('client'))).toBe(false)
  })

  it('сотрудник правит, но удалять ему не разрешили', () => {
    expect(permits(full, 'tbl_1', 'update', asRole('staff'))).toBe(true)
    expect(permits(full, 'tbl_1', 'delete', asRole('staff'))).toBe(false)
  })

  it('удаление появляется только с явного разрешения на карточке', () => {
    const subject = app({
      screens: [{ ...detailScreen, access: { roles: ['manager'], allowDelete: true } }],
    })
    expect(permits(subject, 'tbl_1', 'delete', asRole('manager'))).toBe(true)
    expect(permits(subject, 'tbl_1', 'delete', asRole('staff'))).toBe(false)
  })

  it('до чужой таблицы не дотянуться подменой идентификатора', () => {
    expect(permits(full, 'tbl_chuzhaya', 'create', asRole('manager'))).toBe(false)
    expect(permits(full, 'tbl_chuzhaya', 'update', asRole('manager'))).toBe(false)
  })

  it('приложение только для чтения не пишется никем', () => {
    const readOnly = app({
      screens: [
        { ...listScreen, access: { roles: ['guest', 'client', 'staff', 'manager'] } },
        { ...detailScreen, access: { roles: ['guest', 'client', 'staff', 'manager'] } },
      ],
    })
    for (const visitor of [ANONYMOUS, ...['client', 'staff', 'manager'].map((id) => asRole(id))]) {
      const who = visitor.roleId ?? 'без входа'
      expect(permits(readOnly, 'tbl_1', 'create', visitor), who).toBe(false)
      expect(permits(readOnly, 'tbl_1', 'update', visitor), who).toBe(false)
      expect(permits(readOnly, 'tbl_1', 'delete', visitor), who).toBe(false)
    }
  })
})

describe('в приложение не уезжает то, чем нельзя воспользоваться', () => {
  const withButtons = app({
    screens: [
      {
        ...listScreen,
        access: { roles: ['guest', 'client'] },
        onTapScreenId: 'scr_detail',
      },
      {
        ...detailScreen,
        access: { roles: ['client'], allowDelete: false },
        components: [
          {
            id: 'cmp_edit', position: 'a', visibleWhen: null, type: 'button',
            label: 'Изменить', style: 'secondary',
            action: { id: 'act_1', type: 'open_screen', screenId: 'scr_edit' },
          },
          {
            id: 'cmp_del', position: 'b', visibleWhen: null, type: 'button',
            label: 'Удалить', style: 'danger',
            action: { id: 'act_2', type: 'delete_row', confirm: true },
          },
        ],
      },
      { ...editScreen, access: { roles: ['staff'] } },
    ],
  })

  it('кнопка на закрытый экран не приходит', () => {
    const forClient = visibleScreensFor(withButtons, asRole('client'))
    const detail = forClient.find((screen) => screen.id === 'scr_detail')!
    expect(componentIds(detail)).not.toContain('cmp_edit')
  })

  it('кнопка удаления не приходит, пока удаление не разрешили', () => {
    const detail = visibleScreensFor(withButtons, asRole('client')).find((s) => s.id === 'scr_detail')!
    expect(componentIds(detail)).not.toContain('cmp_del')
  })

  it('переход на карточку гасится, если карточка закрыта', () => {
    const list = visibleScreensFor(withButtons, ANONYMOUS).find((s) => s.id === 'scr_list')!
    // Гостю карточка не открыта — нажатие по строке никуда не ведёт.
    expect(list.type === 'list' && list.onTapScreenId).toBeNull()
  })

  it('доступный переход остаётся', () => {
    const list = visibleScreensFor(withButtons, asRole('client')).find((s) => s.id === 'scr_list')!
    expect(list.type === 'list' && list.onTapScreenId).toBe('scr_detail')
  })
})

describe('роли задаёт владелец, а не мы', () => {
  const doctor = { id: 'rol_doctor', name: 'Врач', isDefault: false }
  const patient = { id: 'rol_patient', name: 'Пациент', isDefault: true }

  const clinic = app({
    accessMode: 'public',
    roles: [doctor, patient],
    allowlist: [{ email: 'vrach@klinika.ru', roleId: 'rol_doctor' }],
    screens: [
      { ...listScreen, id: 'scr_priem', access: { roles: ['rol_doctor'] } },
      { ...createScreen, id: 'scr_zapis', access: { roles: ['guest', 'rol_patient'] } },
    ],
  })

  it('придуманная владельцем роль работает как любая другая', () => {
    expect(visitorFor(clinic, 'vrach@klinika.ru').roleId).toBe('rol_doctor')
    expect(screensFor(clinic, asRole('rol_doctor')).map((item) => item.id)).toEqual(['scr_priem'])
    expect(permits(clinic, 'tbl_1', 'create', asRole('rol_doctor'))).toBe(false)
    expect(permits(clinic, 'tbl_1', 'create', asRole('rol_patient'))).toBe(true)
  })

  it('вошедший без записи в списке получает основную роль', () => {
    // Иначе пришлось бы вписывать руками каждого пациента.
    expect(visitorFor(clinic, 'kto-to@pochta.ru').roleId).toBe('rol_patient')
  })

  it('без основной роли вошедший остаётся гостем', () => {
    const strict = app({
      accessMode: 'public',
      roles: [doctor],
      screens: [{ ...listScreen, access: { roles: ['rol_doctor'] } }],
    })
    expect(visitorFor(strict, 'kto-to@pochta.ru').roleId).toBe(null)
  })

  it('удалённая роль не даёт прав и не выкидывает человека', () => {
    // Роль убрали, а запись в списке осталась: человек получает основную,
    // а не права исчезнувшей роли.
    const after = app({
      accessMode: 'public',
      roles: [patient],
      allowlist: [{ email: 'vrach@klinika.ru', roleId: 'rol_doctor' }],
      screens: [{ ...listScreen, access: { roles: ['rol_doctor'] } }],
    })
    expect(visitorFor(after, 'vrach@klinika.ru').roleId).toBe('rol_patient')
    expect(screensFor(after, asRole('rol_patient'))).toHaveLength(0)
  })

  it('роль по умолчанию одна и её видно', () => {
    expect(defaultRole(clinic)).toBe('rol_patient')
    expect(defaultRole(app({ roles: [doctor] }))).toBeNull()
  })

  it('названия ролей берутся из приложения, «без входа» названо отдельно', () => {
    expect(roleName(clinic, 'rol_doctor')).toBe('Врач')
    // Роли у не вошедшего нет вовсе — и подпись это отражает.
    expect(roleName(clinic, null)).toBe('Без входа')
    expect(roleName(clinic, 'rol_ushla')).toBe('Удалённая роль')
    // В правилах на строки «без входа» ещё встречается как аудитория правила.
    expect(rolesForRowRules(clinic).map((role) => role.name)).toEqual(['Без входа', 'Врач', 'Пациент'])
  })

  it('новое приложение получает набор ролей по умолчанию', () => {
    // Идентификаторы совпадают с прежним перечислением, поэтому приложения,
    // созданные до настраиваемых ролей, продолжают работать.
    expect(app().roles.map((role) => role.id)).toEqual(['client', 'staff', 'manager'])
    expect(defaultRole(app())).toBe('client')
  })

  it('старый список доступа из одних адресов читается как сотрудники', () => {
    const legacy = app({ accessMode: 'allowlist', allowlist: ['master@firma.ru'] })
    expect(visitorFor(legacy, 'master@firma.ru').roleId).toBe('staff')
  })
})

describe('права на поля выводятся из того, что показано', () => {
  const withFieldRoles = app({
    roles: [
      { id: 'client', name: 'Клиент', isDefault: true },
      { id: 'staff', name: 'Мастер', isDefault: false },
    ],
    screens: [
      {
        ...detailScreen,
        access: { roles: ['client', 'staff'] },
        components: [
          { id: 'cmp_what', position: 'a', visibleWhen: null, roles: null, type: 'field', fieldId: 'fld_what', label: null, showWhenEmpty: false },
          // Себестоимость — только мастеру.
          { id: 'cmp_cost', position: 'b', visibleWhen: null, roles: ['staff'], type: 'field', fieldId: 'fld_cost', label: null, showWhenEmpty: false },
        ],
      },
      {
        ...createScreen,
        access: { roles: ['client', 'staff'] },
        components: [
          formField('cmp_f_what', 'fld_what'),
          // Статус в форме есть, но заполняет его только мастер.
          formField('cmp_f_status', 'fld_status', ['staff']),
        ],
      },
    ],
  })

  const views = { viw_1: { tableId: 'tbl_1', config: {} } }

  it('поле, не показанное роли, ей не читается', () => {
    expect([...readableFields(withFieldRoles, 'tbl_1', asRole('client'), views)]).toEqual(['fld_what'])
    // Форма создания принимает статус новой записи, но не открывает статус существующих.
    expect([...readableFields(withFieldRoles, 'tbl_1', asRole('staff'), views)].sort()).toEqual([
      'fld_cost',
      'fld_what',
    ])
  })

  it('поле, не положенное роли в форме, ей не записывается', () => {
    expect([...writableFields(withFieldRoles, 'tbl_1', asRole('client'), 'create')]).toEqual(['fld_what'])
    expect([...writableFields(withFieldRoles, 'tbl_1', asRole('staff'), 'create')].sort()).toEqual([
      'fld_status',
      'fld_what',
    ])
  })

  it('компонент, закрытый роли, не приходит в приложение', () => {
    const forClient = visibleScreensFor(withFieldRoles, asRole('client')).find((item) => item.id === 'scr_detail')!
    expect(componentIds(forClient)).toEqual(['cmp_what'])
  })

  it('форма без полей не делает роль редактором', () => {
    const empty = app({
      screens: [{ ...createScreen, components: [], access: { roles: ['client'] } }],
    })
    expect(permits(empty, 'tbl_1', 'create', asRole('client'))).toBe(false)
  })

  it('поле владельца строки читается всегда: по нему решается, чья запись', () => {
    const portal = app({
      rowAccessRules: [{ tableId: 'tbl_1', emailFieldId: 'fld_email', appliesTo: ['client'] }],
      screens: [
        {
          ...detailScreen,
          access: { roles: ['client'] },
          components: [
            { id: 'cmp_what', position: 'a', visibleWhen: null, roles: null, type: 'field', fieldId: 'fld_what', label: null, showWhenEmpty: false },
          ],
        },
      ],
    })
    expect([...readableFields(portal, 'tbl_1', asRole('client'), views)].sort()).toEqual(['fld_email', 'fld_what'])
  })
})

describe('блок сводки не открывает роли колонку', () => {
  /*
   * Раньше поле, названное в плитке, попадало в читаемые и уезжало в браузер
   * вместе со строками: ради числа «сумма по себестоимости» клиент получал
   * себестоимость каждого заказа. Блоки считаются на сервере, и права на поле
   * из них больше не выводятся.
   */
  const withDashboard = app({
    roles: [
      { id: 'client', name: 'Клиент', isDefault: true },
      { id: 'staff', name: 'Мастер', isDefault: false },
    ],
    screens: [
      {
        ...detailScreen,
        access: { roles: ['client', 'staff'] },
        components: [
          { id: 'cmp_what', position: 'a', visibleWhen: null, roles: null, type: 'field', fieldId: 'fld_what', label: null, showWhenEmpty: false },
        ],
      },
      screen({
        id: 'scr_home',
        type: 'dashboard',
        access: { roles: ['client', 'staff'] },
        blocks: [
          {
            id: 'blk_cost',
            position: 'a',
            type: 'metric',
            source: { viewId: 'viw_1' },
            kind: 'sum',
            fieldId: 'fld_cost',
          },
        ],
      }),
    ],
  })

  const views = { viw_1: { tableId: 'tbl_1', config: {} } }

  it('колонка из плитки не становится читаемой', () => {
    expect([...readableFields(withDashboard, 'tbl_1', asRole('client'), views)]).toEqual(['fld_what'])
  })

  it('набор считается закрытым, раз карточка эту таблицу показывает', () => {
    expect(fieldPolicy(withDashboard, 'tbl_1', asRole('client'), views).restricted).toBe(true)
  })

  it('таблица, которую трогает только сводка, в браузер не уезжает', () => {
    const onlyDashboard = app({
      screens: [
        screen({
          id: 'scr_home',
          type: 'dashboard',
          access: { roles: ['client'] },
          blocks: [
            { id: 'blk_all', position: 'a', type: 'metric', source: { viewId: 'viw_2' }, kind: 'count' },
          ],
        }),
      ],
    })
    const both = { viw_2: { tableId: 'tbl_2', config: {} } }

    expect(showsRows(onlyDashboard, 'tbl_2', asRole('client'), both)).toBe(false)
    expect(showsRows(withDashboard, 'tbl_1', asRole('client'), views)).toBe(true)
  })
})

describe('гость — не роль, а отсутствие входа', () => {
  /*
   * Раньше гость был строкой в `access.roles` и стоял в одном ряду
   * с «Клиентом» и «Сотрудником». Роль отвечает на вопрос «что человеку
   * можно»; у не вошедшего вопрос ровно один — пускать ли его на этот экран.
   */

  it('старое определение читается: guest в ролях становится «видно без входа»', () => {
    const legacy = app({
      screens: [screen({ id: 'scr_vitrina', type: 'list', source: { viewId: 'viw_1' }, access: { roles: ['guest', 'client'] } })],
    })
    const [vitrina] = legacy.screens

    expect(vitrina!.access.public).toBe(true)
    // В ролях гостя больше нет: его оттуда и убирали.
    expect(vitrina!.access.roles).toEqual(['client'])
  })

  it('экран без пометки закрыт для не вошедшего', () => {
    const closed = app({
      screens: [screen({ id: 'scr_lk', type: 'detail', tableId: 'tbl_1', access: { roles: ['client'] } })],
    })
    expect(canOpenScreen(closed.screens[0]!, ANONYMOUS)).toBe(false)
    expect(canOpenScreen(closed.screens[0]!, asRole('client'))).toBe(true)
    expect(canEnter(closed, ANONYMOUS)).toBe(false)
  })

  it('витрина открыта не вошедшему и закрыта для чужих ролей', () => {
    const shop = app({
      screens: [
        screen({ id: 'scr_tovary', type: 'list', source: { viewId: 'viw_1' }, access: { public: true, roles: [] } }),
      ],
    })
    expect(canOpenScreen(shop.screens[0]!, ANONYMOUS)).toBe(true)
    // Вошедший клиент витрину не видит: ему её отдельно не открыли.
    expect(canOpenScreen(shop.screens[0]!, asRole('client'))).toBe(false)
  })

  it('«guest» в списке ролей больше ничего не открывает', () => {
    // Подсунуть строку мимо схемы можно, но смысла у неё нет.
    const sneaky = {
      access: { public: false, roles: ['guest'], allowDelete: false },
    } as unknown as Screen
    expect(canOpenScreen(sneaky, ANONYMOUS)).toBe(false)
  })

  it('новый экран закрыт для интернета, пока владелец не решил иначе', () => {
    const fresh = app({ screens: [screen({ id: 'scr_new', type: 'detail', tableId: 'tbl_1' })] })
    expect(fresh.screens[0]!.access.public).toBe(false)
  })

  it('публичная форма не даёт права записи не вошедшему', () => {
    /*
     * Видеть форму и записать строку — разные вещи. У постороннего нет
     * подтверждённой почты, и приписать созданную им строку некому:
     * «Почта клиента» в такой заявке набрана с клавиатуры.
     *
     * Заказ с витрины идёт мимо этого права: там человек сначала
     * подтверждает почту и только потом, уже с ролью, пишет строку.
     */
    const intake = app({
      screens: [{ ...createScreen, access: { public: true, roles: ['client'] } }],
    })

    expect(permits(intake, 'tbl_1', 'create', ANONYMOUS)).toBe(false)
    expect(writableFields(intake, 'tbl_1', ANONYMOUS, 'create').size).toBe(0)
    // Форму он при этом видит и заполняет — иначе приём заказов не собрать.
    expect(canOpenScreen(intake.screens[0]!, ANONYMOUS)).toBe(true)
    expect([...formFields(intake, intake.screens[0]!, ANONYMOUS)]).toEqual(['fld_what'])
  })

  it('приложение, собранное до разделения, тоже не пишет напрямую', () => {
    /*
     * Раньше такие приложения принимали заявки от кого угодно: рассылки
     * не было, и требовать код значило закрыть приём совсем. Теперь рассылка
     * есть, и обход снят — форма у них осталась публичной, а запись идёт
     * тем же путём с подтверждением почты, что и у новых.
     */
    const legacy = app({
      screens: [{ ...createScreen, access: { roles: ['guest', 'client'] } }],
    })

    // Старое «guest» в ролях по-прежнему читается как «видно без входа».
    expect(legacy.screens[0]!.access.public).toBe(true)
    expect(permits(legacy, 'tbl_1', 'create', ANONYMOUS)).toBe(false)
    expect(writableFields(legacy, 'tbl_1', ANONYMOUS, 'create').size).toBe(0)
    expect(permits(legacy, 'tbl_1', 'update', ANONYMOUS)).toBe(false)
    expect(permits(legacy, 'tbl_1', 'delete', ANONYMOUS)).toBe(false)
  })
})

describe('что уедет в браузер с публичного экрана', () => {
  /*
   * Витрина, открытая по ссылке, — единственное место, где строки попадают
   * к постороннему человеку. Ошибка здесь стоит дороже всех прочих:
   * исправить её после выкладки уже нельзя.
   */
  const views = { viw_1: { tableId: 'tbl_1', config: {} } }

  const vitrina = (extra: Record<string, unknown> = {}) =>
    app({
      screens: [
        screen({
          id: 'scr_tovary',
          type: 'list',
          source: { viewId: 'viw_1' },
          titleFieldId: 'fld_name',
          metaFieldId: 'fld_price',
          access: { public: true, publicFields: [], roles: [] },
          ...extra,
        }),
      ],
    })

  it('наружу уходят только названные колонки, а не всё, что на экране', () => {
    /*
     * Ключевое отличие от вошедшего. У него набор выводится из того, что ему
     * показано; у не вошедшего — только из белого списка. Иначе поставленная
     * на карточку «для себя» себестоимость уехала бы в интернет.
     */
    const shop = vitrina({
      access: { public: true, publicFields: ['fld_name', 'fld_price'], roles: [] },
    })
    const policy = fieldPolicy(shop, 'tbl_1', ANONYMOUS, views)

    expect([...policy.fields].sort()).toEqual(['fld_name', 'fld_price'])
    expect(
      onlyReadable({ fld_name: 'Фильтр', fld_price: 890, fld_cost: 410, fld_supplier: 'ООО «Тень»' }, policy),
    ).toEqual({ fld_name: 'Фильтр', fld_price: 890 })
  })

  it('поле, выведенное на экран, но не названное публичным, наружу не идёт', () => {
    // На витрине стоят название и цена, а разрешено только название.
    const half = vitrina({
      access: { public: true, publicFields: ['fld_name'], roles: [] },
    })
    const policy = fieldPolicy(half, 'tbl_1', ANONYMOUS, views)

    expect([...policy.fields]).toEqual(['fld_name'])
    expect(onlyReadable({ fld_name: 'Фильтр', fld_price: 890 }, policy)).toEqual({ fld_name: 'Фильтр' })
  })

  it('без белого списка экран открывается, но данных в нём нет', () => {
    const bare = vitrina()
    const policy = fieldPolicy(bare, 'tbl_1', ANONYMOUS, views)

    expect(canOpenScreen(bare.screens[0]!, ANONYMOUS)).toBe(true)
    expect(policy.restricted).toBe(true)
    expect(policy.fields.size).toBe(0)
    expect(onlyReadable({ fld_cost: 410, fld_supplier: 'ООО «Тень»' }, policy)).toEqual({})
  })

  it('«ограничений нет» для не вошедшего не существует', () => {
    /*
     * У вошедшего такое состояние есть: таблица, которую показывает только
     * плитка сводки, не ограничивается — числа считаются на сервере, а строки
     * наружу не уходят. Для не вошедшего это состояние опасно и запрещено:
     * набор у него закрыт всегда, даже когда публичных экранов нет вовсе.
     */
    const none = app({ screens: [] })

    const forStaff = fieldPolicy(none, 'tbl_1', asRole('staff'), views)
    expect(forStaff.restricted).toBe(false)
    expect(onlyReadable({ fld_cost: 410 }, forStaff)).toEqual({ fld_cost: 410 })

    const forAnyone = fieldPolicy(none, 'tbl_1', ANONYMOUS, views)
    expect(forAnyone.restricted).toBe(true)
    expect(onlyReadable({ fld_cost: 410 }, forAnyone)).toEqual({})
    expect(showsRows(none, 'tbl_1', ANONYMOUS, views)).toBe(false)
  })
})

describe('приложение публикует только то, что владелец назвал', () => {
  /*
   * Итоговая проверка разделения: «открыть экран», «прочитать данные»
   * и «записать» — три независимых ответа. Раньше они были одним списком
   * ролей, и первый тянул за собой остальные два.
   */
  const views = { viw_1: { tableId: 'tbl_1', config: {} } }

  const shop = app({
    screens: [
      screen({
        id: 'scr_vitrina',
        type: 'list',
        source: { viewId: 'viw_1' },
        titleFieldId: 'fld_name',
        metaFieldId: 'fld_cost',
        access: { public: true, publicFields: ['fld_name'], roles: [] },
      }),
      { ...createScreen, access: { public: true, publicFields: [], roles: ['client'] } },
    ],
  })

  it('видно — да, прочитать — только названное, записать — нет', () => {
    expect(canOpenScreen(shop.screens[0]!, ANONYMOUS)).toBe(true)
    expect([...fieldPolicy(shop, 'tbl_1', ANONYMOUS, views).fields]).toEqual(['fld_name'])
    expect(permits(shop, 'tbl_1', 'create', ANONYMOUS)).toBe(false)
  })

  it('«guest» не встречается среди ролей ни в одном экране', () => {
    for (const item of shop.screens) {
      expect(item.access.roles).not.toContain('guest')
    }
    expect(shop.roles.some((role) => role.id === 'guest')).toBe(false)
  })
})

describe('колонка статуса приходит вместе со строками', () => {
  /*
   * Плашка статуса и вкладки над списком рисуются в браузере, а значит
   * значение должно до него доехать. Забыть колонку в `readableFields` —
   * значит получить список с пустыми плашками и вкладками по нулям,
   * причём молча: ошибки нигде не будет.
   */
  const views = { viw_1: { tableId: 'tbl_1', config: {} } }

  const withStatus = app({
    screens: [
      screen({
        id: 'scr_list',
        type: 'list',
        source: { viewId: 'viw_1' },
        titleFieldId: 'fld_what',
        statusFieldId: 'fld_status',
        access: { public: false, publicFields: [], roles: ['client'] },
      }),
    ],
  })

  it('роли, которой открыт список, статус читается', () => {
    expect([...readableFields(withStatus, 'tbl_1', asRole('client'), views)].sort()).toEqual([
      'fld_status',
      'fld_what',
    ])
  })

  it('не вошедшему статус даётся только по белому списку', () => {
    // Список закрыт — не видно ничего.
    expect(readableFields(withStatus, 'tbl_1', ANONYMOUS, views).size).toBe(0)
  })
})

describe('кому отправлять код для входа в приложение', () => {
  const closed = app({
    accessMode: 'allowlist',
    allowlist: [{ email: 'master@example.ru', roleId: 'staff', company: '' }],
  })

  it('внесённому владельцем — да', () => {
    expect(maySendAppCode(closed, 'master@example.ru', null)).toBe(true)
    // Регистр и пробелы в адресе не должны решать, войдёт человек или нет.
    expect(maySendAppCode(closed, ' Master@Example.RU ', null)).toBe(true)
  })

  it('постороннему — нет', () => {
    expect(maySendAppCode(closed, 'nikto@example.ru', null)).toBe(false)
  })

  it('оформившему заказ на витрине — да, хотя в списке его нет', () => {
    /*
     * Самое важное здесь. Такой человек в списке доступа не появится никогда:
     * его роль лежит у него самого. Отказать ему — значит запереть его
     * снаружи собственного кабинета, как только истечёт сессия.
     */
    expect(maySendAppCode(closed, 'zakazchik@example.ru', 'client')).toBe(true)
  })

  it('запись без роли доступа не даёт', () => {
    // Запись пользователя заводится и при первом входе приглашённого.
    // Сама по себе она ничего не значит — значит только проставленная роль.
    expect(maySendAppCode(closed, 'zakazchik@example.ru', null)).toBe(false)
  })

  it('в открытое приложение — любому', () => {
    const open = app({ accessMode: 'public', allowlist: [] })
    expect(maySendAppCode(open, 'kto-ugodno@example.ru', null)).toBe(true)
  })
})

describe('отбор представления перенесён на сервер', () => {
  /*
   * Раньше отбор применялся в браузере. Это стоило двух вещей сразу: строка,
   * которую владелец убрал из списка фильтром, всё равно уезжала на устройство,
   * а колонка, по которой шёл фильтр, становилась читаемой — иначе повторный
   * отбор не нашёл бы значения. Теперь отбор считает сервер, и оба следствия
   * исчезают вместе.
   */
  const byCost = {
    viw_1: {
      tableId: 'tbl_1',
      config: {
        filter: {
          match: 'all',
          conditions: [{ fieldId: 'fld_cost', op: 'gt', value: 0 }],
          groups: [],
        },
        sorts: [{ fieldId: 'fld_secret', direction: 'asc' }],
      },
    },
  }

  const shop = app({
    screens: [
      screen({
        id: 'scr_list',
        type: 'list',
        source: { viewId: 'viw_1' },
        titleFieldId: 'fld_what',
        access: { roles: ['client'] },
      }),
    ],
  })

  it('колонка из фильтра представления читаемой не становится', () => {
    // Самое важное здесь: фильтр «себестоимость больше нуля» раньше открывал
    // себестоимость каждому, кому открыт такой список.
    const fields = readableFields(shop, 'tbl_1', asRole('client'), byCost as never)
    expect([...fields]).toEqual(['fld_what'])
  })

  it('колонка из сортировки — тоже', () => {
    const fields = readableFields(shop, 'tbl_1', asRole('client'), byCost as never)
    expect(fields.has('fld_secret')).toBe(false)
  })

  it('колонка поиска остаётся: искать без неё не по чему', () => {
    // Поиск идёт по уже полученным строкам на устройстве — это не отбор.
    const searchable = app({
      screens: [
        screen({
          id: 'scr_list',
          type: 'list',
          source: { viewId: 'viw_1', searchFieldIds: ['fld_phone'] },
          titleFieldId: 'fld_what',
          access: { roles: ['client'] },
        }),
      ],
    })
    const fields = readableFields(searchable, 'tbl_1', asRole('client'), byCost as never)
    expect([...fields].sort()).toEqual(['fld_phone', 'fld_what'])
  })
})

describe('до каких строк человек может дойти', () => {
  const field = (id: string, type = 'text'): Field =>
    ({ id, tableId: 'tbl_1', name: id, type, position: id, options: {} }) as unknown as Field
  const fields = [field('fld_what'), field('fld_done', 'checkbox')]

  const onlyDone = {
    viw_1: {
      id: 'viw_1',
      name: 'Готовые',
      tableId: 'tbl_1',
      config: {
        filter: { match: 'all', conditions: [{ fieldId: 'fld_done', op: 'is', value: true }], groups: [] },
      },
    },
  }

  const withList = app({
    screens: [
      screen({ id: 'scr_list', type: 'list', source: { viewId: 'viw_1' }, access: { roles: ['client'] } }),
      detailScreen,
    ],
  })

  it('строка доходит до человека, только если проходит отбор списка', () => {
    const reach = rowReach(withList, 'tbl_1', onlyDone as never, fields, asRole('client'))
    expect(reach.kind).toBe('gated')
    if (reach.kind !== 'gated') return
    expect(reach.allows({ fld_done: true })).toBe(true)
    expect(reach.allows({ fld_done: false })).toBe(false)
  })

  it('карточка сама выборку не сужает — её сужают правила на строки', () => {
    /*
     * У карточки и формы представления нет, и сузить ими нечего. Признать
     * такую таблицу закрытой было бы неверно: человек просто не увидел бы
     * собственную запись, открытую ему картой.
     */
    const onlyDetail = app({ screens: [detailScreen] })
    expect(rowReach(onlyDetail, 'tbl_1', {}, fields, asRole('client')).kind).toBe('ungated')
  })

  it('не вошедшему «сузить нечем» значит «ничего не видно»', () => {
    // Доказать, что строка разрешена наружу, можно только выборкой,
    // которую владелец назвал сам.
    const onlyDetail = app({
      screens: [screen({ id: 'scr_detail', type: 'detail', tableId: 'tbl_1', access: { public: true } })],
    })
    expect(rowReach(onlyDetail, 'tbl_1', {}, fields, ANONYMOUS).kind).toBe('none')
  })

  it('экран, закрытый этой роли, выборку не расширяет', () => {
    const forStaffOnly = app({
      screens: [
        screen({ id: 'scr_list', type: 'list', source: { viewId: 'viw_1' }, access: { roles: ['staff'] } }),
      ],
    })
    expect(rowReach(forStaffOnly, 'tbl_1', onlyDone as never, fields, asRole('client')).kind).toBe('none')
  })

  it('два списка складываются: подошёл хоть одному — строка доходит', () => {
    const both = app({
      screens: [
        screen({ id: 'scr_a', type: 'list', source: { viewId: 'viw_1' }, access: { roles: ['client'] } }),
        screen({ id: 'scr_b', type: 'list', source: { viewId: 'viw_2' }, access: { roles: ['client'] } }),
      ],
    })
    const views = {
      ...onlyDone,
      viw_2: { id: 'viw_2', name: 'Все', tableId: 'tbl_1', config: {} },
    }
    const reach = rowReach(both, 'tbl_1', views as never, fields, asRole('client'))
    expect(reach.kind).toBe('gated')
    if (reach.kind !== 'gated') return
    expect(reach.allows({ fld_done: false })).toBe(true)
  })
})

describe('пришедший с витрины', () => {
  it('помечается в самом посетителе, а не только в записи пользователя', () => {
    /*
     * Признак нужен и на чтении, и на записи, а `Visitor` — единственное,
     * что доходит до обоих. Однажды они разошлись: при записи признак
     * учитывался, при чтении нет, и «правил не задано» означало для такого
     * человека «видно всю таблицу».
     */
    expect(asRole('client', 'kto@example.ru', '', true).enrolled).toBe(true)
    expect(asRole('client', 'kto@example.ru').enrolled).toBe(false)
    expect(ANONYMOUS.enrolled).toBe(false)
  })

  it('роль из списка доступа приходит без пометки', () => {
    // Такого человека владелец позвал сам — он не с витрины.
    const known = app({
      accessMode: 'allowlist',
      allowlist: [{ email: 'master@firma.ru', role: 'staff' }],
    })
    expect(visitorFor(known, 'master@firma.ru').enrolled).toBe(false)
  })
})
