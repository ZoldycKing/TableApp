'use client'

import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '@/components/runtime/icons'
import { PRODUCTS, type Product } from '../catalog-data'
import { ProductGlyph } from '../product-glyph'
import styles from './motion-lab.module.css'

export type Shared = (key: string) => CSSProperties
const money = (amount: number) => amount.toLocaleString('ru-RU')
const numericPrice = (product: Product) => Number(product.price.replace(/\s/g, ''))

export function Chrome({ title, icon = 'grid', children }: { title: string; icon?: string; children?: ReactNode }) {
  return <div className={styles.chrome}><span><Icon name={icon} className="size-4" />{title}</span>{children ?? <small>4 товара</small>}</div>
}

export function ProductView({ mode, shared, scope = 'products', products = PRODUCTS, owner = false, client = false, highlight = false, highlightIndex = 1, onOpen, cardRef }: {
  mode: 'table' | 'catalog' | 'mobile'; shared: Shared; scope?: string; products?: Product[]; owner?: boolean; client?: boolean; highlight?: boolean
  onOpen?: (index: number) => void; cardRef?: (index: number, node: HTMLElement | null) => void
  highlightIndex?: number
}) {
  return (
    <div className={`${styles.productFrame} ${styles[mode]}`} data-owner={owner} style={shared(`${scope}-frame`)}>
      <Chrome title={mode === 'table' ? 'Таблица «Склад»' : 'Каталог инструментов'} icon={mode === 'table' ? 'list' : mode === 'mobile' ? 'smartphone' : 'grid'} />
      {mode === 'table' && <div className={styles.tableHead}><span>Товар</span><span>Цена, ₽</span>{owner && <span>Закупка, ₽</span>}<span>Остаток</span></div>}
      <div className={styles.productRecords}>
        {products.map((product, index) => {
          const Record = onOpen ? 'button' : 'article'
          return <Record key={product.code} data-product-code={product.code} data-highlight={highlight && index === highlightIndex}
            type={onOpen ? 'button' : undefined} aria-label={onOpen ? `Открыть ${product.short}` : undefined}
            onClick={onOpen ? () => onOpen(index) : undefined} ref={(node) => cardRef?.(index, node)}
            className={styles.product} style={shared(`${scope}-record-${index}`)}>
            <span className={`${styles.photo} ${product.tint} ${product.ink}`} style={shared(`${scope}-photo-${index}`)}>
              <ProductGlyph kind={product.glyph} className={styles.glyph} />
            </span>
            <span className={styles.productName} style={shared(`${scope}-name-${index}`)} title={product.name}>{product.short}<small>{product.code}</small></span>
            <strong className={styles.price} style={shared(`${scope}-price-${index}`)}>{product.price}<small> ₽</small></strong>
            {owner && <span className={styles.cost}>{money(Math.round(numericPrice(product) * 0.6))}</span>}
            <span className={styles.stock} data-empty={product.stock === 0} style={shared(`${scope}-stock-${index}`)}>
              {client ? product.stock > 0 ? 'В наличии' : 'Под заказ' : `${product.stock} шт`}
            </span>
          </Record>
        })}
      </div>
      <div className={styles.frameFoot}><Icon name="check" className="size-3.5" />{client ? 'Доступность и цены для клиента' : 'Одна таблица · те же четыре товара'}</div>
    </div>
  )
}
