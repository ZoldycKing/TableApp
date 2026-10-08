'use client'

import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { Icon } from '@/components/runtime/icons'
import { PRODUCTS, type Product } from '../catalog-data'
import { ProductGlyph } from '../product-glyph'
import { usePreviewPlayback } from './use-preview-playback'
import { VARIANTS, type Variant } from './variants'
import styles from './motion-lab.module.css'

type Shared = (key: string) => CSSProperties
type SceneProps = { step: number; shared: Shared }
const money = (amount: number) => amount.toLocaleString('ru-RU')
const numericPrice = (product: Product) => Number(product.price.replace(/\s/g, ''))

export function MotionLab() {
  const [selected, setSelected] = useState(0)
  const active = VARIANTS[selected]!
  return (
    <div className={styles.lab}>
      <div className={styles.variants} role="group" aria-label="Варианты анимаций">
        {VARIANTS.map((variant, index) => (
          <button key={variant.id} type="button" aria-pressed={selected === index}
            onClick={() => setSelected(index)} className={styles.variant}>
            <span className={styles.number}>{index + 1}</span>{variant.label}
          </button>
        ))}
      </div>
      <Preview key={active.id} variant={active} />
    </div>
  )
}

function Preview({ variant }: { variant: Variant }) {
  const { root, step, paused, running, reduced, select, toggle, replay } = usePreviewPlayback(variant.durations)
  const prefix = `tableapp-lab-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const shared: Shared = (key) => ({ viewTransitionName: `${prefix}-${key}` })
  const headingId = `${prefix}-title`
  return (
    <section ref={root} aria-labelledby={headingId}>
      <div className={styles.intro}>
        <h2 id={headingId}>{variant.title}</h2>
        <p>{variant.description}</p>
      </div>
      <div className={styles.player}>
        <div className={styles.playerTop}>
          <span><i className={styles.dot} data-running={running} />{reduced ? 'Без автоматического движения' : paused ? 'Показ на паузе' : 'Автопоказ'}</span>
          <span>Пример на тестовых данных</span>
        </div>
        <div className={styles.controls}>
          <div className={styles.scenes} role="group" aria-label="Сцены выбранного варианта">
            {variant.scenes.map((scene, index) => (
              <button key={scene} className={styles.scene} type="button" aria-pressed={step === index}
                onClick={() => select(index)}>{scene}</button>
            ))}
          </div>
          <div className={styles.transport}>
            {!reduced && <button type="button" className={styles.control} onClick={toggle}>{paused ? 'Продолжить' : 'Пауза'}</button>}
            <button type="button" className={styles.control} onClick={replay}>Повторить</button>
          </div>
        </div>
        <div className={styles.canvas} data-variant={variant.id} data-scene={step}>
          {variant.id === 'views' && <ViewsScene step={step} shared={shared} />}
          {variant.id === 'sync' && <SyncScene step={step} shared={shared} />}
          {variant.id === 'workflow' && <WorkflowScene step={step} shared={shared} />}
          {variant.id === 'roles' && <RolesScene step={step} shared={shared} />}
          {variant.id === 'intake' && <IntakeScene step={step} shared={shared} />}
        </div>
      </div>
      <div className={styles.placement}>
        <p className={styles.placementTitle}>Где использовать: {variant.placement.toLowerCase()}</p>
        <p>{variant.reason}</p>
        {reduced && <p>Уменьшение движения включено. Выберите сцену, чтобы рассмотреть её без анимации.</p>}
      </div>
    </section>
  )
}

function Chrome({ title, icon = 'grid', children }: { title: string; icon?: string; children?: ReactNode }) {
  return <div className={styles.chrome}><span><Icon name={icon} className="size-4" />{title}</span>{children ?? <small>4 товара</small>}</div>
}

function ProductView({ mode, shared, scope = 'products', products = PRODUCTS, owner = false, client = false, highlight = false }: {
  mode: 'table' | 'catalog' | 'mobile'; shared: Shared; scope?: string; products?: Product[]; owner?: boolean; client?: boolean; highlight?: boolean
}) {
  return (
    <div className={`${styles.productFrame} ${styles[mode]}`} data-owner={owner} style={shared(`${scope}-frame`)}>
      <Chrome title={mode === 'table' ? 'Таблица «Склад»' : 'Каталог инструментов'} icon={mode === 'table' ? 'list' : mode === 'mobile' ? 'smartphone' : 'grid'} />
      {mode === 'table' && <div className={styles.tableHead}><span>Товар</span><span>Цена, ₽</span>{owner && <span>Закупка, ₽</span>}<span>Остаток</span></div>}
      <div className={styles.productRecords}>
        {products.map((product, index) => (
          <article key={product.code} data-product-code={product.code} data-highlight={highlight && index === 1}
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
          </article>
        ))}
      </div>
      <div className={styles.frameFoot}><Icon name="check" className="size-3.5" />{client ? 'Доступность и цены для клиента' : 'Одна таблица · те же четыре товара'}</div>
    </div>
  )
}

function ViewsScene({ step, shared }: SceneProps) {
  const mode = (['table', 'catalog', 'mobile'] as const)[step]!
  return <ProductView mode={mode} shared={shared} />
}

function SyncScene({ step, shared }: SceneProps) {
  const updated = step >= 2
  const products = PRODUCTS.map((product, index) => index === 1 && updated ? { ...product, price: '8 490' } : product)
  const total = products.reduce((sum, product) => sum + numericPrice(product) * product.stock, 0)
  const product = products[1]!
  return (
    <div className={styles.syncLayout}>
      <div className={styles.syncSource}>
        <div className={styles.miniTitle}><Icon name="list" className="size-4" />Общая запись</div>
        <div className={styles.sourceRecord}>
          <span className={`${styles.sourcePhoto} ${product.tint} ${product.ink}`}><ProductGlyph kind={product.glyph} className="size-12" /></span>
          <strong>{product.short}</strong><small>{product.code}</small>
          <div className={styles.editCell} data-active={step === 1 || updated}>
            <span>Цена, ₽</span><strong style={shared('source-price')}>{product.price}</strong>
            <small>{step === 1 ? 'Меняем 7 990 → 8 490' : updated ? 'Изменение сохранено' : 'Значение в таблице'}</small>
          </div>
          <span className={styles.dataLink}><Icon name="check" className="size-4" />{updated ? 'Обновлено из общей записи' : 'Один источник данных'}</span>
        </div>
      </div>
      <div className={styles.syncDestinations}>
        <ProductView mode="catalog" shared={shared} scope="synced" products={products} highlight={updated} />
        <div className={styles.total} data-active={step === 3}>
          <span><Icon name="chart" className="size-4" />Стоимость остатков<small>Цена × количество на складе</small></span>
          <strong style={shared('stock-total')}>{money(total)} ₽</strong>
          <small>{updated ? '+1 500 ₽ · 3 шт × 500 ₽' : 'Все четыре товара'}</small>
        </div>
      </div>
    </div>
  )
}

const ORDERS = [
  { id: 'З-104', title: 'Диагностика кондиционера', client: 'Алексей Сергеев', price: '2 800 ₽', stage: 0 },
  { id: 'З-105', title: 'Монтаж розетки', client: 'Ольга Миронова', price: '1 500 ₽', stage: 1 },
  { id: 'З-106', title: 'Замена смесителя', client: 'Игорь Лебедев', price: '3 200 ₽', stage: 2 },
]
const STATUSES = ['Приняты', 'В работе', 'Завершены']

function WorkflowScene({ step, shared }: SceneProps) {
  const orders = ORDERS.map((order, index) => index === 0 ? { ...order, stage: Math.max(0, step - 1) } : order)
  const record = (order: (typeof ORDERS)[number]) => (
    <article key={order.id} className={styles.order} data-order-id={order.id} style={shared(`order-${order.id}`)}>
      <span className={styles.orderId}>{order.id}</span>
      <strong style={shared(`order-name-${order.id}`)}>{order.title}</strong>
      <small>{order.client}</small><span className={styles.orderStatus}>{STATUSES[order.stage]}</span>
      <span className={styles.orderPrice} style={shared(`order-price-${order.id}`)}>{order.price}</span>
    </article>
  )
  return (
    <div className={styles.workflowFrame} style={shared('workflow-frame')}>
      <Chrome title="Заявки сервисной службы" icon="clipboard"><small>3 заявки</small></Chrome>
      {step === 0 ? <div className={`${styles.orders} ${styles.orderTable}`}>
        <div className={styles.orderHead}><span>Заявка</span><span>Клиент</span><span>Статус</span><span>Сумма</span></div>
        {orders.map(record)}
      </div> : <div className={`${styles.orders} ${styles.orderBoard}`}>
        {STATUSES.map((status, column) => <div key={status} className={styles.column}>
          <div className={styles.columnTitle}><span>{status}</span><small>{orders.filter(order => order.stage === column).length}</small></div>
          <div className={styles.columnRecords}>{orders.filter(order => order.stage === column).map(record)}</div>
        </div>)}
      </div>}
      <div className={styles.frameFoot}><Icon name="check" className="size-3.5" />{step >= 2 ? `${ORDERS[0]!.id}: ${step === 2 ? 'мастер выполняет работу' : 'работа завершена'}` : 'Те же заявки, другое представление'}</div>
    </div>
  )
}

function RolesScene({ step, shared }: SceneProps) {
  const titles = ['Владелец: закупка, цены и остатки', 'Менеджер: каталог для работы', 'Клиент: товары и доступность']
  return <div className={styles.roleLayout}>
    <div className={styles.roleBanner}><Icon name="users" className="size-5" /><span>{titles[step]}</span></div>
    <ProductView mode={step === 0 ? 'table' : step === 1 ? 'catalog' : 'mobile'} shared={shared} owner={step === 0} client={step === 2} />
  </div>
}

function IntakeScene({ step, shared }: SceneProps) {
  const product = PRODUCTS[1]!
  const received = step >= 2
  const stock = product.stock + (step >= 3 ? 4 : 0)
  return <div className={styles.intakeLayout}>
    <div className={styles.intakePhone}>
      <Chrome title="Новая приёмка" icon="smartphone"><small>Ирина</small></Chrome>
      {received ? <div className={styles.success}><span><Icon name="check" className="size-8" /></span><strong>Приёмка сохранена</strong><p>Четыре шуруповёрта поступили на склад. Запись видна команде.</p></div> : <div className={styles.intakeForm}>
        <p className={styles.formLabel}>Товар</p>
        <div className={styles.formRecord} style={step === 1 ? shared('received-record') : undefined}>
          <div className={styles.formField}>
            {step === 1 ? <span style={shared('received-name')}>{product.short}</span> : <span className={styles.placeholder}>Выберите товар</span>}
          </div>
          <p className={styles.formLabel}>Количество, шт</p>
          <div className={styles.formField}>
            {step === 1 ? <strong style={shared('received-count')}>4</strong> : <span className={styles.placeholder}>Введите количество</span>}
          </div>
        </div>
        <p className={styles.formLabel}>Кто принимает</p><div className={styles.formField}>Ирина, кладовщик</div>
        <div className={styles.saveIllustration} data-ready={step === 1}>Сохранить приёмку</div>
      </div>}
      <div className={styles.frameFoot}>Приложение «Склад»</div>
    </div>
    <div className={styles.intakeResult}>
      <div className={styles.intakeTable}>
        <Chrome title="Таблица «Приёмка»" icon="list"><small>{received ? '3 записи' : '2 записи'}</small></Chrome>
        <div className={styles.intakeRow}><strong>Товар</strong><span>Шт</span><span>Кто</span></div>
        <div className={styles.intakeRow}><span>Набор бит, 32 шт</span><span>20</span><span>Пётр</span></div>
        <div className={styles.intakeRow}><span>Уровень лазерный</span><span>2</span><span>Ирина</span></div>
        {received ? <div className={`${styles.intakeRow} ${styles.newRow}`} style={shared('received-record')}>
          <span style={shared('received-name')}>{product.short}</span><strong style={shared('received-count')}>4</strong><span>Ирина</span>
        </div> : <div className={styles.waitingRow}>Новая приёмка появится здесь</div>}
      </div>
      <div className={styles.stockResult} data-active={step >= 3}>
        <div><Icon name="box" className="size-5" /><span>Остаток на складе<small>{product.short}</small></span></div>
        <strong style={shared('intake-stock')}>{stock}<small> шт</small></strong>
        <span>{step >= 3 ? '3 на складе + 4 из приёмки = 7' : 'До приёмки: 3 шт'}</span>
      </div>
    </div>
  </div>
}
