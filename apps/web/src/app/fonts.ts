import localFont from 'next/font/local'

/**
 * IBM Plex Sans — основной шрифт. Ось wdth 75–100 даёт сжатые заголовки
 * (font-stretch). Файлы рядом, с кириллицей и латиницей, без запроса к Google.
 */
export const plexSans = localFont({
  src: './fonts/ibm-plex-sans.woff2',
  variable: '--font-scatta-sans',
  display: 'swap',
  weight: '100 700',
  adjustFontFallback: false,
})

export const plexSansItalic = localFont({
  src: './fonts/ibm-plex-sans-italic.woff2',
  variable: '--font-scatta-sans-italic',
  display: 'swap',
  style: 'italic',
  weight: '100 700',
  adjustFontFallback: false,
})

export const plexMono = localFont({
  src: [
    { path: './fonts/ibm-plex-mono-regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-mono-medium.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-scatta-mono',
  display: 'swap',
  adjustFontFallback: false,
})

/** Piazzolla Italic — редкий акцентный курсив, не для интерфейсного текста. */
export const piazzolla = localFont({
  src: './fonts/piazzolla-italic.woff2',
  variable: '--font-piazzolla',
  display: 'swap',
  style: 'italic',
  weight: '100 900',
  adjustFontFallback: false,
})

/** Прежний Onest оставлен переменной, пока кабинет не переведён целиком. */
export const onest = localFont({
  src: './fonts/onest-variable.ttf',
  variable: '--font-onest',
  display: 'swap',
  weight: '400 700',
})
