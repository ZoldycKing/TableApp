export type CoverKind = 'tool' | 'cooling' | 'apartment' | 'office' | 'plot' | 'parcel'

/**
 * Обложка карточки в витрине.
 *
 * Не фотография и не серый силуэт в пустом поле. Фотографий товара у нас нет
 * и быть не может: чужой снимок в демонстрации обещал бы чужой товар, а купить
 * его здесь нельзя. Поэтому обложки нарисованы нами — это собственная графика,
 * без чужих прав, и видно, что это рисунок, а не подмена снимка.
 *
 * Зачем вообще рисунок, а не заливка: в карточке товара или объекта есть
 * колонка с изображением, и витрина без обложек показывала бы продукт
 * беднее, чем он есть. Когда у владельца появятся свои фотографии, они встанут
 * на это же место — колонка под них в шаблонах уже заведена.
 */
export function CoverArt({ kind, className = '' }: { kind: CoverKind; className?: string }) {
  return (
    <svg viewBox="0 0 160 96" role="presentation" aria-hidden className={className}>
      <defs>
        <linearGradient id={`sky-${kind}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-sand-100)" />
          <stop offset="1" stopColor="var(--color-sand-200)" />
        </linearGradient>
      </defs>

      <rect width="160" height="96" fill={`url(#sky-${kind})`} />

      {kind === 'tool' ? (
        <g>
          {/* Верстак и перфоратор: мастерская, а не склад абстракций. */}
          <rect x="0" y="70" width="160" height="26" fill="var(--color-sand-300)" />
          <rect x="34" y="38" width="54" height="26" rx="7" fill="var(--color-ink)" />
          <rect x="88" y="46" width="38" height="9" rx="3" fill="var(--color-ink-muted)" />
          <path d="M44 64v14h15V64z" fill="var(--color-ink)" />
          <circle cx="51" cy="78" r="4" fill="var(--color-sand-100)" />
          <rect x="106" y="60" width="28" height="4" rx="2" fill="var(--color-clay-500)" />
        </g>
      ) : null}

      {kind === 'cooling' ? (
        <g>
          {/* Сплит-система на стене: тот самый товар сервисной службы. */}
          <rect x="0" y="76" width="160" height="20" fill="var(--color-sand-300)" />
          <rect x="30" y="30" width="100" height="30" rx="8" fill="var(--color-ink)" />
          <rect x="38" y="40" width="84" height="5" rx="2.5" fill="var(--color-sand-100)" opacity="0.7" />
          <path
            d="M52 66c4 7 8 7 12 0M84 66c4 7 8 7 12 0"
            stroke="var(--color-sage-500)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      ) : null}

      {kind === 'apartment' ? (
        <g>
          {/* Дом с окнами: одно окно светится — квартира, а не чертёж. */}
          <rect x="0" y="80" width="160" height="16" fill="var(--color-sage-200)" />
          <path d="M26 46 80 18l54 28v34H26z" fill="var(--color-ink)" />
          <rect x="44" y="52" width="16" height="14" rx="2" fill="var(--color-sand-100)" />
          <rect x="72" y="52" width="16" height="14" rx="2" fill="var(--color-clay-400)" />
          <rect x="100" y="52" width="16" height="14" rx="2" fill="var(--color-sand-100)" />
          <rect x="70" y="68" width="20" height="12" rx="2" fill="var(--color-sand-200)" />
        </g>
      ) : null}

      {kind === 'office' ? (
        <g>
          {/* Офисное здание: ряды окон и вход со стеклом. */}
          <rect x="0" y="80" width="160" height="16" fill="var(--color-sage-200)" />
          <rect x="34" y="16" width="92" height="64" rx="4" fill="var(--color-ink)" />
          {[24, 40, 56].map((y) =>
            [44, 66, 88, 106].map((x) => (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width="14"
                height="10"
                rx="1.5"
                fill={y === 40 && x === 66 ? 'var(--color-clay-400)' : 'var(--color-sand-100)'}
                opacity={y === 40 && x === 66 ? 1 : 0.85}
              />
            )),
          )}
          <rect x="70" y="68" width="20" height="12" rx="1.5" fill="var(--color-sand-200)" />
        </g>
      ) : null}

      {kind === 'plot' ? (
        <g>
          {/* Участок: межа, колышки и дерево — то, что видно на выезде. */}
          <rect x="0" y="62" width="160" height="34" fill="var(--color-sage-200)" />
          <path d="M14 62 80 44l66 18" stroke="var(--color-sage-500)" strokeWidth="3" fill="none" />
          {[26, 56, 104, 134].map((x) => (
            <rect key={x} x={x} y="56" width="3" height="18" rx="1.5" fill="var(--color-ink-muted)" />
          ))}
          <circle cx="112" cy="38" r="14" fill="var(--color-sage-500)" />
          <rect x="110" y="48" width="4" height="16" rx="2" fill="var(--color-ink-muted)" />
        </g>
      ) : null}

      {kind === 'parcel' ? (
        <g>
          {/* Коробка с лентой: посылка в доставке. */}
          <rect x="0" y="74" width="160" height="22" fill="var(--color-sand-300)" />
          <path d="M44 34h72v40H44z" fill="var(--color-ink)" />
          <path d="M44 34 80 20l36 14-36 12z" fill="var(--color-ink-muted)" />
          <rect x="74" y="34" width="12" height="40" fill="var(--color-clay-400)" />
          <path d="M74 46h12" stroke="var(--color-sand-100)" strokeWidth="2" />
        </g>
      ) : null}
    </svg>
  )
}
