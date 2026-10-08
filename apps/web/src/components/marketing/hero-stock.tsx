'use client'

import { Icon } from '@/components/runtime/icons'
import type { Product } from './catalog-data'
import { ProductGlyph } from './product-glyph'
import { Chrome, type Shared } from './motion-lab/product-view'
import frame from './motion-lab/motion-lab.module.css'
import styles from './hero-story.module.css'

export function StockScreen({ products, shared, onOpen, cardRef, preview = false }: {
  products: Product[]; shared: Shared; onOpen?: (index: number) => void
  cardRef?: (index: number, node: HTMLElement | null) => void; preview?: boolean
}) {
  return <div className={`${frame.productFrame} ${styles.stockScreen} ${preview ? styles.preview : styles.phone}`} style={shared('products-frame')}>
    <Chrome title="Приложение «Склад»" icon="smartphone"><small>4 товара</small></Chrome>
    <div className={styles.role}><Icon name="users" className="size-3.5" />Кладовщик <span>Товары · Приёмка</span></div>
    <div className={styles.records}>
      {products.map((product, index) => {
        const Row = onOpen ? 'button' : 'article'
        return <Row key={product.code} className={styles.row} style={shared(`products-record-${index}`)} data-product-code={product.code}
          type={onOpen ? 'button' : undefined} aria-label={onOpen ? `Открыть ${product.short}` : undefined}
          onClick={onOpen ? () => onOpen(index) : undefined} ref={(node) => cardRef?.(index, node)}>
          <span className={`${styles.photo} ${product.tint} ${product.ink}`} style={shared(`products-photo-${index}`)}><ProductGlyph kind={product.glyph} className="size-7" /></span>
          <span className={styles.name} style={shared(`products-name-${index}`)}>{product.short}<small>{product.code}</small></span>
          <strong style={shared(`products-stock-${index}`)}>{product.stock} шт</strong>
          {onOpen && <span className={styles.rowAction}>Принять товар <Icon name="plus" className="size-3" /></span>}
        </Row>
      })}
    </div>
    <div className={frame.frameFoot}><Icon name="check" className="size-3.5" />{onOpen ? 'Выберите товар для приёмки' : 'Название и остаток · без цен'}</div>
  </div>
}

/** A small illustration of existing screen/field/role settings, not a second builder. */
export function BuilderScene({ products, shared }: { products: Product[]; shared: Shared }) {
  return <div className={styles.builder}>
    <div className={styles.settings}>
      <div className={styles.settingsTitle}><Icon name="gear" className="size-4" />Настройка экрана</div>
      <div className={styles.setting}><small>Данные</small><strong>Таблица «Склад»</strong></div>
      <div className={styles.setting}><small>Доступ</small><strong>Кладовщик</strong></div>
      <p>Поля в списке</p>
      {['Название', 'Остаток', 'Цена'].map((field, index) => <div key={field} className={styles.field} data-enabled={index < 2}>
        <span className={styles.checkbox}>{index < 2 && <Icon name="check" className="size-3" />}</span>{field}
      </div>)}
      <div className={styles.setting}><small>Действие</small><strong>Приёмка товара</strong></div>
    </div>
    <div className={styles.builderPreview}><span>Предпросмотр для сотрудника</span><StockScreen products={products} shared={shared} preview /></div>
  </div>
}
