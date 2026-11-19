/**
 * Логотип Scatta для светлых и тёмных поверхностей.
 *
 * В шапках — lockup (знак + слово). В узкой полоске кабинета и там,
 * где места мало, — только знак. Соотношение сторон не растягиваем.
 *
 * Высота задаётся через `--logo-h` (по умолчанию из prop `height`), чтобы
 * медиаправила могли уменьшить логотип на телефоне без inline-конфликта.
 */

const LOCKUP_RATIO = 668.07 / 199

export function Logo({
  className = '',
  /**
   * Только знак: свёрнутая боковая панель и тесная шапка телефона.
   */
  mark = false,
  /**
   * Lockup для тёмного фона (белый знак и слово).
   */
  reversed = false,
  /** Высота по умолчанию; CSS может переопределить через `--logo-h`. */
  height = 26,
}: {
  className?: string
  mark?: boolean
  reversed?: boolean
  height?: number
}) {
  const src = mark
    ? reversed
      ? '/brand/svg/mark-reversed.svg'
      : '/brand/svg/mark.svg'
    : reversed
      ? '/brand/svg/lockup-reversed.svg'
      : '/brand/svg/lockup.svg'
  const width = mark ? height : Math.round(height * LOCKUP_RATIO)

  return (
    <img
      src={src}
      alt="Scatta"
      width={width}
      height={height}
      draggable={false}
      className={`block shrink-0 ${className}`}
      style={{
        ['--logo-h' as string]: `${height}px`,
        height: 'var(--logo-h)',
        width: 'auto',
        maxHeight: 'var(--logo-h)',
      }}
    />
  )
}
