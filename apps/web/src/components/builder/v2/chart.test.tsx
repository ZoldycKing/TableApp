// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {afterEach,expect,it} from 'vitest'
import type {AppV2Node} from '@tableapp/schema/app-v2'
import type {BuilderV2ChartData} from '@/lib/builder-v2-data-types'
import {BuilderV2Chart} from './chart'
import {BuilderV2Video} from './video'
import {BuilderV2ChartSettings} from './chart-settings'
import {useState} from 'react'
afterEach(cleanup)
const node:Extract<AppV2Node,{type:'chart'}>={id:'chart',name:'Суммы по статусам',type:'chart',visibleTo:null,visibleWhen:null,sourceId:'source',chartType:'bar',groupFieldId:'status',operation:'sum',fieldId:'amount',dateGrouping:'month',limit:10}
const data:BuilderV2ChartData={groupLabel:'Статус',valueLabel:'Сумма: Бюджет',totalRows:3,numericRows:3,groupCount:2,remainderGroups:0,undated:0,points:[{key:'g0',label:'В работе',value:120,count:2},{key:'g1',label:'Возврат',value:-20,count:1}]}
it('shows readable categories, keyboard selection and an optional exact data table',()=>{
 render(<BuilderV2Chart node={node} data={data}/>);expect(screen.getByRole('figure',{name:node.name})).toBeTruthy();const category=screen.getByRole('button',{name:'Возврат: -20'});fireEvent.click(category);expect(category.getAttribute('aria-pressed')).toBe('true');expect(screen.getByText('Записей в категории: 1')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Показать данные'}));const table=screen.getByRole('table');expect(within(table).getByRole('row',{name:'Возврат -20 1'})).toBeTruthy();expect(screen.getByRole('button',{name:'Скрыть данные'}).getAttribute('aria-expanded')).toBe('true')
})
it('renders a zero donut as explicit data rather than a misleading full circle',()=>{
 render(<BuilderV2Chart node={{...node,chartType:'donut'}} data={{...data,points:data.points.map(point=>({...point,value:0}))}}/>);expect(screen.getByText('Все значения равны нулю. Точные числа доступны ниже.')).toBeTruthy();expect(screen.queryByRole('img',{name:'Доли категорий'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Показать данные'}));expect(screen.getByRole('table')).toBeTruthy()
})
it('lets a keyboard user inspect line values and explains omitted undated records',()=>{
 const points=[{key:'g0',label:'Январь',date:'2026-01',value:100,count:1},{key:'g1',label:'Март',date:'2026-03',value:null,count:1}];render(<BuilderV2Chart node={{...node,chartType:'line'}} data={{...data,points,undated:1}}/>);fireEvent.change(screen.getByLabelText('Значение за дату'),{target:{value:'g1'}});expect(screen.getByText('Нет значения')).toBeTruthy();expect(screen.getByText('Без даты: 1. Эти записи не показаны на линии.')).toBeTruthy()
})
it('picks a date when changing to a line and removes an incompatible average when changing to a donut',()=>{
 function Settings(){const [value,setValue]=useState({...node,operation:'avg' as const});return <BuilderV2ChartSettings node={value} table={{id:'table',name:'Таблица',primaryFieldId:'title',fields:[{id:'status',name:'Статус',type:'single_select'},{id:'date',name:'Дата',type:'date'},{id:'amount',name:'Сумма',type:'number'}],views:[]}} onChange={next=>setValue(next as typeof value)}/>}
 render(<Settings/>);fireEvent.change(screen.getByLabelText('Вид диаграммы'),{target:{value:'line'}});expect((screen.getByLabelText('Дата') as HTMLSelectElement).value).toBe('date');fireEvent.change(screen.getByLabelText('Вид диаграммы'),{target:{value:'donut'}});expect((screen.getByLabelText('Что посчитать') as HTMLSelectElement).value).toBe('count');expect(screen.queryByLabelText('Числовое поле')).toBeNull()
})
it('never autoplays or embeds a page, rejects executable video URLs and reports load failures',()=>{
 const view=render(<BuilderV2Video value="javascript:alert(1)" caption="Инструкция"/>);expect(view.container.querySelector('video')).toBeNull();view.rerender(<BuilderV2Video value="https://example.invalid/instruction.mp4" caption="Инструкция"/>);const video=view.container.querySelector('video')!;expect(video.preload).toBe('none');expect(video.controls).toBe(true);expect(video.autoplay).toBe(false);expect(view.container.querySelector('iframe')).toBeNull();fireEvent.error(video);expect(screen.getByRole('alert').textContent).toContain('Видео недоступно')
})
