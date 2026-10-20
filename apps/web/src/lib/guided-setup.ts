import type { App } from '@tableapp/schema'

export const SETUP_STEPS = [
  { id: 'business', name: 'Бизнес', title: 'Как называется ваш бизнес?', description: 'Это название увидят пользователи приложения. Контакты можно заполнить позже.' },
  { id: 'data', name: 'Ваши данные', title: 'Добавьте своё вместо примеров', description: 'Таблицы уже связаны между собой. Откройте нужную и измените данные в ячейках или удобной форме.' },
  { id: 'work', name: 'Условия работы', title: 'Кто и как будет работать', description: 'Проверьте рабочие данные и доступ команды. Полный конструктор экранов доступен отдельно.' },
  { id: 'review', name: 'Проверка', title: 'Посмотрите, что получилось', description: 'Переключайте роли и проверьте доступные им экраны. Публикация откроет рабочую ссылку.' },
] as const
export type SetupStep = typeof SETUP_STEPS[number]['id']
export function setupStep(value: string | undefined): SetupStep {
  return SETUP_STEPS.find(step => step.id === value)?.id ?? 'business'
}
export function setupHref(appId: string | undefined, step: SetupStep) {
  const query = new URLSearchParams({ step })
  if (appId) query.set('app', appId)
  return `/setup?${query}`
}
export function tablePurpose(app: App | null, tableId: string) {
  if (app?.booking) {
    const { tables } = app.booking
    if (tables.services === tableId) return 'Услуги, цены и длительность. Из них клиент выбирает при записи.'
    if (tables.masters === tableId) return 'Мастера, их почты и услуги. Почта связывает назначения с сотрудником.'
    if (tables.schedule === tableId) return 'Рабочие дни, часы, перерывы и выходные каждого мастера.'
    if (tables.visits === tableId) return 'Записи клиентов, время посещения и статусы. Здесь появятся новые обращения.'
  }
  if (app?.inventory?.tables.items === tableId) return 'Товары, начальные остатки и текущая доступность.'
  if (app?.inventory?.tables.movements === tableId) return 'Журнал операций склада. Используйте действия учёта, чтобы остатки менялись согласованно.'
  return 'Данные этого приложения. Изменения записей доступны в связанных экранах согласно правам.'
}
