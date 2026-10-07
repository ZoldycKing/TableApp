export function Logo({
  className = '',
  /**
   * Классы для слова «TableApp».
   *
   * Свёрнутой панели нужен только знак, и сжимается слово вместе с ней —
   * плавно. Как именно, решает вызывающий: у панели это анимация ширины,
   * у телефона и страниц сайта слово видно всегда.
   */
  wordClassName = '',
}: {
  className?: string
  wordClassName?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden className="shrink-0">
        <rect x="1" y="1" width="24" height="24" rx="7" className="fill-sage-500" />
        <rect x="6" y="7" width="14" height="2.6" rx="1.3" fill="white" opacity="0.95" />
        <rect x="6" y="12" width="9" height="2.6" rx="1.3" fill="white" opacity="0.72" />
        <rect x="6" y="17" width="11" height="2.6" rx="1.3" fill="white" opacity="0.5" />
      </svg>
      <span
        className={`overflow-hidden font-display text-[17px] font-extrabold tracking-tight text-ink ${wordClassName}`}
      >
        TableApp
      </span>
    </span>
  )
}
