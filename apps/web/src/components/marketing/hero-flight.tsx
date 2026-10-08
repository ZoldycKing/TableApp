'use client'

import { useEffect, useId, useRef } from 'react'
import { Icon } from '@/components/runtime/icons'
import { PRODUCTS } from './catalog-data'
import { DetailScreen } from './product-detail'
import { ProductView, type Shared } from './motion-lab/product-view'
import styles from './motion-lab/motion-lab.module.css'
import { useHeroDemo } from './use-hero-demo'

/** The same products morph once, then remain an interactive catalog. */
export function HeroFlight() {
  const root = useRef<HTMLDivElement>(null)
  const cards = useRef<Array<HTMLElement | null>>([])
  const backButton = useRef<HTMLButtonElement>(null)
  const focusTarget = useRef<'detail' | 'catalog' | null>(null)
  const { phase, pick, automatic, paused, running, reduced, open, back, replay, togglePause } = useHeroDemo(root)
  const prefix = `tableapp-hero-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const shared: Shared = (key) => ({ viewTransitionName: `${prefix}-${key}` })
  const product = PRODUCTS[pick]!
  const scene = phase === 'table' ? 0 : phase === 'mobile' ? 2 : 1
  const labels = ['Таблица', 'Каталог', 'Телефон']

  useEffect(() => {
    if (focusTarget.current !== phase) return
    if (phase === 'detail') backButton.current?.focus({ preventScroll: true })
    else if (phase === 'catalog') cards.current[pick]?.focus({ preventScroll: true })
    focusTarget.current = null
  }, [phase, pick])

  return <div ref={root} className={styles.heroDemo} data-hero-phase={phase}>
    <div className={styles.heroTop}>
      <span className={styles.heroTitle}><Icon name={phase === 'table' ? 'list' : 'smartphone'} className="size-4" />
        {phase === 'table' ? 'Таблица «Склад»' : 'Приложение «Склад»'}
      </span>
      <div className={styles.transport}>
        {automatic && !reduced && <button className={styles.control} type="button" onClick={togglePause}
          aria-label={paused ? 'Продолжить показ' : 'Приостановить показ'}>{paused ? 'Продолжить' : 'Пауза'}</button>}
        <button className={styles.control} type="button" aria-label="Повторить показ" onClick={() => { focusTarget.current = null; replay() }}>Повторить</button>
      </div>
    </div>
    <div className={styles.heroProgress} aria-label="Представление данных">
      {labels.map((label, index) => <span key={label} aria-current={scene === index ? 'step' : undefined}>
        <i data-active={scene === index} data-running={running} />{label}
      </span>)}
      <small>Данные примера</small>
    </div>
    <div className={`${styles.canvas} ${styles.heroCanvas}`}>
      {phase === 'detail' ? <div className={`${styles.productFrame} ${styles.mobile} ${styles.detailFrame}`} style={shared('products-frame')}>
        <div className={styles.chrome}>
          <button ref={backButton} type="button" className={styles.back} aria-label="Вернуться в витрину"
            onClick={() => { focusTarget.current = 'catalog'; back() }}><Icon name="back" className="size-4" /></button>
          <span>{product.short}</span>
        </div>
        <DetailScreen item={product} shared={(part) => shared(part === 'screen' ? `products-record-${pick}` : `products-${part === 'image' ? 'photo' : part}-${pick}`)} />
      </div> : <ProductView mode={phase} shared={shared} cardRef={(index, node) => { cards.current[index] = node }}
        onOpen={(index) => { focusTarget.current = 'detail'; open(index) }} />}
    </div>
    <p className={styles.heroCaption}>
      {phase === 'table' ? 'Одни данные — разные представления.' : phase === 'mobile' ? 'Те же товары — в приложении на телефоне.' : phase === 'detail' ? 'Нажатие открывает строку целиком — с фото, ценой, остатком и адресом склада' : 'Витрина собрана: весь склад на экране'}
    </p>
  </div>
}
