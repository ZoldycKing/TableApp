'use client'
import { useState } from 'react'
import type { AppV2, AppV2Node, AppV2TeamCalendarData } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import ui from './view.module.css'

type Node=Extract<AppV2Node,{type:'team_calendar'}>
const numberTypes=['number','formula','rollup']
const weekNames=['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота']
function weekdayValues(field:BuilderV2Table['fields'][number]|undefined){return weekNames.map((name,i)=>field?.choices?.find(choice=>choice.name.toLocaleLowerCase('ru-RU').startsWith(name.slice(0,3).toLocaleLowerCase('ru-RU')))?.id??String(i))}
export function teamCalendarDefaults(table:BuilderV2Table,tables:readonly BuilderV2Table[]):AppV2TeamCalendarData|null{
  const start=table.fields.find(field=>field.type==='datetime'),end=table.fields.find(field=>field.type==='datetime'&&field.id!==start?.id),duration=table.fields.find(field=>numberTypes.includes(field.type)&&/длит|минут|duration|minutes/i.test(field.name))??table.fields.find(field=>numberTypes.includes(field.type))
  const relations=table.fields.filter(field=>field.type==='relation'&&tables.some(table=>table.id===field.relationTableId))
  const relation=relations.find(field=>/мастер|сотрудник|исполн|ответств|employee|staff|resource/i.test(field.name))??relations[0],resources=tables.find(table=>table.id===relation?.relationTableId)
  if(!start||!resources||!relation||!end&&!duration||!resources.fields.length)return null
  const title=table.fields.find(field=>/услуга|название|name|title|событие/i.test(field.name))??table.fields.find(field=>field.id===table.primaryFieldId)??table.fields[0]!
  return{tableId:table.id,viewId:null,titleFieldId:title.id,subtitleFieldId:null,startFieldId:start.id,endFieldId:end?.id??null,durationFieldId:end?null:duration!.id,resourceFieldId:relation.id,statusFieldId:table.fields.find(field=>field.type==='single_select')?.id??null,amountFieldId:null,statusValues:{},resources:{tableId:resources.id,viewId:null,titleFieldId:resources.primaryFieldId??resources.fields[0]!.id,photoFieldId:resources.fields.find(field=>field.type==='image')?.id??null,ownerEmailFieldId:null},hours:null}
}
export function TeamCalendarSettings({app,node,tables,onChange}:{app:AppV2;node:Node;tables:readonly BuilderV2Table[];onChange:(node:Node)=>void}){
  const[tab,setTab]=useState('data'),data=node.data,table=tables.find(table=>table.id===data?.tableId),resources=tables.find(table=>table.id===data?.resources.tableId),hours=tables.find(table=>table.id===data?.hours?.tableId)
  const update=(patch:Partial<AppV2TeamCalendarData>)=>{if(data)onChange({...node,data:{...data,...patch}})}
  const field=(label:string,value:string|null|undefined,fields:BuilderV2Table['fields']|undefined,change:(id:string)=>void,optional=false)=><label>{label}<select value={value??''} onChange={event=>change(event.target.value)}>{optional&&<option value="">Не использовать</option>}{fields?.map(field=><option key={field.id} value={field.id}>{field.name}</option>)}</select></label>
  const view=(own:BuilderV2Table|undefined,value:string|null,change:(id:string|null)=>void)=><label>Представление<select value={value??''} onChange={event=>change(event.target.value||null)}><option value="">Все доступные записи</option>{own?.views.map(view=><option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
  const relationFields=table?.fields.filter(field=>field.type==='relation'&&tables.some(table=>table.id===field.relationTableId))
  const selectHours=(id:string)=>{
    const table=tables.find(table=>table.id===id),relation=table?.fields.find(field=>field.type==='relation'&&field.relationTableId===resources?.id),text=table?.fields.filter(field=>field.type==='text')??[]
    if(!table||!relation||text.length<2){update({hours:null});return}
    const start=text.find(field=>/начал|start/i.test(field.name))??text[0]!,end=text.find(field=>/конец|оконч|end/i.test(field.name))??text.find(field=>field.id!==start.id)!
    const weekday=table.fields.find(field=>/день недели|weekday/i.test(field.name)&&['text','number','single_select'].includes(field.type)),date=table.fields.find(field=>field.type==='date')
    update({hours:{tableId:id,viewId:null,resourceFieldId:relation.id,startFieldId:start.id,endFieldId:end.id,weekdayFieldId:weekday?.id??null,dateFieldId:date?.id??null,closedFieldId:table.fields.find(field=>field.type==='checkbox')?.id??null,weekdays:weekdayValues(weekday)}})
  }
  return <section aria-label="Настройки календаря команды">
    <div className={ui.inspectorTabs} role="group" aria-label="Настройки календаря">{[['data','Данные'],['view','Вид'],['actions','Действия']].map(([id,label])=><button key={id} type="button" aria-pressed={tab===id} onClick={()=>setTab(id!)}>{label}</button>)}</div>
    {tab==='data'&&<>
      <label>Таблица записей<select value={data?.tableId??''} onChange={event=>{const table=tables.find(table=>table.id===event.target.value);if(table)onChange({...node,data:teamCalendarDefaults(table,tables)})}}><option value="" disabled>Выберите таблицу</option>{tables.filter(table=>teamCalendarDefaults(table,tables)).map(table=><option key={table.id} value={table.id}>{table.name}</option>)}</select></label>
      {!data&&<p className={ui.hint}>Нужна таблица с датой и временем, окончанием или длительностью в минутах и связью с таблицей сотрудников.</p>}
      {data&&<>
        {view(table,data.viewId,id=>update({viewId:id}))}
        {field('Название записи',data.titleFieldId,table?.fields,id=>update({titleFieldId:id}))}
        {field('Подпись',data.subtitleFieldId,table?.fields,id=>update({subtitleFieldId:id||null}),true)}
        {field('Начало',data.startFieldId,table?.fields.filter(field=>field.type==='datetime'),id=>update({startFieldId:id}))}
        <label>Как задаётся окончание<select value={data.endFieldId?'end':'duration'} onChange={event=>update(event.target.value==='end'?{endFieldId:table?.fields.find(field=>field.type==='datetime'&&field.id!==data.startFieldId)?.id??data.startFieldId,durationFieldId:null}:{endFieldId:null,durationFieldId:table?.fields.find(field=>numberTypes.includes(field.type))?.id??null})}><option value="duration" disabled={!table?.fields.some(field=>numberTypes.includes(field.type))}>Длительность в минутах</option><option value="end" disabled={(table?.fields.filter(field=>field.type==='datetime').length??0)<2}>Дата и время окончания</option></select></label>
        {data.endFieldId?field('Окончание',data.endFieldId,table?.fields.filter(field=>field.type==='datetime'),id=>update({endFieldId:id})):field('Длительность, минуты',data.durationFieldId,table?.fields.filter(field=>numberTypes.includes(field.type)),id=>update({durationFieldId:id}))}
        {field('Связь с сотрудником',data.resourceFieldId,relationFields,id=>{const relation=relationFields?.find(field=>field.id===id),resource=tables.find(table=>table.id===relation?.relationTableId);if(resource?.fields.length)update({resourceFieldId:id,resources:{tableId:resource.id,viewId:null,titleFieldId:resource.primaryFieldId??resource.fields[0]!.id,photoFieldId:null,ownerEmailFieldId:null},hours:null})})}
        <fieldset><legend>Сотрудники · {resources?.name}</legend>
          {view(resources,data.resources.viewId,id=>update({resources:{...data.resources,viewId:id}}))}
          {field('Имя сотрудника',data.resources.titleFieldId,resources?.fields,id=>update({resources:{...data.resources,titleFieldId:id}}))}
          {field('Фото сотрудника',data.resources.photoFieldId,resources?.fields.filter(field=>['image','url'].includes(field.type)),id=>update({resources:{...data.resources,photoFieldId:id||null}}),true)}
          {field('Показывать сотруднику только себя — поле почты',data.resources.ownerEmailFieldId,resources?.fields.filter(field=>field.type==='email'),id=>update({resources:{...data.resources,ownerEmailFieldId:id||null}}),true)}
        </fieldset>
        {field('Статус',data.statusFieldId,table?.fields.filter(field=>field.type==='single_select'),id=>update({statusFieldId:id||null,statusValues:{}}),true)}
        {data.statusFieldId&&<fieldset><legend>Значения статусов</legend>{([['booked','Предстоит'],['arrived','Клиент пришёл'],['completed','Завершено'],['noShow','Неявка'],['cancelled','Отменено']]as const).map(([key,label])=><label key={key}>{label}<select value={data.statusValues[key]??''} onChange={event=>update({statusValues:{...data.statusValues,[key]:event.target.value||undefined}})}><option value="">Не использовать</option>{table?.fields.find(field=>field.id===data.statusFieldId)?.choices?.map(choice=><option key={choice.id} value={choice.id}>{choice.name}</option>)}</select></label>)}</fieldset>}
        {field('Стоимость',data.amountFieldId,table?.fields.filter(field=>numberTypes.includes(field.type)),id=>update({amountFieldId:id||null}),true)}
        <label>Таблица рабочих часов<select value={data.hours?.tableId??''} onChange={event=>selectHours(event.target.value)}><option value="">Без рабочих часов</option>{tables.filter(table=>table.fields.some(field=>field.type==='relation'&&field.relationTableId===resources?.id)&&table.fields.filter(field=>field.type==='text').length>=2&&table.fields.some(field=>field.type==='date'||/день недели|weekday/i.test(field.name))).map(table=><option key={table.id} value={table.id}>{table.name}</option>)}</select></label>
        {data.hours&&<fieldset><legend>Рабочие часы</legend>
          {view(hours,data.hours.viewId,id=>update({hours:{...data.hours!,viewId:id}}))}
          {field('Сотрудник в рабочих часах',data.hours.resourceFieldId,hours?.fields.filter(field=>field.type==='relation'&&field.relationTableId===resources?.id),id=>update({hours:{...data.hours!,resourceFieldId:id}}))}
          {field('Начало работы (ЧЧ:ММ)',data.hours.startFieldId,hours?.fields.filter(field=>field.type==='text'),id=>update({hours:{...data.hours!,startFieldId:id}}))}
          {field('Окончание работы (ЧЧ:ММ)',data.hours.endFieldId,hours?.fields.filter(field=>field.type==='text'),id=>update({hours:{...data.hours!,endFieldId:id}}))}
          {field('День недели',data.hours.weekdayFieldId,hours?.fields.filter(field=>['single_select','text','number'].includes(field.type)),id=>update({hours:{...data.hours!,weekdayFieldId:id||null,weekdays:weekdayValues(hours?.fields.find(field=>field.id===id))}}),true)}
          {data.hours.weekdayFieldId&&[1,2,3,4,5,6,0].map(index=>{const field=hours?.fields.find(field=>field.id===data.hours!.weekdayFieldId),change=(next:string)=>update({hours:{...data.hours!,weekdays:data.hours!.weekdays.map((value,i)=>i===index?next:value)}});return <label key={index}>{weekNames[index]}{field?.choices?<select aria-label={`Значение дня: ${weekNames[index]}`} value={data.hours!.weekdays[index]} onChange={event=>change(event.target.value)}>{field.choices.map(choice=><option key={choice.id} value={choice.id}>{choice.name}</option>)}</select>:<input aria-label={`Значение дня: ${weekNames[index]}`} value={data.hours!.weekdays[index]} onChange={event=>change(event.target.value)}/>}</label>})}
          {field('Отдельная дата',data.hours.dateFieldId,hours?.fields.filter(field=>field.type==='date'),id=>update({hours:{...data.hours!,dateFieldId:id||null}}),true)}
          {field('Выходной',data.hours.closedFieldId,hours?.fields.filter(field=>field.type==='checkbox'),id=>update({hours:{...data.hours!,closedFieldId:id||null}}),true)}
        </fieldset>}
      </>}
    </>}
    {tab==='view'&&<><label>Один сотрудник<input value={node.resourceLabel} maxLength={40} onChange={event=>onChange({...node,resourceLabel:event.target.value})}/></label><label>Вся команда<input value={node.resourcesLabel} maxLength={40} onChange={event=>onChange({...node,resourcesLabel:event.target.value})}/></label><label><input type="checkbox" checked={node.showMetrics} onChange={event=>onChange({...node,showMetrics:event.target.checked})}/>Показывать показатели</label></>}
    {tab==='actions'&&<>
      {([['itemScreenId','Нажатие на запись',data?.tableId],['createScreenId','Добавить запись',null],['configureScreenId','Настроить рабочие часы',null],['periodScreenId','Изменить рабочий период',data?.hours?.tableId]]as const).map(([key,label,context])=><label key={key}>{label}<select value={node.actions[key]??''} onChange={event=>onChange({...node,actions:{...node.actions,[key]:event.target.value||null}})}><option value="">Без действия</option>{app.screens.filter(screen=>screen.contextTableId===context).map(screen=><option key={screen.id} value={screen.id}>{screen.name}</option>)}</select></label>)}
      <fieldset><legend>Кто может добавлять записи и менять часы</legend>{app.roles.map(role=><label key={role.id}><input type="checkbox" checked={node.actions.manageRoleIds.includes(role.id)} onChange={event=>onChange({...node,actions:{...node.actions,manageRoleIds:event.target.checked?[...node.actions.manageRoleIds,role.id]:node.actions.manageRoleIds.filter(id=>id!==role.id)}})}/>{role.name}</label>)}</fieldset>
      <p className={ui.hint}>Календарь открывает выбранные экраны. Формы сохраняют данные по своим действиям и правам доступа.</p>
    </>}
  </section>
}
