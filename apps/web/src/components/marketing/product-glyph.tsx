export type GlyphKind =
  | 'drill'
  | 'driver'
  | 'bits'
  | 'level'
  | 'ac'
  | 'box'
  | 'service'
  | 'flat'
  | 'plot'
  | 'office'

/**
 * Условный силуэт товара вместо фотографии.
 * Выдуманное фото обмануло бы ожидания, а пустой серый прямоугольник ничего
 * не объясняет — силуэт честно показывает, что в карточке есть картинка.
 */
export function ProductGlyph({ kind, className = '' }: { kind: GlyphKind; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {kind === 'drill' ? (
        <>
          <rect x="8" y="17" width="19" height="11" rx="3" />
          <path d="M27 21h13v3H27z" />
          <path d="M14 28v8h7v-8" />
        </>
      ) : null}

      {kind === 'driver' ? (
        <>
          <rect x="11" y="13" width="13" height="12" rx="3" />
          <path d="M24 18h13" />
          <path d="M15 25v11h6V25" />
        </>
      ) : null}

      {kind === 'ac' ? (
        <>
          <rect x="7" y="13" width="34" height="13" rx="4" />
          <path d="M12 20h24" />
          <path d="M15 31c2 3 4 3 6 0M27 31c2 3 4 3 6 0" />
        </>
      ) : null}

      {kind === 'box' ? (
        <>
          <path d="M8 17 24 10l16 7v14L24 38 8 31z" />
          <path d="M8 17l16 7 16-7M24 24v14" />
        </>
      ) : null}

      {kind === 'service' ? (
        <>
          <path d="M29 12a7 7 0 0 0 9 9l-16 16a3.5 3.5 0 0 1-5-5z" />
          <path d="M14 34h.01" />
        </>
      ) : null}

      {kind === 'flat' ? (
        <>
          <path d="M9 22 24 11l15 11" />
          <path d="M13 21v16h22V21" />
          <rect x="20" y="27" width="8" height="10" rx="1" />
        </>
      ) : null}

      {kind === 'plot' ? (
        <>
          <path d="M8 34h32" />
          <path d="M12 34V20l8-5 8 5v14" />
          <path d="M32 34V24l6-3" />
        </>
      ) : null}

      {kind === 'office' ? (
        <>
          <rect x="11" y="12" width="26" height="25" rx="2" />
          <path d="M17 18h4M27 18h4M17 25h4M27 25h4M22 37v-6h4v6" />
        </>
      ) : null}

      {kind === 'bits' ? (
        <>
          <rect x="10" y="14" width="6" height="20" rx="2" />
          <rect x="21" y="14" width="6" height="20" rx="2" />
          <rect x="32" y="14" width="6" height="20" rx="2" />
        </>
      ) : null}

      {kind === 'level' ? (
        <>
          <rect x="7" y="19" width="34" height="11" rx="3" />
          <circle cx="24" cy="24.5" r="3" />
          <path d="M14 24.5h2M32 24.5h2" />
        </>
      ) : null}
    </svg>
  )
}
