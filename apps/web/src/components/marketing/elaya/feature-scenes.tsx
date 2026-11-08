'use client'

import { useState, type ReactNode } from 'react'
import { CheckIcon, MinusIcon, PauseIcon, PlayIcon, PlusIcon } from '@phosphor-icons/react/ssr'
import { useStoryClock } from './motion'
import styles from './inner-pages.module.css'

const VIEWS = ['Таблица', 'Доска', 'Календарь']
const STATUS = ['В планах', 'В работе', 'Готово'] as const
const TASKS = [
  { name: 'Подготовить смету', category: 'Продажи', day: 8, status: 'В планах' },
  { name: 'Заказать материалы', category: 'Закупки', day: 14, status: 'В работе' },
  { name: 'Согласовать макет', category: 'Дизайн', day: 22, status: 'В работе' },
  { name: 'Передать заказ', category: 'Выдача', day: 29, status: 'Готово' },
]
const money = new Intl.NumberFormat('ru-RU')

function Playback({ playing, toggle, reduced, name }: { playing: boolean; toggle: () => void; reduced: boolean; name: string }) {
  return reduced ? null : <button type="button" className={styles.iconButton} onClick={toggle} aria-label={`${playing ? 'Остановить' : 'Продолжить'} ${name}`} title={playing ? 'Пауза' : 'Автопоказ'}>{playing ? <PauseIcon size={18} aria-hidden /> : <PlayIcon size={18} aria-hidden />}</button>
}
export function ViewsStory() {
  const clock = useStoryClock(3,4.8)
  return <div className={styles.visual} ref={clock.ref} data-view-story data-step={clock.step}>
    <div className={styles.visualToolbar}><div className={styles.segment} role="group" aria-label="Вид записей">{VIEWS.map((name,index) => <button type="button" key={name} aria-pressed={clock.step === index} onClick={() => clock.select(index)}>{name}</button>)}</div><Playback {...clock} name="смену представлений" /></div>
    <div className={styles.previewSurface} key={clock.step}>
      {clock.step === 0 && <table className={styles.viewTable}><caption className="sr-only">Одни и те же четыре задачи</caption><thead><tr><th scope="col">Задача</th><th scope="col">Раздел</th><th scope="col">Статус</th><th scope="col">Срок</th></tr></thead><tbody>{TASKS.map(item => <tr key={item.name}><td>{item.name}</td><td>{item.category}</td><td><span className={styles.status} data-status={item.status}>{item.status}</span></td><td>{item.day} ноября</td></tr>)}</tbody></table>}
      {clock.step === 1 && <div className={styles.board}>{STATUS.map(status => <div className={styles.boardColumn} key={status}><strong>{status}<small>{TASKS.filter(item=>item.status===status).length}</small></strong>{TASKS.filter(item=>item.status===status).map(item => <div className={styles.boardCard} key={item.name}><strong>{item.name}</strong><span>{item.category}</span><small>{item.day} ноября</small></div>)}</div>)}</div>}
      {clock.step === 2 && <div className={styles.calendar}>{[8,14,22,27,29].map(day => <div className={styles.calendarDay} key={day}><strong>{day}</strong><small>Ноября</small>{TASKS.filter(item=>item.day===day).map(item => <div key={item.name}>{item.name}<span>{item.category}</span></div>)}</div>)}</div>}
    </div>
    <div className={styles.visualCaption}><span>Те же 4 задачи во всех представлениях</span><span>Выберите удобный вид</span></div>
  </div>
}

const LINES = [{name:'Полка',price:2490},{name:'Стул',price:3600}]
export function CalculationStory() {
  const clock = useStoryClock(3,3.6)
  const [manual,setManual] = useState<number[] | null>(null)
  const quantities = manual ?? [1,clock.step === 1 ? 3 : 2]
  const total = LINES.reduce((sum,item,index)=>sum+item.price*quantities[index]!,0)
  const change = (index:number,delta:number) => { clock.select(0); setManual(quantities.map((value,at)=>at===index?Math.max(1,Math.min(9,value+delta)):value)) }
  return <div className={styles.visual} ref={clock.ref} data-calculation-story>
    <div className={styles.visualToolbar}><span className={styles.textLink}>Сумма заказа</span><Playback {...clock} name="показ расчёта" toggle={() => { setManual(null); clock.toggle() }} /></div>
    <div className={styles.calculation}>
      <div className={styles.orderLines}><h3>Состав заказа</h3>{LINES.map((item,index) => <div className={styles.orderLine} key={item.name}><div><strong>{item.name}</strong><small>{money.format(item.price)} ₽ за штуку</small></div><div className={styles.quantity}><button type="button" aria-label={`Уменьшить: ${item.name}`} disabled={quantities[index]===1} onClick={()=>change(index,-1)}><MinusIcon size={16} aria-hidden /></button><span>{quantities[index]}</span><button type="button" aria-label={`Увеличить: ${item.name}`} disabled={quantities[index]===9} onClick={()=>change(index,1)}><PlusIcon size={16} aria-hidden /></button></div></div>)}</div>
      <div className={styles.orderResult}><span>Сумма заказа</span><strong key={total} data-order-total>{money.format(total)} ₽</strong><p>Количество × цена.<br />Сумма обновляется при каждом изменении.</p><small><CheckIcon size={16} aria-hidden />Ручной пересчёт не нужен</small></div>
    </div>
    <div className={styles.visualCaption}><span>Попробуйте изменить количество</span><span>Учебные данные</span></div>
  </div>
}

export function RoleStory({ client, staff }: { client: ReactNode; staff: ReactNode }) {
  const [role,setRole] = useState<'client'|'staff'>('client')
  return <div className={styles.visual} data-role-story>
    <div className={styles.visualToolbar}><div className={styles.segment} role="group" aria-label="Глазами кого смотреть"><button type="button" aria-pressed={role==='client'} onClick={()=>setRole('client')}>Клиент</button><button type="button" aria-pressed={role==='staff'} onClick={()=>setRole('staff')}>Сотрудник</button></div><span className={styles.eyebrow}>Настоящие экраны приложения</span></div>
    <div className={styles.runtimeScene} key={role}><div className={styles.runtimeTheme}>{role==='client'?client:staff}</div></div>
    <div className={styles.visualCaption}><span>{role==='client'?'Клиент видит свои заказы':'Сотрудник видит заказы клиентов и рабочие разделы'}</span><span>Разделы и карточки можно открывать</span></div>
  </div>
}
