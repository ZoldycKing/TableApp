// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { instantToWallClock } from '@tableapp/schema'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { buildTemplate } from '@/lib/templates/build'
import { salon } from '@/lib/templates/defs/salon'
import { buildBookingV2App } from '@/lib/templates/booking-v2'
import { calendarDays } from '@/lib/team-calendar-core'
import { TeamCalendarSettings } from './team-calendar-settings'
import { BuilderV2TeamCalendar, TeamCalendarDemoContext } from './team-calendar'
import { BookingJourneyProvider, useBookingJourney } from './booking-journey'
import { useState } from 'react'
import type { BuilderV2Table } from '@/lib/builder-v2'

vi.mock('../prototype/icons',()=>({ProtoIcon:()=>null}))
const built=buildTemplate({template:salon,workspaceId:'wsp_calendar_ui'}),starter=buildBookingV2App(built,{id:'app_calendar_ui',workspaceId:'wsp_calendar_ui',name:'Календарь',slug:'calendar-ui',email:'owner@example.com'})
const app:AppV2={...starter};delete app.booking
const node=app.nodes.find(node=>node.type==='team_calendar')!
if(node.type!=='team_calendar')throw Error('Missing calendar')
const calendar=node
const tables:BuilderV2Table[]=built.tables.map(table=>({id:table.id,name:table.name,primaryFieldId:table.primaryFieldId??null,views:[],fields:built.fields.filter(field=>field.tableId===table.id).map(field=>({id:field.id,name:field.name,type:field.type as BuilderV2Table['fields'][number]['type'],relationTableId:field.type==='relation'?(field.options as {tableId:string}).tableId:undefined,choices:(field.options as {choices?:{id:string;name:string}[]}).choices}))}))
const actor={authenticated:true,roleIds:['owner'],id:'owner',email:'owner@example.com',name:'Автор',company:''}
beforeEach(()=>vi.stubGlobal('ResizeObserver',class{constructor(private callback:ResizeObserverCallback){}observe(){this.callback([{contentRect:{width:1200}}]as ResizeObserverEntry[],this as unknown as ResizeObserver)}disconnect(){}}))
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('renders a calendar outside the salon adapter, opens records and preserves controls while editing',async()=>{
 const navigate=vi.fn(),query={screenId:app.homeScreenId!,nodeId:node.id,day:instantToWallClock(new Date(),'Europe/Moscow')!.date,week:false}
 const data={timeZone:'Europe/Moscow',days:[query.day],omitted:0,resources:[{id:'person',name:'Анна'}],shifts:[{resourceId:'person',day:query.day,windows:[{id:'shift',start:540,end:1080}],exception:false,closed:false}],events:[{id:'event',resourceId:'person',day:query.day,start:600,end:660,title:'Консультация',subtitle:'Иван',status:'',amount:null}]}
 const show=(editing:boolean)=><TeamCalendarDemoContext value={()=>({ok:true,data})}><BuilderV2TeamCalendar app={app} node={calendar} screenId={query.screenId} actor={actor} tables={tables} onNavigate={navigate} editing={editing}/></TeamCalendarDemoContext>
 const view=render(show(false));const event=await screen.findByRole('button',{name:/Открыть запись:/});fireEvent.click(event)
 expect(navigate).toHaveBeenCalledWith(calendar.actions.itemScreenId,'event')
 expect(screen.getByRole('button',{name:'Записать'}).hasAttribute('disabled')).toBe(false)
 view.rerender(show(true));await screen.findByRole('button',{name:/Открыть запись:/})
 expect(screen.getByRole('button',{name:'Записать'}).hasAttribute('disabled')).toBe(true)
 expect(screen.getByRole('button',{name:'Настроить часы'}).hasAttribute('disabled')).toBe(true)
})
it('carries the selected time and employee into a generic create form without executing a write',async()=>{
 const navigate=vi.fn(),day=instantToWallClock(new Date(Date.now()+2*86400000),'Europe/Moscow')!.date
 function State(){const journey=useBookingJourney();return <output data-testid="selection">{JSON.stringify(journey?.calendarForm)}</output>}
 const view=render(<BookingJourneyProvider><TeamCalendarDemoContext value={(_node,query)=>({ok:true,data:{timeZone:'Europe/Moscow',days:calendarDays(query.day,query.week),omitted:0,resources:[{id:'person',name:'Анна'}],shifts:calendarDays(query.day,query.week).map(day=>({resourceId:'person',day,windows:[{id:'shift',start:540,end:1080}],exception:false,closed:false})),events:[]}})}><BuilderV2TeamCalendar app={app} node={calendar} screenId={app.homeScreenId!} actor={actor} tables={tables} onNavigate={navigate}/><State/></TeamCalendarDemoContext></BookingJourneyProvider>)
 await screen.findByLabelText('Календарь рабочих часов и записей')
 fireEvent.change(screen.getByLabelText('Дата календаря'),{target:{value:day.split('-').reverse().join('.')}})
 const slot=await screen.findByRole('button',{name:new RegExp(`Анна, ${day}, 09:00`)})
 fireEvent.click(slot)
 const state=JSON.parse(screen.getByTestId('selection').textContent!)
 expect(state).toMatchObject({tableId:calendar.data!.tableId,screenId:calendar.actions.createScreenId,values:{[calendar.data!.resourceFieldId]:['person'],[calendar.data!.startFieldId]:`${day}T06:00:00.000Z`}})
 expect(navigate).toHaveBeenCalledWith(calendar.actions.createScreenId,undefined)
 view.rerender(<BookingJourneyProvider><TeamCalendarDemoContext value={(_node,query)=>({ok:true,data:{timeZone:'Europe/Moscow',days:calendarDays(query.day,query.week),omitted:0,resources:[{id:'person',name:'Анна'}],shifts:calendarDays(query.day,query.week).map(day=>({resourceId:'person',day,windows:[{id:'shift',start:540,end:1080}],exception:false,closed:false})),events:[]}})}><BuilderV2TeamCalendar app={app} node={calendar} screenId={app.homeScreenId!} actor={actor} tables={tables} onNavigate={navigate} editing/><State/></TeamCalendarDemoContext></BookingJourneyProvider>)
 const editingSlot=await screen.findByRole('button',{name:new RegExp(`Анна, ${day}, 09:00`)})
 fireEvent.click(editingSlot)
 expect(JSON.parse(screen.getByTestId('selection').textContent!)).toEqual(state)
 expect(navigate).toHaveBeenCalledTimes(1)
})
it('shows weekday names rather than internal choice IDs and stores display and action settings',async()=>{
 function Settings(){const[value,setValue]=useState(calendar);return <><TeamCalendarSettings app={app} node={value} tables={tables} onChange={setValue}/><output data-testid="settings">{JSON.stringify(value)}</output></>}
 render(<Settings/>)
 fireEvent.click(screen.getByRole('button',{name:'Часы'}))
 const monday=screen.getByRole('combobox',{name:'Значение дня: Понедельник'})as HTMLSelectElement
 expect(monday.selectedOptions[0]!.textContent).toBe('Понедельник')
 fireEvent.click(screen.getByRole('button',{name:'Вид'}))
 fireEvent.change(screen.getByLabelText('Один сотрудник'),{target:{value:'Исполнитель'}})
 expect(JSON.parse(screen.getByTestId('settings').textContent!).resourceLabel).toBe('Исполнитель')
 fireEvent.click(screen.getByRole('button',{name:'Действия'}))
 fireEvent.change(screen.getByLabelText('Добавить запись'),{target:{value:''}})
 await waitFor(()=>expect(JSON.parse(screen.getByTestId('settings').textContent!).actions.createScreenId).toBeNull())
})
