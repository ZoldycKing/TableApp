'use client'

import { useState } from 'react'
import { ArrowRightIcon, BookOpenIcon, CalendarBlankIcon, GridFourIcon, HouseLineIcon, LeafIcon, SuitcaseSimpleIcon, WalletIcon } from '@phosphor-icons/react/ssr'
import personal from './personal-demo.module.css'

const PLANS = [
  { id: 'trip', name: 'Поездка в Карелию', category: 'Отдых', date: '8 ноября', status: 'В планах', icon: SuitcaseSimpleIcon, tint: 'green' },
  { id: 'home', name: 'Обновить рабочее место', category: 'Дом', date: '14 ноября', status: 'В процессе', icon: HouseLineIcon, tint: 'yellow' },
  { id: 'study', name: 'Закончить курс', category: 'Учёба', date: '22 ноября', status: 'В процессе', icon: BookOpenIcon, tint: 'stone' },
  { id: 'plants', name: 'Пересадить растения', category: 'Дом', date: '29 ноября', status: 'В планах', icon: LeafIcon, tint: 'pink' },
] as const

const SECTIONS = [
  { id: 'plans', name: 'Планы', icon: CalendarBlankIcon },
  { id: 'expenses', name: 'Расходы', icon: WalletIcon },
  { id: 'books', name: 'Книги', icon: BookOpenIcon },
] as const

export function PersonalSectionsDemo() {
  const [section, setSection] = useState<typeof SECTIONS[number]['id']>('plans')
  return <div className={personal.sectionsDemo}>
    <div className={personal.sectionsTop}><GridFourIcon size={20} aria-hidden /><strong>Мои дела</strong><span>Пример</span></div>
    <div className={personal.sectionsTabs} role="group" aria-label="Разделы личного приложения">{SECTIONS.map(item => <button type="button" key={item.id} aria-pressed={section === item.id} onClick={() => setSection(item.id)}><item.icon size={18} aria-hidden />{item.name}</button>)}</div>
    <div className={personal.sectionContent} key={section}>
      {section === 'plans' && <><div className={personal.sectionTitle}><h3>Ближайшие планы</h3><span>3 плана</span></div>{PLANS.slice(0, 3).map((plan) => <div className={personal.sectionRow} key={plan.id}><span className={personal.icon} data-tone={plan.tint}><plan.icon size={22} aria-hidden /></span><div><strong>{plan.name}</strong><span>{plan.category} · {plan.date}</span></div><span>{plan.status}</span></div>)}</>}
      {section === 'expenses' && <><div className={personal.sectionTitle}><h3>Мои расходы</h3><span>Ноябрь</span></div><div className={personal.total}><span>Всего потрачено</span><strong>7 970 ₽</strong><small>Сумма записей в таблице</small></div>{[['Продукты', 'Дом', '4 500 ₽'], ['Билеты', 'Отдых', '2 490 ₽'], ['Книги', 'Учёба', '980 ₽']].map(row => <div className={personal.sectionRow} key={row[0]}><div><strong>{row[0]}</strong><span>{row[1]}</span></div><strong>{row[2]}</strong></div>)}</>}
      {section === 'books' && <><div className={personal.sectionTitle}><h3>Хочу прочитать</h3><span>3 книги</span></div>{[['Маленький принц', 'Антуан де Сент-Экзюпери', 'Читаю'], ['Три товарища', 'Эрих Мария Ремарк', 'В списке'], ['Понедельник начинается в субботу', 'Аркадий и Борис Стругацкие', 'В списке']].map((row, index) => <div className={personal.sectionRow} key={row[0]}><span className={personal.icon} data-tone={index === 0 ? 'green' : 'stone'}><BookOpenIcon size={22} aria-hidden /></span><div><strong>{row[0]}</strong><span>{row[1]}</span></div><span>{row[2]}</span></div>)}</>}
    </div>
    <div className={personal.sectionsBottom}><span>Свои названия, поля и разделы</span><ArrowRightIcon size={18} aria-hidden /></div>
  </div>
}
