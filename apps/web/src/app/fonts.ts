import localFont from 'next/font/local'

/**
 * Onest — фирменный шрифт Scatta (кириллица + латиница, 400–700).
 * Variable-файл лежит рядом, чтобы сборка не зависела от Google Fonts.
 */
export const onest = localFont({
  src: './fonts/onest-variable.ttf',
  variable: '--font-onest',
  display: 'swap',
  weight: '400 700',
})
