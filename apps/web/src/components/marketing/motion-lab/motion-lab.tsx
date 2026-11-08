'use client'

import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Icon } from '@/components/runtime/icons'
import { PRODUCTS, type Product } from '../catalog-data'
import { ProductGlyph } from '../product-glyph'
import { REQUESTS } from '../demos'
import { usePreviewPlayback } from './use-preview-playback'
import { VARIANTS, type Variant } from './variants'
import styles from './motion-lab.module.css'
import { Chrome, ProductView } from './product-view'

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

/** A single story for its product page, stopping on the completed result. */
export function MotionStory({ variantId }: { variantId: 'sync' | 'workflow' }) {
  return <Preview variant={VARIANTS.find((variant) => variant.id === variantId)!} embedded />
}

function Preview({ variant, embedded = false }: { variant: Variant; embedded?: boolean }) {
  const { root, step, paused, running, reduced, complete, select, toggle, replay } = usePreviewPlayback(variant.durations, { loop: !embedded, nativeTransition: variant.id !== 'sync' })
  const prefix = `tableapp-lab-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const shared: Shared = (key) => ({ viewTransitionName: `${prefix}-${key}` })
  const headingId = `${prefix}-title`
  return (
    <section ref={root} aria-labelledby={embedded ? undefined : headingId} aria-label={embedded ? variant.title : undefined}>
      {!embedded && <div className={styles.intro}>
        <h2 id={headingId}>{variant.title}</h2>
        <p>{variant.description}</p>
      </div>}
      <div className={`${styles.player} ${embedded ? styles.embedded : ''}`}>
        <div className={styles.playerTop}>
          <span>{variant.id !== 'sync' && <i className={styles.dot} data-running={running} />}{reduced ? 'Без автоматического движения' : complete ? 'Показ завершён' : paused ? 'Показ на паузе' : 'Автопоказ'}</span>
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
            {!reduced && !complete && <button type="button" className={styles.control} onClick={toggle}>{paused ? 'Продолжить' : 'Пауза'}</button>}
            <button type="button" className={styles.control} onClick={replay}>Повторить</button>
          </div>
        </div>
        <div className={styles.canvas} data-variant={variant.id} data-scene={step} data-service={embedded && variant.id === 'workflow'}>
          {variant.id === 'views' && <ViewsScene step={step} shared={shared} />}
          {variant.id === 'sync' && <SyncScene step={step} shared={shared} />}
          {variant.id === 'workflow' && <WorkflowScene step={step} shared={shared} service={embedded} />}
          {variant.id === 'roles' && <RolesScene step={step} shared={shared} />}
          {variant.id === 'intake' && <IntakeScene step={step} shared={shared} />}
        </div>
      </div>
      {!embedded && <div className={styles.placement}>
        <p className={styles.placementTitle}>Где использовать: {variant.placement.toLowerCase()}</p>
        <p>{variant.reason}</p>
        {reduced && <p>Уменьшение движения включено. Выберите сцену, чтобы рассмотреть её без анимации.</p>}
      </div>}
    </section>
  )
}

function ViewsScene({ step, shared }: SceneProps) {
  const mode = (['table', 'catalog', 'mobile'] as const)[step]!
  return <ProductView mode={mode} shared={shared} />
}

function SyncScene({ step, shared }: SceneProps) {
  const layout = useRef<HTMLDivElement>(null)
  const previous = useRef<{ width: number; tops: number[] } | null>(null)
  useLayoutEffect(() => {
    const node = layout.current!
    const panels = Array.from(node.querySelectorAll<HTMLElement>('[data-sync-source], [data-product-view="catalog"], [data-sync-total]'))
    const box = node.getBoundingClientRect()
    const tops = panels.map(panel => panel.getBoundingClientRect().top - box.top)
    const before = previous.current
    previous.current = { width: box.width, tops }
    if (!box.width || !before || Math.abs(before.width - box.width) > 1 || window.innerWidth > 767 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const animations = panels.flatMap((panel, index) => {
      const distance = before.tops[index]! - tops[index]!
      if (Math.abs(distance) < 1 || !panel.animate) return []
      return [panel.animate([{ translate: `0 ${distance}px` }, { translate: '0 0' }], { duration: 700, easing: 'cubic-bezier(.22,1,.36,1)' })]
    })
    return () => animations.forEach(animation => animation.cancel())
  }, [step])
  const updated = step >= 2
  const products = PRODUCTS.map((product, index) => index === 1 && updated ? { ...product, price: '8 490' } : product)
  const product = { ...PRODUCTS[1]!, price: step >= 1 ? '8 490' : PRODUCTS[1]!.price }
  const initialTotal = PRODUCTS.reduce((sum, item) => sum + numericPrice(item) * item.stock, 0)
  const newTotal = initialTotal + (8490 - numericPrice(PRODUCTS[1]!)) * product.stock
  const total = step >= 3 ? newTotal : initialTotal
  const focus = ['all', 'source', 'catalog', 'total'][step]
  const titles = ['Одна запись для всех экранов', 'Меняем цену одного товара', 'Новая цена уже в каталоге', 'Стоимость остатков выросла на 1 500 ₽']
  return (
    <div className={styles.syncStory} data-sync-focus={focus} data-ui>
      <h3 className={styles.syncHeading}>{titles[step]}</h3>
      <div ref={layout} className={styles.syncLayout}>
      <div className={styles.syncSource} data-sync-source>
        <div className={styles.miniTitle}><Icon name="list" className="size-4" />Общая запись</div>
        <div className={styles.sourceRecord}>
          <span className={`${styles.sourcePhoto} ${product.tint} ${product.ink}`}><ProductGlyph kind={product.glyph} className="size-12" /></span>
          <strong>{product.short}</strong><small>{product.code}</small>
          <div className={styles.editCell} data-active={step >= 1}>
            <span>Цена, ₽</span>
            {step >= 1 && <del className={styles.previousPrice}>7 990</del>}
            <strong data-source-price style={shared('source-price')}>{product.price}</strong>
            <small>{step === 1 ? 'Меняем 7 990 → 8 490' : updated ? 'Изменение сохранено' : 'Значение в таблице'}</small>
          </div>
          <span className={styles.dataLink}><Icon name="check" className="size-4" />{updated ? 'Обновлено из общей записи' : 'Один источник данных'}</span>
        </div>
      </div>
      <div className={styles.syncDestinations}>
        <ProductView mode="catalog" shared={shared} scope="synced" products={products} highlight={updated} previousPrice={updated ? '7 990' : undefined} />
        <div className={styles.total} data-sync-total data-active={step === 3}>
          <span><Icon name="chart" className="size-4" />Стоимость остатков<small>Цена × количество на складе</small></span>
          <div className={styles.totalValue}>{step >= 3 && <del className={styles.previousPrice}>{money(initialTotal)} ₽</del>}<strong style={shared('stock-total')}>{money(total)} ₽</strong></div>
          <small>{step >= 3 ? '3 шт × 500 ₽ = +1 500 ₽' : 'Все четыре товара'}</small>
        </div>
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
const SERVICE_STATUSES = ['Новая', 'В работе', 'Готово']
const SERVICE_ORDERS = REQUESTS.map((item) => ({
  id: item.id, title: `Заявка ${item.id}`,
  client: item.master ? `${item.master} · ${item.client}` : `${item.client} · ${item.date}`,
  price: item.sum, stage: SERVICE_STATUSES.indexOf(item.status),
}))

function WorkflowScene({ step, shared, service = false }: SceneProps & { service?: boolean }) {
  const source = service ? SERVICE_ORDERS : ORDERS
  const statuses = service ? SERVICE_STATUSES : STATUSES
  const moving = service ? 1 : 0
  const orders = source.map((order, index) => index === moving ? { ...order, stage: Math.max(0, step - 1) } : order)
  const record = (order: (typeof ORDERS)[number]) => (
    <article key={order.id} className={styles.order} data-order-id={order.id} style={shared(`order-${order.id}`)}>
      <span className={styles.orderId}>{order.id}</span>
      <strong style={shared(`order-name-${order.id}`)}>{order.title}</strong>
      <small>{order.client}</small><span className={styles.orderStatus}>{statuses[order.stage]}</span>
      <span className={styles.orderPrice} style={shared(`order-price-${order.id}`)}>{order.price}</span>
    </article>
  )
  return (
    <div className={styles.workflowFrame} style={shared('workflow-frame')}>
      <Chrome title="Заявки сервисной службы" icon="clipboard"><small>{service ? '5 заявок' : '3 заявки'}</small></Chrome>
      {step === 0 ? <div className={`${styles.orders} ${styles.orderTable}`}>
        <div className={styles.orderHead}><span>Заявка</span><span>Клиент</span><span>Статус</span><span>Сумма</span></div>
        {orders.map(record)}
      </div> : <div className={`${styles.orders} ${styles.orderBoard}`}>
        {statuses.map((status, column) => <div key={status} className={styles.column}>
          <div className={styles.columnTitle}><span>{status}</span><small>{orders.filter(order => order.stage === column).length}</small></div>
          <div className={styles.columnRecords}>{orders.filter(order => order.stage === column).map(record)}</div>
        </div>)}
      </div>}
      <div className={styles.frameFoot}><Icon name="check" className="size-3.5" />{step >= 2 ? `${source[moving]!.id}: ${step === 2 ? 'мастер выполняет работу' : 'работа завершена'}` : 'Те же заявки, другое представление'}</div>
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
