import { wallClockToInstant } from '@tableapp/schema'
import { PROKAT_ZONE, type ProkatCatalogItem } from './prokat-logic'

/** Fixed clock for the schedule screenshots: Friday 27.11.2026, 14:20 Moscow. */
export const PROKAT_SCHEDULE_AT = wallClockToInstant(
  { year: 2026, month: 11, day: 27, hour: 14, minute: 20, second: 0 },
  PROKAT_ZONE,
).getTime()

export const PROKAT_SCHEDULE_DAY = '2026-11-27'
export const SCHEDULE_DAY_START = 9 * 60
export const SCHEDULE_DAY_END = 20 * 60
export const SCHEDULE_NOW_MIN = 14 * 60 + 20

export type ScheduleTone = 'a' | 'p' | 'w' | 'br'

export type ScheduleColumn = ProkatCatalogItem & { off: boolean }

export type ScheduleBlock = {
  id: string
  itemId: string
  title: string
  service: string
  startMin: number
  endMin: number
  tone: ScheduleTone
  oneLine: boolean
  clientName: string
  phone: string
  visits: number
  price: number
  deposit: number
  source: string
  note: string
  history: { at: string; text: string; current?: boolean }[]
}

export type ScheduleGap = { itemId: string; startMin: number; endMin: number }

const PEOPLE: ReadonlyArray<readonly [string, string, number]> = [
  ['Мария', 'Петрова', 5],
  ['Алексей', 'Иванов', 2],
  ['Елена', 'Волкова', 4],
  ['Дмитрий', 'Соколов', 3],
  ['Ольга', 'Нечаева', 6],
  ['Кирилл', 'Ан', 1],
  ['Игорь', 'Лебедев', 8],
  ['Алина', 'Морозова', 2],
  ['Марина', 'Лосева', 3],
  ['Тимур', 'Галиев', 4],
  ['Светлана', 'Ким', 7],
  ['Юлия', 'Ким', 1],
  ['Павел', 'Орлов', 5],
  ['Анна', 'Смирнова', 9],
  ['Вера', 'Павлова', 2],
  ['Никита', 'Соловьёв', 3],
  ['Екатерина', 'Шульц', 4],
  ['Роман', 'Белов', 6],
  ['Дарья', 'Крылова', 2],
  ['Илья', 'Фомин', 1],
  ['Полина', 'Егорова', 5],
  ['Глеб', 'Макаров', 3],
  ['Анастасия', 'Орлова', 4],
  ['Сергей', 'Волков', 8],
]

type Slot = { from: number; to: number; tone: ScheduleTone; one?: boolean; note?: string }

/** Tiled across however many working columns the template provides. */
const PATTERN: readonly (readonly Slot[])[] = [
  [
    { from: 9 * 60, to: 10 * 60, tone: 'p' },
    { from: 10 * 60 + 30, to: 11 * 60, tone: 'p', one: true },
    { from: 11 * 60 + 30, to: 13 * 60 + 30, tone: 'p' },
    { from: 15 * 60, to: 17 * 60, tone: 'a', note: 'Забрать шлем и замок на выдаче.' },
    { from: 17 * 60 + 30, to: 19 * 60, tone: 'a' },
    { from: 19 * 60, to: 20 * 60, tone: 'a' },
  ],
  [
    { from: 9 * 60, to: 11 * 60, tone: 'p' },
    { from: 11 * 60 + 30, to: 12 * 60, tone: 'p', one: true },
    { from: 12 * 60 + 30, to: 14 * 60, tone: 'p' },
    { from: 14 * 60 + 30, to: 16 * 60 + 30, tone: 'a' },
    { from: 17 * 60, to: 19 * 60 + 30, tone: 'a' },
  ],
  [
    { from: 9 * 60, to: 11 * 60, tone: 'p' },
    { from: 12 * 60, to: 13 * 60, tone: 'br' },
    { from: 13 * 60, to: 14 * 60, tone: 'p' },
    { from: 15 * 60, to: 16 * 60 + 30, tone: 'w' },
    { from: 17 * 60, to: 19 * 60, tone: 'a' },
  ],
  [
    { from: 9 * 60 + 30, to: 12 * 60, tone: 'p' },
    { from: 16 * 60, to: 18 * 60, tone: 'a' },
    { from: 18 * 60, to: 18 * 60 + 30, tone: 'a', one: true },
    { from: 18 * 60 + 30, to: 20 * 60, tone: 'w' },
  ],
  [
    { from: 9 * 60, to: 11 * 60 + 30, tone: 'p' },
    { from: 12 * 60, to: 14 * 60, tone: 'p' },
    { from: 15 * 60 + 30, to: 18 * 60, tone: 'a' },
    { from: 18 * 60 + 30, to: 20 * 60, tone: 'a' },
  ],
]

function phoneOf(index: number) {
  const head = 900 + (index * 17) % 100
  const mid = String(100 + (index * 13) % 900).padStart(3, '0')
  const tail = String(10 + (index * 7) % 90).padStart(2, '0')
  const last = String((index * 3) % 100).padStart(2, '0')
  return `+7 ${head} ${mid}-${tail}-${last}`
}

function hhmm(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

export function scheduleColumns(items: readonly ProkatCatalogItem[]): ScheduleColumn[] {
  const usable = items.filter(item => item.name && item.status !== 'Списан')
  const off = usable.filter(item => item.status === 'На обслуживании')
  const working = usable.filter(item => item.status !== 'На обслуживании')
  const picked: ProkatCatalogItem[] = []
  for (const item of working) {
    if (picked.length >= 5) break
    picked.push(item)
  }
  if (off[0]) picked.push(off[0])
  for (const item of working) {
    if (picked.length >= 6) break
    if (!picked.some(column => column.id === item.id)) picked.push(item)
  }
  const marked = picked.map(item => ({ ...item, off: item.status === 'На обслуживании' }))
  if (marked.length > 1 && !marked.some(item => item.off)) marked[marked.length - 1] = { ...marked[marked.length - 1]!, off: true }
  return marked
}

export function columnGaps(blocks: readonly ScheduleBlock[], itemId: string): ScheduleGap[] {
  const mine = blocks.filter(block => block.itemId === itemId).sort((a, b) => a.startMin - b.startMin)
  const gaps: ScheduleGap[] = []
  let cursor = SCHEDULE_DAY_START
  for (const block of mine) {
    if (block.startMin - cursor >= 60) gaps.push({ itemId, startMin: cursor, endMin: block.startMin })
    cursor = Math.max(cursor, block.endMin)
  }
  if (SCHEDULE_DAY_END - cursor >= 60) gaps.push({ itemId, startMin: cursor, endMin: SCHEDULE_DAY_END })
  return gaps
}

/** At most two real gaps, and never a multi-hour void that would dominate the grid. */
export function visibleGaps(columns: readonly ScheduleColumn[], blocks: readonly ScheduleBlock[]): ScheduleGap[] {
  return columns
    .filter(column => !column.off)
    .flatMap(column => columnGaps(blocks, column.id))
    .filter(gap => gap.endMin - gap.startMin <= 150)
    .sort((a, b) => (a.endMin - a.startMin) - (b.endMin - b.startMin))
    .slice(0, 2)
}

export function buildProkatDaySchedule(items: readonly ProkatCatalogItem[]) {
  const columns = scheduleColumns(items)
  const working = columns.filter(column => !column.off)
  const blocks: ScheduleBlock[] = []
  working.forEach((column, columnIndex) => {
    const slots = PATTERN[columnIndex % PATTERN.length] ?? []
    slots.forEach((slot, slotIndex) => {
      const person = PEOPLE[(columnIndex * 5 + slotIndex) % PEOPLE.length]!
      const hours = Math.max(1, (slot.to - slot.from) / 60)
      const price = slot.tone === 'br' ? 0 : Math.round((column.rate || 900) * (column.tariff === 'За час' ? hours : 1))
      const wait = slot.tone === 'w'
      const pause = slot.tone === 'br'
      blocks.push({
        id: `day-${column.serial}-${slot.from}`,
        itemId: column.id,
        title: pause ? 'Обед' : wait ? 'Новая заявка' : `${person[0]} ${person[1]}`,
        service: pause ? '' : column.name,
        startMin: slot.from,
        endMin: slot.to,
        tone: slot.tone,
        oneLine: Boolean(slot.one) || slot.to - slot.from <= 45,
        clientName: pause ? '' : wait ? 'Новая заявка' : `${person[0]} ${person[1]}`,
        phone: pause ? '' : phoneOf(columnIndex * 5 + slotIndex),
        visits: person[2],
        price,
        deposit: pause || wait ? 0 : column.deposit,
        source: wait ? 'Сайт' : columnIndex % 2 === 0 ? 'Кабинет' : 'Телефон',
        note: slot.note ?? '',
        history: pause ? [] : [
          { at: '24.11.2026, 18:40', text: wait ? 'Заявка с сайта' : 'Клиент оставил заявку' },
          { at: '25.11.2026, 12:00', text: wait ? 'Ждёт подтверждения' : 'Запись подтверждена', current: wait },
          ...(wait ? [] : [{ at: '27.11.2026, 14:20', text: 'Ожидаем к выдаче', current: true }]),
        ],
      })
    })
  })
  const selected = blocks.find(block => block.tone === 'a' && block.note) ?? blocks.find(block => block.tone === 'a') ?? null
  return { columns, blocks, selectedId: selected?.id ?? null, delta: 4 }
}

export function scheduleClockLabel(min: number) {
  return hhmm(min)
}
