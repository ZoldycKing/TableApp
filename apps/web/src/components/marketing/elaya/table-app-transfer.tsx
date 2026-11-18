'use client'

import { useId, type CSSProperties } from 'react'
import { CheckIcon, ListChecksIcon, PackageIcon, TableIcon, UsersIcon } from '@phosphor-icons/react/ssr'
import { useTableTransfer } from './use-table-transfer'
import { transferPaths } from './table-transfer-path'
import styles from './table-app-transfer.module.css'

type Row = { name: string; detail: string; value: string; initials?: string; phoneDetail?: string; phoneValue?: string }
const SCREENS = [
  { id: 'orders', title: 'Заказы', icon: ListChecksIcon, columns: ['Заказ', 'Статус', 'Сумма'], rows: [
    { name: 'Стеллаж для офиса', detail: 'В работе', value: '28 700 ₽' },
    { name: 'Тумба под раковину', detail: 'Принят', value: '18 500 ₽' },
    { name: 'Полка в прихожую', detail: 'Новый', value: '6 900 ₽' },
  ] },
  { id: 'clients', title: 'Клиенты', icon: UsersIcon, columns: ['Клиент', 'Заказы', 'Сумма'], rows: [
    { name: 'Анна Морозова', detail: '3 заказа', value: '28 700 ₽', initials: 'АМ' },
    { name: 'Павел Орлов', detail: '1 заказ', value: '18 500 ₽', initials: 'ПО' },
    { name: 'Ирина Белова', detail: '2 заказа', value: '6 900 ₽', initials: 'ИБ' },
  ] },
  { id: 'stock', title: 'Склад', icon: PackageIcon, columns: ['Материал', 'Остаток', 'Место'], rows: [
    { name: 'Мебельный щит', detail: '12 шт', value: 'А1', phoneDetail: 'Ячейка А1', phoneValue: '12 шт' },
    { name: 'Комплект петель', detail: '38 шт', value: 'Б2', phoneDetail: 'Ячейка Б2', phoneValue: '38 шт' },
    { name: 'Крепёж', detail: '164 шт', value: 'Б3', phoneDetail: 'Ячейка Б3', phoneValue: '164 шт' },
  ] },
] as const satisfies readonly { id: string; title: string; icon: typeof TableIcon; columns: readonly string[]; rows: readonly Row[] }[]
const DESKTOP_PATH = transferPaths({ x: 288, y: 308 }, { x: 512, y: 308 }, { x: 760, y: 308 })
const MOBILE_PATH = transferPaths({ x: 160, y: 144 }, { x: 56, y: 232 }, { x: 132, y: 400 }, true)

export function TableAppTransfer() {
  const clock = useTableTransfer()
  const id = useId()
  const delivered = ['reveal', 'hold', 'exit'].includes(clock.phase)
  return <div ref={clock.ref} className={styles.transfer} data-table-transfer data-active={SCREENS[clock.active]!.id}
    data-phase={clock.phase} data-running={clock.running} aria-label="Из таблиц в приложение" aria-describedby={`${id}-caption`}>
    <div ref={clock.scene} className={styles.scene}>
      <div className={styles.tableStack} data-table-stack>
        <span className={styles.sideLabel}>Ваши таблицы</span>
        {SCREENS.map((screen, index) => {
          const rank = (index - clock.active + 3) % 3
          const consumed = !clock.reduced && rank === 0 && ['transfer', 'reveal', 'hold', 'exit'].includes(clock.phase)
          return <div key={screen.id} className={styles.sheetLayer} data-rank={rank} data-sheet={screen.id} data-consumed={consumed} aria-hidden={rank !== 0 || consumed}>
            <div className={styles.sheet}>
              <div className={styles.sheetHeader}><TableIcon size={20} aria-hidden /><strong>{screen.title}</strong><span>Таблица</span></div>
              <table aria-label={`Таблица «${screen.title}»`}><thead><tr>{screen.columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
                <tbody>{screen.rows.map((row, i) => <tr key={row.name} data-first={i === 0}><td>{row.name}</td><td>{row.detail}</td><td>{row.value}</td></tr>)}</tbody></table>
              <div className={styles.sheetFooter}><span>3 строки</span><span>Данные в Scatta</span></div>
            </div>
          </div>
        })}
      </div>

      <svg className={styles.desktopPath} viewBox="0 0 1200 560" preserveAspectRatio="none" fill="none" aria-hidden>
        <defs><marker id={`${id}-arrow`} markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M2 2L10 6L2 10" /></marker></defs>
        <path ref={clock.desktopPath} className={styles.motionPath} d={DESKTOP_PATH.flight} />
        <path ref={clock.desktopTrack} className={styles.track} data-transfer-arrow="desktop" d={DESKTOP_PATH.arrow} markerEnd={`url(#${id}-arrow)`} />
        <path ref={clock.desktopProgress} className={styles.progress} d={DESKTOP_PATH.arrow} pathLength="1" />
      </svg>
      <svg className={styles.mobilePath} viewBox="0 0 360 608" preserveAspectRatio="none" fill="none" aria-hidden>
        <defs><marker id={`${id}-mobile-arrow`} markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M2 2L10 6L2 10" /></marker></defs>
        <path ref={clock.mobilePath} className={styles.motionPath} d={MOBILE_PATH.flight} />
        <path ref={clock.mobileTrack} className={styles.track} data-transfer-arrow="mobile" d={MOBILE_PATH.arrow} markerEnd={`url(#${id}-mobile-arrow)`} />
        <path ref={clock.mobileProgress} className={styles.progress} d={MOBILE_PATH.arrow} pathLength="1" />
      </svg>
      <div ref={clock.traveler} className={styles.traveler} data-transfer-token aria-hidden>
        <svg width="44" height="52" viewBox="0 0 44 52" fill="none">
          <path d="M8 2H28L38 12V46A4 4 0 0 1 34 50H8A4 4 0 0 1 4 46V6A4 4 0 0 1 8 2Z" fill="#e8f0e0" stroke="#527348" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M28 2V9A3 3 0 0 0 31 12H38" fill="#b9cfaa" stroke="#527348" strokeWidth="1.5" strokeLinejoin="round" />
          <rect x="10" y="17" width="22" height="6" rx="1.5" fill="#355e39" />
          <rect x="10" y="26" width="22" height="17" rx="2" fill="#fafcf7" stroke="#6d8b5b" strokeWidth="1.25" />
          <path d="M17.5 26.5V42.5M24.5 26.5V42.5M10.5 31.5H31.5M10.5 37.5H31.5" stroke="#8fae7e" strokeWidth="1.25" />
        </svg>
      </div>

      <div className={styles.phoneStack}>
        <span className={styles.sideLabel}>Одно приложение</span>
        {SCREENS.map((screen, index) => {
          const rank = (index - clock.active + 3) % 3
          const ready = rank !== 0 || delivered
          return <div key={screen.id} className={styles.phoneLayer} data-rank={rank} data-phone={screen.id} aria-hidden={rank !== 0}>
            <div className={styles.device} role="group" aria-label={`Экран «${screen.title}»`} data-filled={ready}>
              <div className={styles.statusBar} aria-hidden><span>9:41</span><span className={styles.camera} /><span>•••</span></div>
              <div className={styles.phoneHeader}><span>Мастерская</span><h3>{screen.title}</h3></div>
              <div className={styles.phoneBody}>
                <div className={styles.emptyRows} aria-hidden>{[0, 1, 2].map(i => <div key={i}><span /><div><span /><span /></div></div>)}</div>
                <ul className={styles.phoneRows} aria-label={screen.title} aria-hidden={!ready}>{screen.rows.map((row: Row, i) => <li key={row.name} style={{ '--row': i } as CSSProperties}>
                  <span className={styles.rowIcon} data-tone={i}>{row.initials ?? <screen.icon size={20} weight="duotone" aria-hidden />}</span>
                  <div><strong>{row.name}</strong><span>{row.phoneDetail ?? row.detail}</span><b>{row.phoneValue ?? row.value}</b></div>
                </li>)}</ul>
              </div>
              <div className={styles.appTabs} aria-hidden>{SCREENS.map(item => <span key={item.id} data-selected={item.id === screen.id}><item.icon size={20} /><span>{item.title}</span></span>)}</div>
              <span className={styles.arrival} aria-hidden><CheckIcon size={20} /></span>
            </div>
          </div>
        })}
      </div>
    </div>
    <div className={styles.footer}>
      <p id={`${id}-caption`}>Ваши таблицы. Экраны вашего приложения.</p>
    </div>
  </div>
}
