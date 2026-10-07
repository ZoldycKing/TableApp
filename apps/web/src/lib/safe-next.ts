/**
 * Куда вести человека после входа.
 *
 * Адрес приходит из ссылки, по которой он пришёл, поэтому принимается только
 * внутренний путь. «https://…» и «//чужой.сайт» — это увод человека с нашего
 * продукта по ссылке, которая выглядит как наша: классический открытый редирект.
 */
export function safeNext(value: string | undefined | null): string | null {
  if (!value) return null
  if (!value.startsWith('/')) return null
  // «//host» и «/\host» браузер понимает как другой сайт, а не как наш путь.
  if (value.startsWith('//') || value.startsWith('/\\')) return null
  return value
}
