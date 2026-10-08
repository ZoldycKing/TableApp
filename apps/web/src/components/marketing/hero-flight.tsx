'use client'

import { useEffect, useId, useRef } from 'react'
import { Icon } from '@/components/runtime/icons'
import { ProductGlyph } from './product-glyph'
import { ProductView, type Shared } from './motion-lab/product-view'
import { BuilderScene, StockScreen } from './hero-stock'
import frame from './motion-lab/motion-lab.module.css'
import styles from './hero-story.module.css'
import { useHeroDemo } from './use-hero-demo'

/** One complete table → builder → employee → source story, then a working sample. */
export function HeroFlight() {
  const root = useRef<HTMLDivElement>(null)
  const cards = useRef<Array<HTMLElement | null>>([])
  const backButton = useRef<HTMLButtonElement>(null)
  const resultButton = useRef<HTMLButtonElement>(null)
  const focusTarget = useRef<'detail' | 'mobile' | 'result' | null>(null)
  const demo = useHeroDemo(root)
  const { phase, pick, products, receipt, quantity, error, automatic, paused, running, reduced, open, back, replay, togglePause, editQuantity, save } = demo
  const prefix = `tableapp-hero-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const shared: Shared = (key) => ({ viewTransitionName: `${prefix}-${key}` })
  const product = products[pick]!
  const scene = phase === 'table' ? 0 : phase === 'builder' ? 1 : phase === 'result' || (phase === 'mobile' && receipt) ? 3 : 2
  const labels = ['Таблица', 'Настройка', 'Работа', 'Результат']
  const isForm = phase === 'receipt' || phase === 'detail'

  useEffect(() => {
    if (focusTarget.current !== phase) return
    if (phase === 'detail') backButton.current?.focus({ preventScroll: true })
    if (phase === 'mobile') cards.current[pick]?.focus({ preventScroll: true })
    if (phase === 'result') resultButton.current?.focus({ preventScroll: true })
    focusTarget.current = null
  }, [phase, pick])

  const returnToApp = () => { focusTarget.current = 'mobile'; back() }

  return <div ref={root} className={frame.heroDemo} data-hero-phase={phase}>
    <div className={frame.heroTop}>
      <span className={frame.heroTitle}><Icon name={phase === 'table' || phase === 'result' ? 'list' : phase === 'builder' ? 'gear' : 'smartphone'} className="size-4" />
        {phase === 'builder' ? 'Из таблицы — в приложение' : phase === 'table' || phase === 'result' ? 'Таблица «Склад»' : 'Приложение «Склад»'}
      </span>
      <div className={frame.transport}>
        {automatic && !reduced && <button className={frame.control} type="button" onClick={togglePause}
          aria-label={paused ? 'Продолжить показ' : 'Приостановить показ'}>{paused ? 'Продолжить' : 'Пауза'}</button>}
        <button className={frame.control} type="button" aria-label="Повторить показ" onClick={() => { focusTarget.current = null; replay() }}>Повторить</button>
      </div>
    </div>
    <div className={frame.heroProgress} aria-label="Как работает TableApp">
      {labels.map((label, index) => <span key={label} aria-current={scene === index ? 'step' : undefined}>
        <i data-active={scene === index} data-running={running} />{label}
      </span>)}
      <small>Данные примера</small>
    </div>
    <div className={`${frame.canvas} ${frame.heroCanvas}`}>
      {phase === 'table' && <ProductView mode="table" products={products} shared={shared} />}
      {phase === 'builder' && <BuilderScene products={products} shared={shared} />}
      {phase === 'mobile' && <div className={styles.receiptLayout}>
        <StockScreen products={products} shared={shared} cardRef={(index, node) => { cards.current[index] = node }}
          onOpen={(index) => { focusTarget.current = 'detail'; open(index) }} />
        {receipt && <div className={styles.sourceLink} data-source-stock={products[receipt.index]!.stock}>
          <span><Icon name="check" className="size-3.5" />В таблице «Склад» и в приложении</span>
          <div><span>{products[receipt.index]!.short}</span><strong>{products[receipt.index]!.stock} шт</strong></div>
        </div>}
      </div>}
      {isForm && <div className={styles.receiptLayout}>
        <div className={`${styles.phone} ${styles.receiptPhone}`} style={shared('products-frame')}>
          <div className={styles.receiptTop}>
            <button ref={backButton} type="button" className={styles.back} aria-label="Вернуться к товарам" onClick={returnToApp}><Icon name="back" className="size-4" /></button>
            <span>Приёмка товара</span>
          </div>
          <form className={styles.form} onSubmit={(event) => {
            event.preventDefault()
            focusTarget.current = 'result'
            save()
          }}>
            <div className={styles.selected} style={shared(`products-record-${pick}`)}>
              <span className={`${styles.photo} ${product.tint} ${product.ink}`} style={shared(`products-photo-${pick}`)}><ProductGlyph kind={product.glyph} className="size-8" /></span>
              <span className={styles.name} style={shared(`products-name-${pick}`)}>{product.name}<small>{product.code}</small></span>
            </div>
            <div className={styles.stockBefore}><span>Сейчас на складе</span><strong style={shared(`products-stock-${pick}`)}>{product.stock} шт</strong></div>
            <label htmlFor={`${prefix}-quantity`} className={styles.label}>Принято, шт</label>
            <input id={`${prefix}-quantity`} className={styles.input} type="number" inputMode="numeric" min="1" max="999" step="1" required
              value={quantity} onFocus={() => editQuantity(quantity)} onChange={(event) => editQuantity(event.target.value)} aria-describedby={error ? `${prefix}-error` : undefined} aria-invalid={!!error} />
            {error && <p id={`${prefix}-error`} className={styles.error} role="alert">{error}</p>}
            <button type="submit" className={styles.submit} aria-label="Сохранить приёмку"><Icon name="check" className="size-4" />Принять {quantity || '…'} шт</button>
          </form>
        </div>
        <div className={styles.sourceLink} data-source-stock={product.stock}>
          <span><Icon name="list" className="size-3.5" />Исходная таблица «Склад»</span>
          <div><span>{product.short}</span><strong>{product.stock} шт</strong></div>
        </div>
      </div>}
      {phase === 'result' && receipt && <div className={styles.result}>
        <div className={styles.confirmation} role="status">
          <Icon name="check" className="size-4" />
          <div>Принято {receipt.quantity} шт · остаток {receipt.before} → {receipt.after}<small>{products[receipt.index]!.short} · запись обновлена</small></div>
          <button ref={resultButton} type="button" onClick={returnToApp}>Открыть приложение</button>
        </div>
        <ProductView mode="table" products={products} shared={shared} highlight highlightIndex={receipt.index} />
      </div>}
    </div>
    <p className={frame.heroCaption}>
      {phase === 'table' ? 'Всё начинается с ваших данных: товары, цены и остатки в одной таблице.'
        : phase === 'builder' ? 'Выбираете поля, действие и роль — сотруднику доступны нужные экраны и данные.'
        : isForm ? 'Сотрудник принимает товар с телефона. Сохранение изменит остаток в общей таблице.'
        : phase === 'result' ? 'Действие в приложении обновило исходные данные. Вручную переносить их не нужно.'
        : receipt ? 'Одни данные в таблице и приложении. Попробуйте принять ещё товар — нажмите на строку.'
        : 'У кладовщика свой рабочий экран: товары, остатки и приёмка. Цены ему не показаны.'}
    </p>
  </div>
}
