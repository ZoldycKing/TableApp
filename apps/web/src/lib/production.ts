/**
 * Расчёт расхода материалов по нормам.
 *
 * Чистый модуль: ни базы, ни запроса, ни текущего времени. Так и задумано —
 * этот расчёт показывают человеку в предпросмотре **до** сохранения и по нему же
 * списывают материалы **при** сохранении. Разойдись эти два числа хоть раз,
 * и доверия к расчёту не будет уже никогда: человек увидит на экране одно,
 * а в журнале склада другое.
 *
 * Поэтому здесь одна функция на оба случая, и ни одна из сторон своей копии
 * формулы не держит.
 */

export type Norm = {
  materialId: string
  /** Сколько материала уходит на одну единицу продукции. */
  perUnit: number
}

export type Need = { materialId: string; amount: number }

/**
 * Знаков после запятой, до которых округляем.
 *
 * Двоичная дробь не хранит 0,0003 точно: 18 500 × 0,0003 даёт
 * 5,550000000000001. Такое число попадёт и в журнал, и на экран, и человек
 * с калькулятором решит, что продукт считает неправильно. Шести знаков
 * хватает любому реальному расходу — граммы на изделие это уже перебор.
 */
const PLACES = 6
const SCALE = 10 ** PLACES

export function round(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * SCALE) / SCALE
}

/**
 * Сколько материалов уйдёт на такой выпуск.
 *
 * Нормы приходят уже отобранными: что применять, а что нет, решает вызывающий
 * по отметке «Действует». Здесь только умножение — и округление, без которого
 * в журнал попадает двоичный мусор.
 *
 * Нулевые и отрицательные нормы отбрасываются: строка нормы без числа — это
 * незаполненная строка, а не указание списать ноль. Нулевые движения засоряли
 * бы журнал и ничего не значили.
 */
export function needFor(quantity: number, norms: readonly Norm[]): Need[] {
  if (!Number.isFinite(quantity) || quantity <= 0) return []

  const total = new Map<string, number>()
  for (const norm of norms) {
    if (!Number.isFinite(norm.perUnit) || norm.perUnit <= 0) continue
    // Две строки на один материал складываются, а не затирают друг друга:
    // так бывает, когда норму разбили по операциям.
    total.set(norm.materialId, (total.get(norm.materialId) ?? 0) + norm.perUnit * quantity)
  }

  return [...total.entries()]
    .map(([materialId, amount]) => ({ materialId, amount: round(amount) }))
    .filter((need) => need.amount > 0)
}

export type Shortage = {
  materialId: string
  need: number
  stock: number
  /** Сколько не хватает. Всегда больше нуля: иначе это не нехватка. */
  missing: number
}

/**
 * Чего не хватит на складе.
 *
 * Считается для предупреждения, а не для запрета. Настоящий склад расходится
 * с учётом — материал привезли и не записали, остаток поправят вечером, —
 * и остановить смену из-за расхождения в учёте значит остановить дело
 * ради порядка в таблице. Человеку показывают, чего не хватает, и дают
 * решить самому.
 */
export function shortagesOf(
  needs: readonly Need[],
  stock: ReadonlyMap<string, number>,
): Shortage[] {
  const out: Shortage[] = []
  for (const need of needs) {
    const have = stock.get(need.materialId) ?? 0
    const missing = round(need.amount - have)
    if (missing > 0) out.push({ materialId: need.materialId, need: need.amount, stock: have, missing })
  }
  return out
}

/**
 * Сколько строк появится при сохранении выпуска.
 *
 * Нужно до транзакции: потолок тарифа проверяется на **всю** операцию сразу.
 * Проверить только строку выпуска значило бы пропустить её при полном складе
 * и получить выпуск без списаний — то есть молча разошедшийся учёт.
 */
export function rowsToCreate(needs: readonly Need[]): number {
  return 1 + needs.length
}
