# Авторизация и защита от IDOR

Каждый пользователь, клиент или сотрудник видит и меняет только то, что
позволяют его роль и принадлежность к бизнесу. Подмена `orderId`, `clientId`,
`bookingId`, `conversationId`, `attachmentId`, `rowId`, `appId` или любого
другого идентификатора в URL, теле или query не должна открывать чужие данные.

Невидимые ресурсы отвечают **404**, а не 403 — чтобы не подтверждать существование.

## Модель

1. **Principal** берётся только с сервера (cookie сессии сотрудника /
   участника / аккаунта). Роль из клиента не доверяется.
2. Ресурс загружается в контексте **приложения / воркспейса**, затем проверяются
   роль экрана и владение строкой (поле почты / `appUser` / V2 grants).
3. Идентификаторы из другого приложения или другого клиента отклоняются.
4. Запись дополнительно проверяет `permits` / writable fields / ownership stamp.

См. также [account-model.md](account-model.md).

## Центральные хелперы

| Хелпер | Файл | Назначение |
| --- | --- | --- |
| `authorizeWorkspace` / `authorizeTable` / `authorizeView` / `authorizeApp` | `apps/web/src/lib/authorize.ts` | Участник воркспейса; id должен принадлежать его пространству |
| `requireAppVisitor` / `requireRecordAccess` / `assertAppMember` / `customerRequiresOwnRows` | `apps/web/src/lib/record-access.ts` | Runtime: slug → app → principal → table → row + ownership |
| `canAccessRow` / `rulesFor` / `ownRowsDeclared` | `apps/web/src/lib/row-access.ts` | Предикат владения строкой; пустые правила для клиента = deny |
| `conversationAccess` / `canReadConversationFile` | `apps/web/src/lib/conversations.ts` | Переписка: slug + table + row + роль/почта |
| `canReadAttachment` | `apps/web/src/lib/file-access.ts` | Единый шлюз скачивания вложений |
| `canReadBuilderV2File` | `apps/web/src/lib/builder-v2-file-access.ts` | V2: поле и строка по опубликованным grants |
| `currentAppAccess` / `currentStaffEmail` | `apps/web/src/lib/app-session.ts` | Principal приложения |

Клиентская / default-роль **никогда** не получает allow-all при пустых
`rowAccessRules` (ни чтение, ни запись) — в том числе если адрес стоит в
списке доступа.

## Покрытые точки входа

| Класс | Пути | Проверка |
| --- | --- | --- |
| Runtime rows | `runtime-actions.ts` (`appCreate/Update/DeleteRowAction`) | `allow` + `customerRequiresOwnRows` + `canAccessRow` guard |
| Sync / live | `api/sync`, `api/live/[tableId]`, `api/app-live/[slug]` | `authorizeTable` / `appReadPolicy` / `canEnter` |
| Файлы | `api/files/[...key]`, `api/files` POST, `api/conversations/files`, `api/builder-v2/files` | `canReadAttachment` / upload auth; 404 при отказе |
| Переписка | `conversation-actions.ts`, inbox | `conversationAccess`; клиентский inbox фильтрует SQL по своей почте |
| Бронирование | `booking-actions.ts`, `owner-booking-actions.ts` | `currentAppAccess` + `canAccessRow` / `authorizeApp` |
| Клиентские решения / история | `customer-actions`, `customer-history-actions`, order-* | policy + ownership |
| Export / import | `a/[slug]/export`, `t/[tableId]/export`, `import-actions` | visitor projection / `authorizeTable` |
| Builder V2 | published actions, support/service | `publishedV2Actor` + module assert* |
| Платформа | table/view/app CRUD | `authorize*` по workspaceId |

## Тесты

- `record-access.idor.db.test.ts` — два бизнеса, два клиента, один сотрудник:
  cross-client, cross-app, client→staff-only, staff A→app B.
- `customer-apps-privacy.db.test.ts` — `/my` не смешивает рабочие и клиентские
  каталоги; allowlist без активности не попадает в «Где вы клиент».
- `builder-v2-files.db.test.ts`, `access-sync-files.db.test.ts` — скачивание
  вложений без существования-утечек (404).
- `customer-isolation.db.test.ts`, `workspace-isolation.db.test.ts` —
  изоляция бизнесов и воркспейсов.
- `row-access.test.ts` — fail-closed для `customer` / `enrolled` без правил.
