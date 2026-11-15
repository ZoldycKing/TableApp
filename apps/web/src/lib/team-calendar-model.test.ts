import { describe, expect, it } from 'vitest'
import { appV2Schema, appV2AuthoringContract, validateAppV2 } from '@tableapp/schema/app-v2'
import { buildTemplate } from './templates/build'
import { salon } from './templates/defs/salon'
import { buildBookingV2App } from './templates/booking-v2'
import { teamCalendarSnapshot } from './team-calendar-model'
import { editorCatalog } from '@/components/builder/v2/model'
import { teamCalendarDefaults } from '@/components/builder/v2/team-calendar-settings'
import type { BuilderV2Table } from './builder-v2'

const built=buildTemplate({template:salon,workspaceId:'workspace_calendar'}),app=buildBookingV2App(built,{id:'app_calendar',workspaceId:'workspace_calendar',name:'Календарь',slug:'calendar-unit',email:'owner@example.com'})
const node=app.nodes.find(node=>node.type==='team_calendar')!,config=node.type==='team_calendar'?node.data!:null!
const tables:BuilderV2Table[]=built.tables.map(table=>({...table,primaryFieldId:table.primaryFieldId??null,fields:built.fields.filter(field=>field.tableId===table.id).map(field=>({id:field.id,name:field.name,type:field.type as BuilderV2Table['fields'][number]['type'],...(field.type==='relation'?{relationTableId:(field.options as {tableId:string}).tableId}:{})})),views:[]}))
const row=(id:string,tableId:string,values:Record<string,string|number|string[]>)=>({id,tableId,values,display:Object.fromEntries(Object.entries(values).map(([id,value])=>[id,String(value)]))})
describe('general team calendar contract',()=>{
  it('validates the salon as a configuration of a public component and exports it to authoring',()=>{
    expect(appV2Schema.safeParse(app).success).toBe(true)
    expect(validateAppV2(app,editorCatalog(app,tables))).toEqual([])
    expect(appV2AuthoringContract().components.team_calendar[0]).toBe('Календарь команды')
  })
  it('rejects incompatible fields, deleted targets and foreign tables',()=>{
    const invalid=structuredClone(app),calendar=invalid.nodes.find(node=>node.type==='team_calendar')!
    if(calendar.type!=='team_calendar'||!calendar.data)throw Error('missing calendar')
    calendar.data.startFieldId=config.titleFieldId
    calendar.data.resources.tableId='foreign_table'
    calendar.actions.itemScreenId='missing_screen'
    expect(validateAppV2(invalid,editorCatalog(app,tables)).filter(issue=>issue.code==='team_calendar').length).toBeGreaterThanOrEqual(3)
  })
  it('allows an unconfigured draft but prevents publishing it',()=>{
    const draft=structuredClone(app),calendar=draft.nodes.find(node=>node.type==='team_calendar')!
    if(calendar.type==='team_calendar')calendar.data=null
    expect(validateAppV2(draft,editorCatalog(app,tables))).toEqual([])
    expect(validateAppV2(draft,editorCatalog(app,tables),{mode:'publish'}).some(issue=>issue.code==='team_calendar')).toBe(true)
  })
  it('finds initial field mappings using table types instead of a business adapter',()=>{
    const own=tables.find(table=>table.id===config.tableId)!
    expect(teamCalendarDefaults(own,tables)?.resourceFieldId).toBeTruthy()
    expect(teamCalendarDefaults({...own,fields:own.fields.filter(field=>field.type!=='datetime')},tables)).toBeNull()
  })
  it('splits a cross-midnight event into its visible days and preserves original status labels',()=>{
    const query={screenId:'screen',nodeId:'calendar',day:'2026-11-13',week:true}
    const data={...config,startFieldId:'start',endFieldId:'end',durationFieldId:null,hours:null}
    const records={resources:[row('person',config.resources.tableId,{[config.resources.titleFieldId]:'Марина'})],hours:null,events:[row('meeting',config.tableId,{start:'2026-11-13T20:30:00Z',end:'2026-11-13T22:00:00Z',[config.resourceFieldId]:['person'],[config.titleFieldId]:'Ночная смена',[config.statusFieldId!]:'custom'})]}
    records.events[0]!.display[config.statusFieldId!]='Согласовано'
    const snapshot=teamCalendarSnapshot(data,records,query,'Europe/Moscow')
    expect(snapshot.visits.map(visit=>[visit.day,visit.start,visit.end])).toEqual([['2026-11-13',1410,1440],['2026-11-14',0,60]])
    expect(snapshot.visits[0]!.statusLabel).toBe('Согласовано')
    expect(snapshot.shifts.every(shift=>shift.windows===null)).toBe(true)
  })
  it('shows a shared event for each permitted employee without losing its original record',()=>{
    const resources=['anna','oleg'].map(id=>row(id,config.resources.tableId,{[config.resources.titleFieldId]:id}))
    const snapshot=teamCalendarSnapshot({...config,hours:null},{resources,hours:null,events:[row('shared',config.tableId,{[config.startFieldId]:'2026-11-13T07:00:00Z',[config.durationFieldId!]:60,[config.resourceFieldId]:['anna','oleg','hidden','anna'],[config.titleFieldId]:'Встреча'})]},{screenId:'screen',nodeId:'calendar',day:'2026-11-13',week:false},'Europe/Moscow')
    expect(snapshot.visits.map(visit=>[visit.id,visit.masterId])).toEqual([['shared','anna'],['shared','oleg']])
  })
})
