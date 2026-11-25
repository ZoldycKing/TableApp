# Авторизация и защита от IDOR

Каждый пользователь, клиент или сотрудник видит и меняет только то, что
позволяют его роль и принадлежность к бизнесу. Подмена `orderId`, `clientId`,
`bookingId`, `conversationId`, `attachmentId`, `rowId`, `appId` или любого
другого идентификатора в URL, теле или query не должна открывать чужие данные.

См. также [account-model.md](account-model.md).

## 404 vs 403

| Когда | Статус / ответ | Зачем |
| --- | --- | --- |
| Ресурс **невидим** актору (нет права читать / объект вне проекции) | **404** (или `{ ok: false }` без подтверждения существования) | Не подтверждать, что id существует |
| Актор **в контексте** (воркспейс / приложение), но **нет права на действие** | **403** / `denied` | Сотрудник знает, что таблица есть, но не может писать / синхронизировать |

Правила на практике:

- **GET файлов** (`/api/files/...`): отказ всегда **404** — ключ файла не должен
  подтверждать существование вложения.
- **Скрытая таблица** у участника воркспейса: export → **404**; sync / live без
  доступа → **403** (участник уже в пространстве и знает про таблицы).
- **Upload** без права редактирования → **403** (сессия есть, действия нет).
- **Строки runtime**: чужая / невидимая строка → not-found; клиент без правил
  владения на запись → denied.

## Модель

1. **Principal** берётся только с сервера (cookie сессии сотрудника /
   участника / аккаунта). Роль из клиента не доверяется.
2. Ресурс загружается в контексте **приложения / воркспейса**, затем проверяются
   роль экрана и владение строкой (поле почты / `appUser` / V2 grants).
3. Идентификаторы из другого приложения или другого клиента отклоняются.
4. Запись дополнительно проверяет `permits` / writable fields / ownership stamp.
5. **Workflow-записи** (складское движение, резерв/выдача заказа, производство)
   выполняются сервером по разрешённому экрану/действию и обновляют
   *связанные* строки каталога без требования «владеть» товаром. Обычные
   `appUpdateRowAction` / `appDeleteRowAction` клиента по чужим строкам
   по-прежнему fail-closed.

## Центральные хелперы

| Хелпер | Файл | Назначение |
| --- | --- | --- |
| `authorizeWorkspace` / `authorizeTable` / `authorizeView` / `authorizeApp` | `apps/web/src/lib/authorize.ts` | Участник воркспейса; id должен принадлежать его пространству |
| `requireAppVisitor` / `requireRecordAccess` / `assertAppMember` / `customerRequiresOwnRows` / `accessViewerFor` | `apps/web/src/lib/record-access.ts` | Runtime: slug → app → principal → table → row + ownership |
| `isCustomerRole` | `apps/web/src/lib/app-roles.ts` | Клиентская роль (`client` / default при наличии рабочей роли); **не** `owner`/`staff`/`manager` |
| `canAccessRow` / `rulesFor` / `ownRowsDeclared` | `apps/web/src/lib/row-access.ts` | Предикат владения; пустые правила + `customer` = deny |
| `conversationAccess` / `canReadConversationFile` | `apps/web/src/lib/conversations.ts` | Переписка: slug + table + row + роль/почта |
| `canReadAttachment` | `apps/web/src/lib/file-access.ts` | Единый шлюз скачивания; отказ → 404 |
| `canReadBuilderV2File` | `apps/web/src/lib/builder-v2-file-access.ts` | V2: поле и строка по опубликованным grants |
| `currentAppAccess` / `currentStaffEmail` | `apps/web/src/lib/app-session.ts` | Principal приложения |

Клиентская роль **никогда** не получает allow-all при пустых `rowAccessRules`
(ни чтение, ни запись). Рабочий default (кладовщик `staff` и т.п.) — не клиент.

## Покрытие точек входа (аудит)

Каждая серверная точка входа ниже просмотрена в этом аудите.
Статус: **checked-ok** (корректна) или **fixed** (исправлена в этом PR).

### Route handlers

| Точка входа | Статус | Заметка |
| --- | --- | --- |
| `GET /api/files/[...key]` | fixed | Отказ → 404; unbound для unrestricted member; app-claimed без member bypass |
| `POST /api/files` | checked-ok | Upload: сессия редактора; viewer → 403 |
| `POST /api/builder-v2/files` | checked-ok | Контекст формы + published grants |
| `GET/POST /api/builder-v2/logo/[appId]` | checked-ok | Владелец приложения / публичный логотип |
| `POST /api/conversations/files` | checked-ok | `conversationAccess` |
| `GET /api/sync` | checked-ok | `authorizeTable`; нет доступа → 403 |
| `GET /api/live/[tableId]` | checked-ok | `authorizeTable` |
| `GET /api/app-live/[slug]` | checked-ok | visitor / `canEnter` |
| `POST /api/payments/yookassa` | checked-ok | webhook подпись провайдера |
| `GET /auth` | checked-ok | magic-link consume |
| `GET /a/[slug]/auth` | checked-ok | app magic-link |
| `GET /a/[slug]/export` | checked-ok | visitor projection |
| `GET /a/[slug]/manifest.webmanifest` | checked-ok | публичный манифест по slug |
| `GET /t/[tableId]/export` | checked-ok | скрытая таблица → 404 |
| `POST /dispatch-shot/act` | checked-ok | demo/shot helper, без чужих данных |

### Runtime / клиентские server actions

| Точка входа | Статус | Заметка |
| --- | --- | --- |
| `runtime-actions` `appCreate/Update/DeleteRowAction` | fixed | `accessViewerFor` + `customerRequiresOwnRows`; generic client writes fail-closed |
| `runtime-screen-actions` load* | checked-ok | revision + visitor projection |
| `inventory-actions` `receiveStock` / `saveStockOperation` | fixed | workflow-write: экран → товар из проекции → журнал без ownership на каталоге |
| `order-stock-actions` * | checked-ok | `orderStockInternal` side-effects на товар; staff/business gate |
| `order-delivery-actions` * | checked-ok | delivery + stock pair |
| `production-actions` * | checked-ok | screen + `canAccessRow` на собственные записи |
| `booking-actions` / `owner-booking-actions` | checked-ok | `currentAppAccess` + ownership |
| `customer-actions` / `customer-history-actions` | checked-ok | policy + own rows |
| `conversation-actions` * | fixed | inbox SQL filter по почте клиента; cross-row → not-found |
| `intake-actions` / `question-auth-actions` | checked-ok | код + slug |
| `support-actions` / `service-actions` / `projects-actions` | checked-ok | published module asserts |
| `team-calendar-actions` * | checked-ok | published/builder scopes |
| `dispatch-actions` / `dispatch-setup-actions` | checked-ok | authorizeApp / module |

### Builder V2 server actions

| Точка входа | Статус | Заметка |
| --- | --- | --- |
| `builder-v2-published-actions` * | checked-ok | `publishedV2Actor` + grants |
| `builder-v2-form/button/delete/enter-actions` * | checked-ok | draft: `authorizeApp`; published: actor |
| `builder-v2-data-actions` / `board` / `booking*` | checked-ok | member app scope |
| `builder-v2-publish/logo/workflow/actions` | checked-ok | owner/editor |

### Платформа / воркспейс

| Точка входа | Статус | Заметка |
| --- | --- | --- |
| `table-editor-actions` / `field-actions` / `view-actions` / `history-actions` | checked-ok | `authorizeTable` + member tableAccess |
| `import-actions` / `template-actions` | checked-ok | workspace editor |
| `app-actions` / `app-version-actions` / `actions` | checked-ok | `authorizeApp` / workspace |
| `team-actions` / `business-actions` / `business-navigation-actions` | checked-ok | owner gates |
| `auth-actions` `appsForStaff` / `businessesForClient` | fixed | раздельные каталоги; client = activity signal |
| `security-actions` / `usage-actions` / `payment-actions` / `pay/actions` | checked-ok | session / billing |
| `module-actions` / `inventory-setup` / `portal-setup` / `stock-automation` | checked-ok | `authorizeApp` |
| `editor-preview-actions` / `builder-learning-actions` | checked-ok | preview без мутаций published |

## Тесты

- `record-access.idor.db.test.ts` — два бизнеса, два клиента, один сотрудник:
  cross-client, cross-app, client→staff-only, staff A→app B.
- `customer-apps-privacy.db.test.ts` — `/my` не смешивает рабочие и клиентские
  каталоги; allowlist без активности не попадает в «Где вы клиент».
- `row-writes.db.test.ts` — складские workflow-записи (приёмка/выдача) для
  рабочей роли `staff` (default) проходят; generic journal sync — нет.
- `member-table-access.db.test.ts` — скрытые файлы GET → 404; sync без права → 403;
  export скрытой таблицы → 404.
- `builder-v2-files.db.test.ts`, `access-sync-files.db.test.ts`, `files.db.test.ts`
  — скачивание без existence-leak (404).
- `customer-isolation.db.test.ts`, `workspace-isolation.db.test.ts` —
  изоляция бизнесов и воркспейсов.
- `row-access.test.ts` / `app-roles.test.ts` — fail-closed для customer;
  working defaults не считаются клиентами.
