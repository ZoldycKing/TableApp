import { newId, positionBetween, type App, type Block, type Component, type RoleId, type Screen } from '@tableapp/schema'

export function asPortal(
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
  const request = app.screens.find(screen => screen.type === 'form' && screen.mode === 'create' && screen.tableId === portal.tableId)
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
        ...portal.showcase.publicFieldIds.slice(1).map((fieldId, index) => fieldId === portal.showcase.publicFieldIds[1] ? ({
          id: newId('component'), position: String.fromCharCode(97 + index), visibleWhen: null, roles: null,
          type: 'text' as const, source: { kind: 'field' as const, fieldId }, style: 'body' as const,
        }) : ({
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
        ...(request ? [{
          id: newId('component'), position: 'zz', visibleWhen: null, roles: null,
          type: 'button' as const, label: 'Оставить заявку', style: 'primary' as const,
          action: { id: newId('action'), type: 'open_screen' as const, screenId: request.id,
            initialValues: { [portal.clientFieldIds[0]!]: { kind: 'field' as const, fieldId: portal.showcase.titleFieldId } } },
        }] : []),
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
    // Ownership is stamped from the verified identity, including shared logins.
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
          .filter((component) => component.type !== 'form_field' || forClient.has(component.fieldId) && component.fieldId !== portal.emailFieldId)
          .map((component) =>
            component.type === 'form_field' && portal.guest.labels[component.fieldId]
              ? { ...component, label: portal.guest.labels[component.fieldId]!, required: component.fieldId === portal.clientFieldIds[0] }
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

        // The same safe form handles first and repeat requests. Email is
        // collected once during verification and stamped by the server.
        const anonymousForm: Screen = {
          ...screen,
          name: portal.guest.screenName,
          submitLabel: portal.guest.submitLabel,
          successText: portal.guest.successText,
          // Начинаем оформление из карточки выбранной услуги.
          tab: null,
          // Гостю возвращаться некуда: список ему не открыт, и рантайм
          // покажет подтверждение вместо той же пустой формы.
          components: [intro, ...fields],
          // Guests verify before saving; signed-in customers use their session.
          access: { public: true, publicFields: [], roles: ['client'], allowDelete: false },
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
