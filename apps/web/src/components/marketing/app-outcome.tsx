'use client'

import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Icon } from '@/components/runtime/icons'
import { PRODUCTS } from './catalog-data'
import { ProductObject } from './product-object'
import { useDemoRecords } from './demo-records'
import styles from './app-outcome.module.css'

/** The same records, spread into the three views the visitor has just seen. */
export function AppOutcome() {
  const root = useRef<HTMLDivElement>(null)
  const products = useDemoRecords()?.products ?? PRODUCTS
  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const node = root.current!
      const panels = node.querySelectorAll<HTMLElement>('[data-outcome-panel]')
      const timeline = gsap.timeline({ scrollTrigger: { trigger: node, start: 'top 95%', end: 'top 28%', scrub: .5 } })
      panels.forEach((panel, index) => {
        timeline.fromTo(panel,
          { y: [150, 190, 130][index], xPercent: [12, 0, -12][index], rotation: [-3, 2, 4][index], scale: .88 },
          { y: 0, xPercent: 0, rotation: 0, scale: 1, duration: 1, ease: 'power2.out' }, index * .08)
      })
      return () => { timeline.scrollTrigger?.kill(); timeline.revert() }
    })
    return () => media.revert()
  }, [])
  const featured = products[1]!
  return <div ref={root} className={styles.outcome} data-outcome data-ui aria-hidden="true">
    <div className={styles.table} data-outcome-panel>
      <div className={styles.chrome}><Icon name="grid" className="size-4" />Склад.xlsx<span>4 товара</span></div>
      <div className={styles.tableHead}><span>Товар</span><span>Цена, ₽</span><span>Остаток</span></div>
      {products.map(product => <div key={product.code} data-record={product.code} className={styles.row}><span>{product.short}</span><span>{product.price}</span><strong>{product.stock} шт</strong></div>)}
    </div>
    <div className={styles.customer} data-outcome-panel>
      <div className={styles.chrome}><Icon name="grid" className="size-4" />Каталог<span>Покупатель</span></div>
      <div className={styles.product}><ProductObject kind={featured.glyph} /></div>
      <div className={styles.productInfo}><strong>{featured.short}</strong><span>{featured.code}</span><b>{featured.price} ₽</b></div>
      <div className={styles.customerAction}>Подробнее о товаре <span>→</span></div>
    </div>
    <div className={styles.employee} data-outcome-panel>
      <div className={styles.chrome}><Icon name="users" className="size-4" />Склад<span>Сотрудник</span></div>
      <div className={styles.stockList}>{products.map(product => <div key={product.code} data-record={product.code}><strong>{product.short}</strong><span>{product.stock} шт</span></div>)}</div>
      <div className={styles.employeeAction}><Icon name="plus" className="size-4" />Принять товар</div>
      <div className={styles.bottomNav}><Icon name="box" className="size-4" /><Icon name="clipboard" className="size-4" /><Icon name="users" className="size-4" /></div>
    </div>
  </div>
}
