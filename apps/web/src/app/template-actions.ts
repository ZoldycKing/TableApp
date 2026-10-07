'use server'

import {
  apps,
  db,
  fields as fieldsTable,
  rowChanges,
  rows as rowsTable,
  tables,
  views as viewsTable,
} from '@tableapp/db'
import type { App, Block, Component, RoleId, Field, Screen, View } from '@tableapp/schema'
import { newId, positionBetween } from '@tableapp/schema'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { publishTable } from '@/lib/live'
import { noteBulkChange } from '@/lib/usage'
import { generateApp, slugify } from '@/lib/app-builder'
import { uniqueSlug } from '@/lib/app-slug'
import { authorizeTable, authorizeWorkspace } from '@/lib/authorize'
import { buildTemplate } from '@/lib/templates/build'
import { findTemplate } from '@/lib/templates/catalog'
import { asProduction } from '@/lib/templates/production-app'
import type { ActionResult } from './actions'

export type AppliedTemplate = {
  ok: true
  /** Куда вести человека сразу после установки. */
  tableId: string
  appId: string
  appSlug: string
  tableIds: string[]
}

/**
 * Установка шаблона.
 *
 * Шаблон разворачивается в собственные таблицы воркспейса — с собственными
 * идентификаторами, примерами строк и готовым приложением. Всё одной
 * транзакцией: наполовину установленный шаблон хуже, чем неустановленный.
 */
export async function applyTemplateAction(
  templateId: string,
): Promise<AppliedTemplate | { ok: false; error: string }> {
  const template = findTemplate(templateId)
  if (!template) return { ok: false, error: 'Шаблон не найден' }

  const auth = await authorizeWorkspace()
  if (!auth.ok) return auth
  const workspaceId = auth.member.workspaceId

  const [last] = await db
    .select({ position: tables.position })
    .from(tables)
    .where(eq(tables.workspaceId, workspaceId))
    .orderBy(desc(tables.position))
    .limit(1)

  const built = buildTemplate({ template, workspaceId, afterPosition: last?.position ?? null })

  const appTable = built.tables.find((table) => table.id === built.appTableId)!
  const appFields = built.fields
    .filter((field) => field.tableId === built.appTableId)
    .map((field) => field as unknown as Field)
  const appView = built.views.find((view) => view.id === built.appViewId)! as unknown as View

  const appId = newId('app')
  const generated = generateApp({
    appId,
    workspaceId,
    name: built.appName,
    slug: await uniqueSlug(slugify(built.appName)),
    table: { id: appTable.id, name: appTable.name, primaryFieldId: appTable.primaryFieldId },
    fields: appFields,
    view: appView,
  })

  /*
   * Надстройки поверх собранного приложения. Их две, и они не смешиваются:
   * кабинет клиента — про приём заявок снаружи, производственный учёт —
   * про две внутренние роли и операцию, которой нет в общем движке.
   */
  const draft = built.portal
    ? asPortal(generated, built.portal)
    : built.production
      ? asProduction(generated, built)
      : generated

  await db.transaction(async (tx) => {
    await tx.insert(tables).values(built.tables)
    await tx.insert(fieldsTable).values(built.fields)
    await tx.insert(viewsTable).values(built.views)
    if (built.rows.length > 0) await tx.insert(rowsTable).values(built.rows)
    await tx.insert(apps).values({
      id: appId,
      workspaceId,
      name: draft.name,
      slug: draft.slug,
      theme: draft.theme,
      accessMode: draft.accessMode,
      allowlist: draft.allowlist,
      rowAccessRules: draft.rowAccessRules,
      homeScreenId: draft.homeScreenId,
      draft,
    })
  })

  // Шаблон приносит сразу таблицы, строки-примеры и приложение: расход
  // меняется заметно, и снимок пересчитываем не откладывая.
  await noteBulkChange(auth.member.workspaceId)

  revalidatePath('/', 'layout')
  return {
    ok: true,
    tableId: built.appTableId,
    appId,
    appSlug: draft.slug,
    tableIds: built.tables.map((table) => table.id),
  }
}

/**
 * Кабинет клиента поверх собранного приложения.
 *
 * Три вещи сразу: форму открываем гостю, список и карточку — только вошедшим,
 * строки сравниваем с почтой. По отдельности это четыре переключателя в трёх
 * местах конструктора, и до конца доходят единицы. Поэтому шаблон, который
 * обещает кабинет, приносит его настроенным.
 */
function asPortal(
  app: App,
  portal: {
    tableId: string
    showcase: {
      tableId: string
      viewId: string
      publicFieldIds: string[]
      staffFieldIds: string[]
      titleFieldId: string
      listName: string
      cardName: string
      tabLabel: string
      intro: string
    }
    emailFieldId: string
    clientFieldIds: string[]
    staffOnlyFieldIds: string[]
    clientTitle: string
    guest: {
      screenName: string
      intro: string
      submitLabel: string
      successText: string
      labels: Record<string, string>
    }
  },
): App {
  const forClient = new Set(portal.clientFieldIds)
  const staffOnly = new Set(portal.staffOnlyFieldIds)

  /*
   * Витрина: то, что видно **до** входа.
   *
   * Два экрана поверх второй таблицы — список и карточка. Оба помечены
   * «видно без входа», и у обоих перечислены колонки, которые при этом
   * показываются. Себестоимость лежит в той же таблице и в список не входит,
   * поэтому наружу не уходит: не прячется оформлением, а не попадает в ответ.
   *
   * Строки берутся из представления «Опубликованные» — снял отметку, и услуга
   * исчезла с витрины, оставшись у вас. Это тот же отбор, что и в таблице,
   * но для не вошедшего он применяется на сервере.
   */
  const showcaseCardId = newId('screen')
  const showcaseListId = newId('screen')
  const showcaseAccess = {
    public: true,
    publicFields: portal.showcase.publicFieldIds,
    roles: ['client', 'staff', 'manager'] as RoleId[],
    allowDelete: false,
  }

  const showcase: Screen[] = [
    {
      id: showcaseListId,
      appId: app.id,
      name: portal.showcase.listName,
      /*
       * Порядок здесь работает как стартовый экран роли: если у человека
       * нет доступа к домашнему, приложение открывает первый доступный ему
       * раздел с вкладкой. Витрина стоит после рабочих разделов, поэтому
       * сотрудник попадает на сводку, клиент — в кабинет, а не вошедший —
       * на витрину, потому что кроме неё у него ничего и нет.
       */
      position: 'w',
      tab: { icon: 'tag', label: portal.showcase.tabLabel },
      access: showcaseAccess,
      /*
       * Плитка, а не список. Витрину читают не построчно, а разглядывают:
       * человек сравнивает, что входит и сколько стоит, — и карточки для
       * этого удобнее строк, где всё вытянуто в одну линию.
       */
      type: 'tiles',
      columns: 3,
      source: { viewId: portal.showcase.viewId, extraFilter: null, searchFieldIds: [portal.showcase.titleFieldId] },
      titleFieldId: portal.showcase.publicFieldIds[0] ?? null,
      // Описание идёт подписью: на плитке оно встаёт под названием.
      subtitleFieldId: portal.showcase.publicFieldIds[1] ?? null,
      imageFieldId: null,
      metaFieldId: portal.showcase.publicFieldIds[2] ?? null,
      statusFieldId: null,
      onTapScreenId: showcaseCardId,
      components: [],
    },
    {
      id: showcaseCardId,
      appId: app.id,
      name: portal.showcase.cardName,
      position: 'x',
      tab: null,
      access: showcaseAccess,
      type: 'detail',
      tableId: portal.showcase.tableId,
      /*
       * Публичные колонки видны всем, служебные — только вашим. Колонка
       * с ролями не прячет значение оформлением: не вошедшему компонент
       * отсеивается вместе с полем, и себестоимость до него не доезжает.
       */
      components: [
        // Название уже стоит в шапке карточки — повторять его строкой незачем.
        ...portal.showcase.publicFieldIds.slice(1).map((fieldId, index) => ({
          id: newId('component'),
          position: String.fromCharCode(97 + index),
          visibleWhen: null,
          roles: null,
          type: 'field' as const,
          fieldId,
          label: null,
          showWhenEmpty: false,
        })),
        ...portal.showcase.staffFieldIds.map((fieldId, index) => ({
          id: newId('component'),
          position: String.fromCharCode(112 + index),
          visibleWhen: null,
          roles: ['staff', 'manager'] as RoleId[],
          type: 'field' as const,
          fieldId,
          label: null,
          showWhenEmpty: false,
        })),
      ],
    },
  ]

  /*
   * Две сводки, а не одна.
   *
   * Клиент и сотрудник смотрят на одни и те же строки, но видят разное:
   * у клиента это «Мои заказы» и только его записи, у сотрудника — все.
   * Один экран на обоих пришлось бы назвать нейтрально, и для клиента
   * он перестал бы быть его кабинетом.
   */
  /*
   * Блок быстрых действий убираем вместе с формой: он вёл ровно туда.
   * Оставлять пустую полосу с единственной кнопкой «Добавить запись»,
   * которая никуда не ведёт, хуже, чем не показывать её вовсе.
   */
  const withoutActions = (blocks: readonly Block[]): Block[] =>
    blocks.filter((block) => block.type !== 'actions')

  const generated = app.screens.find((screen) => screen.type === 'dashboard')
  const dashboards: Screen[] =
    generated && generated.type === 'dashboard'
      ? [
          {
            ...generated,
            name: portal.clientTitle,
            tab: { icon: 'home', label: 'Главная' },
            access: { public: false, publicFields: [], roles: ['client'], allowDelete: false },
            blocks: withoutActions(generated.blocks).map((block) =>
              block.type === 'list' ? { ...block, title: portal.clientTitle } : block,
            ),
          },
          {
            ...generated,
            id: newId('screen'),
            name: 'Сводка',
            position: positionBetween(generated.position, null),
            tab: { icon: 'chart', label: 'Сводка' },
            blocks: withoutActions(generated.blocks),
            access: { public: false, publicFields: [], roles: ['staff', 'manager'], allowDelete: false },
          },
        ]
      : []
  return {
    ...app,
    // Открытое приложение: адреса клиентов заранее не известны, вносить
    // их в список некому. Что человек увидит, решает правило на строки.
    accessMode: 'public',
    /*
     * ВРЕМЕННО, ДО ПОДКЛЮЧЕНИЯ ПОЧТЫ.
     *
     * Заказ от постороннего принимается через подтверждение почты: человек
     * вводит адрес, получает код, и только после этого появляется строка —
     * уже от проверенного человека и в его собственном кабинете. Поэтому
     * правило ниже обязательно: без него приём не работает вовсе.
     */
    rowAccessRules: [
      {
        tableId: portal.tableId,
        fieldId: portal.emailFieldId,
        match: 'email',
        appliesTo: ['guest', 'client'],
      },
    ],
    /*
     * Домашним оставляем сводку: вошедший клиент приходит посмотреть свои
     * записи. Гостю сводка не открыта, и он автоматически попадает на форму —
     * первый доступный ему экран.
     */
    /*
     * Домашний — кабинет клиента. Остальным он не открыт, и они попадают
     * на первый доступный раздел: сотрудник на сводку, не вошедший на витрину.
     */
    homeScreenId: dashboards[0]?.id ?? app.homeScreenId,
    screens: [
      ...app.screens.flatMap((screen) => {
      // Сводку заменяем двумя: клиентской и рабочей.
      if (screen.type === 'dashboard') return dashboards

      if (screen.type === 'form') {
        // Создание — клиенту, правка — только вашим людям. Иначе клиент сам
        // себе поставит статус «Решено» и перепишет ответ.
        const roles: RoleId[] =
          screen.mode === 'create' ? ['client', 'staff', 'manager'] : ['staff', 'manager']

        if (screen.mode !== 'create') {
          return { ...screen, access: { public: false, publicFields: [], roles, allowDelete: false } }
        }

        /*
         * Форма приёма заявок переписывается целиком под того, кто её
         * заполняет. Конструктор собрал её из колонок таблицы, а они названы
         * изнутри дела: «Новая запись», «Почта клиента», кнопка «Создать».
         * Человеку снаружи это ничего не говорит — и он закрывает вкладку.
         */
        const fields = screen.components
          .filter((component) => component.type !== 'form_field' || forClient.has(component.fieldId))
          .map((component) =>
            component.type === 'form_field' && portal.guest.labels[component.fieldId]
              ? { ...component, label: portal.guest.labels[component.fieldId]! }
              : component,
          )

        // Пояснение над полями: что это за форма и что будет дальше.
        const intro: Component = {
          id: newId('component'),
          position: positionBetween(null, fields[0]?.position ?? null),
          visibleWhen: null,
          roles: null,
          type: 'text',
          source: { kind: 'literal', value: portal.guest.intro },
          style: 'body',
        }

        /*
         * Форма одна, и она для тех, кто ещё не вошёл.
         *
         * Вошедшему в этом шаблоне создавать нечего: заявки приходят снаружи,
         * а дальше их ведут сотрудники — меняют статус, срок и сумму на
         * карточке. Вторая форма «Новая заявка» была лишним входом в тот же
         * экран и путала: человек уже в кабинете, а ему предлагают
         * зарегистрировать обращение заново.
         */
        const anonymousForm: Screen = {
          ...screen,
          name: portal.guest.screenName,
          submitLabel: portal.guest.submitLabel,
          successText: portal.guest.successText,
          // Вкладка нужна: с витрины должен быть понятный переход к заявке.
          tab: { icon: 'plus', label: 'Заявка' },
          // Гостю возвращаться некуда: список ему не открыт, и рантайм
          // покажет подтверждение вместо той же пустой формы.
          components: [intro, ...fields],
          /*
           * Форму приёма заявок пока видно без входа: почта у нас ещё
           * не подключена, и требовать код от постороннего человека значило бы
           * закрыть приём заявок вовсе. Как только письма пойдут, `public`
           * здесь станет `false`, а отправка будет просить подтвердить почту —
           * тогда владелец строки перестанет набираться с клавиатуры.
           */
          access: { public: true, publicFields: [], roles: [], allowDelete: false },
        }

        return anonymousForm
      }
      /*
       * Карточка одна на всех, но служебные колонки на ней — только вашим.
       * Заметка «клиент передумал, предоплату вернули» написана для своих,
       * и клиенту её видеть незачем: поле не прячется оформлением, а вовсе
       * не приходит ему в браузер.
       */
      const components = screen.components.map((component) =>
        component.type === 'field' && staffOnly.has(component.fieldId)
          ? { ...component, roles: ['staff', 'manager'] as RoleId[] }
          : component,
      )

      return {
        ...screen,
        components,
        access: { public: false, publicFields: [], roles: ['client', 'staff', 'manager'] as RoleId[], allowDelete: false },
      }
      }),
      ...showcase,
    ],
  }
}

/**
 * Удаление примеров.
 *
 * Удаляются ровно те строки, которые положил шаблон: отметка `sample`
 * снимается с любой строки, которую человек тронул, поэтому его собственные
 * данные под эту операцию не попадают никогда.
 */
export async function deleteSampleRowsAction(tableId: string): Promise<ActionResult> {
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return auth

  const samples = await db
    .select({ id: rowsTable.id, data: rowsTable.data })
    .from(rowsTable)
    .where(and(eq(rowsTable.tableId, tableId), eq(rowsTable.sample, true), isNull(rowsTable.deletedAt)))

  if (samples.length === 0) return { ok: true }

  const ids = samples.map((row) => row.id)
  await db.transaction(async (tx) => {
    await tx
      .update(rowsTable)
      .set({ deletedAt: new Date() })
      .where(and(eq(rowsTable.tableId, tableId), inArray(rowsTable.id, ids)))
    await tx.insert(rowChanges).values(
      samples.map((row) => ({
        id: newId('change'),
        tableId,
        rowId: row.id,
        op: 'delete',
        actorId: auth.member.userId,
        actorKind: 'member',
        before: row.data as Record<string, unknown>,
      })),
    )
  })

  revalidatePath('/t/[tableId]', 'page')
  publishTable(tableId, 'rows')
  return { ok: true }
}

/** Скрыть подсказку про примеры: человек разобрался и хочет работать. */
export async function dismissTemplateNoticeAction(tableId: string): Promise<ActionResult> {
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return auth

  await db.update(tables).set({ templateId: null }).where(eq(tables.id, tableId))
  revalidatePath('/t/[tableId]', 'page')
  publishTable(tableId, 'rows')
  return { ok: true }
}
