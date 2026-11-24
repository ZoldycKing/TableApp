import { newId } from '@tableapp/schema'
import type { AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'

/** Portrait pool for the large call-center demo — real photos, no letter avatars. */
export const SUPPORT_LARGE_PHOTO_POOL = [
  '/template-media/support/marina.jpg',
  '/template-media/support/anna.jpg',
  '/template-media/support/igor.jpg',
  '/template-media/support/pavel.jpg',
  '/template-media/support/irina.jpg',
  '/template-media/support/petr.jpg',
  '/template-media/support/olga.jpg',
  '/template-media/support/artem.jpg',
  '/template-media/salon/salon-alexey.jpg',
  '/template-media/salon/salon-boris.jpg',
  '/template-media/salon/salon-maria.jpg',
  '/template-media/salon/salon-natasha.jpg',
  '/template-media/salon/salon-olga.jpg',
  '/template-media/salon/salon-irina.jpg',
  '/template-media/salon/salon-anna.jpg',
  '/template-media/salon/salon-zhenya.jpg',
  '/template-media/salon/salon-kira.jpg',
  '/template-media/salon/salon-marina.jpg',
  '/template-media/salon/salon-olya.jpg',
  '/template-media/salon/salon-svetlana.jpg',
  '/template-media/salon/salon-pavel.jpg',
  '/template-media/projects/alexey.jpg',
  '/template-media/projects/svetlana.jpg',
  '/template-media/dispatch/sergey.jpg',
  '/template-media/dispatch/andrey.jpg',
  '/template-media/dispatch/igor.jpg',
] as const

const LINE_NAMES = ['1-я линия', '2-я линия', 'Биллинг'] as const

/** ~30 operators across three lines for the support-shot large-team harness. */
const LARGE_OPERATORS: { name: string; email: string; phone: string; role: 'Руководитель' | 'Оператор'; line: typeof LINE_NAMES[number]; active: boolean }[] = [
  { name: 'Марина Соколова', email: 'marina@podderzhka-demo.ru', phone: '+7 903 410-30-01', role: 'Руководитель', line: '2-я линия', active: true },
  { name: 'Анна Волкова', email: 'anna@podderzhka-demo.ru', phone: '+7 903 410-30-02', role: 'Оператор', line: '1-я линия', active: true },
  { name: 'Игорь Белов', email: 'igor@podderzhka-demo.ru', phone: '+7 903 410-30-03', role: 'Оператор', line: '1-я линия', active: true },
  { name: 'Павел Смирнов', email: 'pavel@podderzhka-demo.ru', phone: '+7 903 410-30-04', role: 'Оператор', line: 'Биллинг', active: false },
  { name: 'Елена Морозова', email: 'e.morozova@podderzhka-demo.ru', phone: '+7 903 410-30-05', role: 'Оператор', line: '1-я линия', active: true },
  { name: 'Дмитрий Козлов', email: 'd.kozlov@podderzhka-demo.ru', phone: '+7 903 410-30-06', role: 'Оператор', line: '1-я линия', active: true },
  { name: 'Ольга Новикова', email: 'o.novikova@podderzhka-demo.ru', phone: '+7 903 410-30-07', role: 'Оператор', line: '1-я линия', active: true },
  { name: 'Сергей Васильев', email: 's.vasiliev@podderzhka-demo.ru', phone: '+7 903 410-30-08', role: 'Оператор', line: '1-я линия', active: true },
  { name: 'Наталья Павлова', email: 'n.pavlova@podderzhka-demo.ru', phone: '+7 903 410-30-09', role: 'Оператор', line: '1-я линия', active: true },
  { name: 'Алексей Фёдоров', email: 'a.fedorov@podderzhka-demo.ru', phone: '+7 903 410-30-10', role: 'Оператор', line: '1-я линия', active: true },
  { name: 'Юлия Михайлова', email: 'y.mikhailova@podderzhka-demo.ru', phone: '+7 903 410-30-11', role: 'Оператор', line: '1-я линия', active: true },
  { name: 'Андрей Николаев', email: 'a.nikolaev@podderzhka-demo.ru', phone: '+7 903 410-30-12', role: 'Оператор', line: '1-я линия', active: true },
  { name: 'Татьяна Орлова', email: 't.orlova@podderzhka-demo.ru', phone: '+7 903 410-30-13', role: 'Оператор', line: '1-я линия', active: true },
  { name: 'Максим Лебедев', email: 'm.lebedev@podderzhka-demo.ru', phone: '+7 903 410-30-14', role: 'Оператор', line: '1-я линия', active: false },
  { name: 'Виктория Соловьёва', email: 'v.solovieva@podderzhka-demo.ru', phone: '+7 903 410-30-15', role: 'Оператор', line: '2-я линия', active: true },
  { name: 'Роман Егоров', email: 'r.egorov@podderzhka-demo.ru', phone: '+7 903 410-30-16', role: 'Оператор', line: '2-я линия', active: true },
  { name: 'Екатерина Зайцева', email: 'e.zaitseva@podderzhka-demo.ru', phone: '+7 903 410-30-17', role: 'Оператор', line: '2-я линия', active: true },
  { name: 'Илья Крылов', email: 'i.krylov@podderzhka-demo.ru', phone: '+7 903 410-30-18', role: 'Оператор', line: '2-я линия', active: true },
  { name: 'Полина Макарова', email: 'p.makarova@podderzhka-demo.ru', phone: '+7 903 410-30-19', role: 'Оператор', line: '2-я линия', active: true },
  { name: 'Кирилл Андреев', email: 'k.andreev@podderzhka-demo.ru', phone: '+7 903 410-30-20', role: 'Оператор', line: '2-я линия', active: true },
  { name: 'Дарья Борисова', email: 'd.borisova@podderzhka-demo.ru', phone: '+7 903 410-30-21', role: 'Оператор', line: '2-я линия', active: false },
  { name: 'Артём Григорьев', email: 'a.grigoriev@podderzhka-demo.ru', phone: '+7 903 410-30-22', role: 'Оператор', line: '2-я линия', active: true },
  { name: 'Светлана Тихонова', email: 's.tikhonova@podderzhka-demo.ru', phone: '+7 903 410-30-23', role: 'Оператор', line: 'Биллинг', active: true },
  { name: 'Владимир Романов', email: 'v.romanov@podderzhka-demo.ru', phone: '+7 903 410-30-24', role: 'Оператор', line: 'Биллинг', active: true },
  { name: 'Алина Кузьмина', email: 'a.kuzmina@podderzhka-demo.ru', phone: '+7 903 410-30-25', role: 'Оператор', line: 'Биллинг', active: true },
  { name: 'Никита Савельев', email: 'n.saveliev@podderzhka-demo.ru', phone: '+7 903 410-30-26', role: 'Оператор', line: 'Биллинг', active: true },
  { name: 'Мария Власова', email: 'm.vlasova@podderzhka-demo.ru', phone: '+7 903 410-30-27', role: 'Оператор', line: 'Биллинг', active: true },
  { name: 'Глеб Чернов', email: 'g.chernov@podderzhka-demo.ru', phone: '+7 903 410-30-28', role: 'Оператор', line: 'Биллинг', active: false },
  { name: 'Ксения Демидова', email: 'k.demidova@podderzhka-demo.ru', phone: '+7 903 410-30-29', role: 'Оператор', line: '1-я линия', active: true },
  { name: 'Олег Баранов', email: 'o.baranov@podderzhka-demo.ru', phone: '+7 903 410-30-30', role: 'Оператор', line: '2-я линия', active: true },
]

function choiceId(tables: BuilderV2Table[], tableId: string, fieldId: string | undefined, name: string) {
  if (!fieldId) return ''
  const field = tables.find(table => table.id === tableId)?.fields.find(item => item.id === fieldId)
  return field?.choices?.find(choice => choice.name === name)?.id ?? ''
}

/** Replace the small demo operator roster with a ~30-person call-center set. Keeps ticket field ids intact. */
export function expandSupportLargeTeam(input: {
  kit: NonNullable<import('@tableapp/schema/app-v2').AppV2['support']>
  tables: BuilderV2Table[]
  rows: AppV2Record[]
}): AppV2Record[] {
  const { kit, tables } = input
  const roleOp = choiceId(tables, kit.operatorsTableId, kit.operator.role, 'Оператор')
  const roleOwner = choiceId(tables, kit.operatorsTableId, kit.operator.role, 'Руководитель')
  const active = choiceId(tables, kit.operatorsTableId, kit.operator.active, 'Активен')
  const inactive = choiceId(tables, kit.operatorsTableId, kit.operator.active, 'Неактивен')
  const lineOf = (name: string) => choiceId(tables, kit.operatorsTableId, kit.operator.line, name)
  const kept = input.rows.filter(row => row.tableId !== kit.operatorsTableId)
  const operators: AppV2Record[] = LARGE_OPERATORS.map((person, index) => {
    const values: Record<string, import('@tableapp/schema/app-v2').AppV2Json> = {
      [kit.operator.name]: person.name,
      [kit.operator.email]: person.email,
      [kit.operator.phone]: person.phone,
      [kit.operator.role]: person.role === 'Руководитель' ? roleOwner : roleOp,
      [kit.operator.active]: person.active ? active : inactive,
    }
    if (kit.operator.line) values[kit.operator.line] = lineOf(person.line)
    if (kit.operator.photo) values[kit.operator.photo] = SUPPORT_LARGE_PHOTO_POOL[index % SUPPORT_LARGE_PHOTO_POOL.length]!
    return { id: newId('row'), tableId: kit.operatorsTableId, values }
  })
  // Spread open load across on-shift operators so the compact block shows overloaded + free lists.
  const onShiftEmails = LARGE_OPERATORS.filter(person => person.active).map(person => person.email.toLowerCase())
  const openLoads = [8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 1, 2, 9, 3, 1, 0, 4, 2, 1, 0, 5, 2, 1, 0]
  const tickets = kept.map((row, index) => {
    if (row.tableId !== kit.ticketsTableId) return row
    const email = onShiftEmails[index % onShiftEmails.length]!
    const openTarget = openLoads[index % openLoads.length] ?? 1
    // Only reassign a subset so dashboard open-by-assignee varies realistically.
    if (openTarget <= 0 && String(row.values[kit.ticket.assigneeEmail] ?? '')) return row
    const values: Record<string, import('@tableapp/schema/app-v2').AppV2Json> = { ...row.values, [kit.ticket.assigneeEmail]: email }
    if (kit.ticket.line) {
      const person = LARGE_OPERATORS.find(item => item.email.toLowerCase() === email)
      if (person) {
        const ticketLine = choiceId(tables, kit.ticketsTableId, kit.ticket.line, person.line)
        if (ticketLine) values[kit.ticket.line] = ticketLine
      }
    }
    return { ...row, values }
  })
  // Extra synthetic open tickets to push a few operators past the overload threshold.
  const extra: AppV2Record[] = []
  const overloaded = onShiftEmails.slice(0, 3)
  for (const email of overloaded) {
    for (let i = 0; i < 6; i += 1) {
      const person = LARGE_OPERATORS.find(item => item.email.toLowerCase() === email)!
      const values: Record<string, import('@tableapp/schema/app-v2').AppV2Json> = {
        [kit.ticket.number]: `ОБР-${2000 + extra.length}`,
        [kit.ticket.subject]: `Нагрузка ${person.name.split(' ')[0]} · ${i + 1}`,
        [kit.ticket.description]: 'Учебное обращение для демонстрации перегрузки.',
        [kit.ticket.clientName]: 'Ирина Петрова',
        [kit.ticket.clientEmail]: 'i.petrova@mail.ru',
        [kit.ticket.assigneeEmail]: email,
        [kit.ticket.status]: kit.statuses.progress,
        [kit.ticket.priority]: kit.priorities.normal,
        [kit.ticket.createdAt]: new Date(Date.now() - (i + 1) * 3_600_000).toISOString(),
        [kit.ticket.updatedAt]: new Date(Date.now() - i * 1_800_000).toISOString(),
      }
      if (kit.ticket.line) values[kit.ticket.line] = choiceId(tables, kit.ticketsTableId, kit.ticket.line, person.line)
      extra.push({ id: newId('row'), tableId: kit.ticketsTableId, values })
    }
  }
  return [...tickets, ...extra, ...operators]
}
