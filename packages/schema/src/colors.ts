/** Палитра для вариантов выбора, канбан-колонок и оформления приложений. */
export const COLORS = [
  'gray', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal',
  'cyan', 'blue', 'indigo', 'violet', 'purple', 'pink', 'rose',
] as const

export type Color = (typeof COLORS)[number]

export const DEFAULT_COLOR: Color = 'gray'
