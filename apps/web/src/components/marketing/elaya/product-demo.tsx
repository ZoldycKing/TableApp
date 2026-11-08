'use client'

import { useState } from 'react'
import {
  ArrowRightIcon, ArrowUpRightIcon, CheckIcon, DeviceMobileIcon, FileXlsIcon,
  GridFourIcon, LinkIcon, PauseIcon, PlayIcon, PlusIcon, ShieldCheckIcon,
  TableIcon, XIcon,
} from '@phosphor-icons/react/ssr'
import { useStoryClock } from './motion'
import { useDemoRecords } from '../demo-records'
import { ProductObject } from '../product-object'
import styles from './landing.module.css'

export { TableAppTransfer as ProductDemo } from './table-app-transfer'

export function ReceiptDemo() {
  const [received, setReceived] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const records = useDemoRecords()
  const count = records?.products[1]?.stock ?? (received ? 8 : 3)
  const receive = () => { setReceived(true); setShowForm(false); if (records) records.update(records.products.map((item, index) => index === 1 ? { ...item, stock: item.stock + 5 } : item)) }
  const reset = () => { setReceived(false); if (records) records.update(records.products.map((item, index) => index === 1 ? { ...item, stock: 3 } : item)) }
  return <div className={styles.receiptDemo} data-receipt-demo>
    <div className={styles.receiptTop}><DeviceMobileIcon size={20} aria-hidden /><strong>Рабочий экран сотрудника</strong><span>Демо</span></div>
    <div className={styles.receiptProduct}><div className={styles.receiptIllustration}><ProductObject kind="driver" /></div><span>ШВ 1130</span><h3>Шуруповёрт 12 В</h3><div className={styles.stock}><span>На складе</span><strong key={count}>{count}<small>шт</small></strong></div></div>
    {showForm && !received ? <div className={styles.receiptForm}><div><strong>Приёмка товара</strong><button type="button" aria-label="Закрыть приёмку" onClick={() => setShowForm(false)}><XIcon size={20} aria-hidden /></button></div><p>Добавить 5 шт к текущему остатку?</p><button type="button" className={styles.primary} onClick={receive}><CheckIcon size={20} aria-hidden />Принять 5 шт</button></div> : <button type="button" className={styles.receiptButton} disabled={received} onClick={() => setShowForm(true)}>{received ? <CheckIcon size={20} aria-hidden /> : <PlusIcon size={20} aria-hidden />}{received ? 'Товар принят' : 'Принять товар'}</button>}
    <div className={styles.receiptSync} data-changed={received}><div><TableIcon size={20} aria-hidden /><span>В общей таблице<small>Шуруповёрт 12 В</small></span></div><strong key={count}>{received && <span className={styles.receiptDelta}>+5</span>}{count} шт</strong></div>
    <div className={styles.receiptNote} role="status">{received ? 'Остаток обновился на обоих экранах.' : 'Попробуйте принять товар. Это тестовые данные.'}{received && <button type="button" onClick={reset}>Повторить</button>}</div>
  </div>
}

const ROLE_CONTENT = {
  client: { title: 'Мои заказы', person: 'Анна Морозова', caption: 'Клиент видит свои заказы', rows: [['Заказ № 1048', 'Готов к выдаче', '7 990 ₽'], ['Заказ № 1032', 'Получен', '1 250 ₽']] },
  team: { title: 'Мои заявки', person: 'Алексей Соколов', caption: 'Сотрудник видит назначенные заявки', rows: [['Установка оборудования', 'В работе', 'Сегодня'], ['Замена комплектующих', 'Назначена', 'Завтра']] },
}
export function AccessDemo() {
  const { ref, step, entered, reduced, select, playing, toggle } = useStoryClock(2, 4)
  const role = step === 0 ? 'client' : 'team'
  const content = ROLE_CONTENT[role]
  return <div className={styles.accessDemo} ref={ref} data-loaded={entered || reduced}>
    <div className={styles.roleToggle} role="group" aria-label="Посмотреть приложение с разным доступом"><button type="button" aria-pressed={role === 'client'} onClick={() => select(0)}>Клиент</button><button type="button" aria-pressed={role === 'team'} onClick={() => select(1)}>Сотрудник</button></div>
    <div className={styles.roleCard} key={role}><div className={styles.person}><span>{role === 'client' ? 'АМ' : 'АС'}</span><div><strong>{content.person}</strong><small>Личный кабинет</small></div><ShieldCheckIcon size={24} aria-hidden /></div><h3>{content.title}</h3>{content.rows.map(row => <div className={styles.roleRow} key={row[0]}><div><strong>{row[0]}</strong><span>{row[1]}</span></div><span>{row[2]}</span></div>)}<div className={styles.roleSecure}><ShieldCheckIcon size={16} aria-hidden />{content.caption}</div></div>
    <span className={styles.accessLink}><LinkIcon size={16} aria-hidden />Одно приложение. Разные права.</span>
    {!reduced && <div className={styles.storyControl}><button type="button" onClick={toggle} aria-label={playing ? 'Остановить смену ролей' : 'Продолжить смену ролей'}>{playing ? <PauseIcon size={14} aria-hidden /> : <PlayIcon size={14} aria-hidden />}{playing ? 'Пауза' : 'Автопоказ'}</button></div>}
  </div>
}

export function SetupSteps() {
  const { ref, step, entered, reduced, select, playing, toggle } = useStoryClock(3, 3.6)
  const steps = [
    { title: 'Добавьте данные', text: 'Загрузите Excel или CSV. Или возьмите готовый шаблон.', icon: FileXlsIcon },
    { title: 'Настройте экраны', text: 'Выберите, как показывать записи и кто сможет их менять.', icon: GridFourIcon },
    { title: 'Начните работать', text: 'Откройте приложение с компьютера или телефона. При необходимости отправьте ссылку другим.', icon: ArrowUpRightIcon },
  ]
  return <div className={styles.steps} ref={ref} data-loaded={entered || reduced} data-step={step}>
    <div className={styles.stepsVisual} aria-hidden><div className={styles.fileSource}><FileXlsIcon size={40} weight="duotone" /><span>Ваши данные.xlsx</span><small>Планы · Расходы · Книги</small></div><ArrowRightIcon className={styles.stepArrow} size={32} /><div className={styles.appResult}><GridFourIcon size={40} weight="duotone" /><span>Ваше приложение</span><small>{step === 0 ? 'Данные на месте' : step === 1 ? 'Экраны настроены' : 'Готово к работе'}</small><span className={styles.stepCheck} data-active={step === 2}><CheckIcon size={20} /></span></div></div>
    <div className={styles.stepList}>{steps.map((item, index) => <button type="button" key={item.title} onClick={() => select(index)} aria-pressed={index === step}><span>0{index + 1}</span><div><h3>{item.title}</h3><p>{item.text}</p></div><item.icon size={24} aria-hidden /></button>)}</div>
    {!reduced && <div className={styles.storyControl}><button type="button" onClick={toggle} aria-label={playing ? 'Остановить показ шагов' : 'Продолжить показ шагов'}>{playing ? <PauseIcon size={14} aria-hidden /> : <PlayIcon size={14} aria-hidden />}{playing ? 'Пауза' : 'Автопоказ'}</button></div>}
  </div>
}
