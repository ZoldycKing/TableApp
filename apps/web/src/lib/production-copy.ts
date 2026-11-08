export const PRODUCTION_CANCEL_WARNING = 'Выпуск будет удалён, материалы вернутся на склад. Чтобы исправить количество, отмените выпуск и создайте новый.'
export const LEGACY_PRODUCTION_CANCEL_WARNING = 'Выпуск уйдёт вместе со своими списаниями, и материалы вернутся на склад. Так исправляют ошибку ввода: менять количество в сохранённом выпуске нельзя — списания уже записаны числами, и правка развела бы их с журналом.'

/** Older generated apps get the current default; authored explanations stay intact. */
export function productionCancellationCopy(value: unknown, connected: boolean): unknown {
  if (value !== LEGACY_PRODUCTION_CANCEL_WARNING && value !== PRODUCTION_CANCEL_WARNING) return value
  return connected ? `${PRODUCTION_CANCEL_WARNING} Готовая продукция этого выпуска будет убрана со склада.` : PRODUCTION_CANCEL_WARNING
}
