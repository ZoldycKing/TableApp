// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { appV2Fixture, fixtureActor, fixtureTables } from './fixture.test-utils'
import { AppV2Renderer } from './view'
import { addNode, duplicateNode } from './model'
import { appV2ChildIds } from '@tableapp/schema/app-v2'
import { builderV2HistoryDate } from '@/lib/builder-v2-history-date'
vi.mock('../prototype/icons',()=>({ProtoIcon:()=>null}))
vi.mock('@/app/builder-v2-data-actions',()=>({readBuilderV2DataAction:vi.fn()}))
vi.mock('@/app/builder-v2-form-actions',()=>({inspectBuilderV2FormAction:vi.fn()}))
afterEach(cleanup)

it('renders configured profile values equally in editing and preview, without exposing missing private fields',()=>{
  const made=addNode(appV2Fixture(),'detail','profile',fixtureTables,null,''), profile=made.app.nodes.find(node=>node.id===made.id)!
  if(profile.type!=='profile')throw Error('fixture')
  profile.contacts=[{label:'Почта',kind:'email',value:{kind:'row',fieldId:'r_owner'}}]
  made.app.screens.find(screen=>screen.id==='detail')!.rootIds=[profile.id]
  const props={app:made.app,screenId:'detail',tables:fixtureTables,actor:fixtureActor,record:{id:'one',tableId:'requests',values:{r_title:'Марина',r_owner:'marina@example.com'}}}
  const view=render(<AppV2Renderer {...props} editing/>);expect(screen.getByRole('heading',{name:'Марина'})).toBeTruthy()
  expect(screen.getByRole('link',{name:'marina@example.com'}).getAttribute('href')).toBe('mailto:marina@example.com')
  view.rerender(<AppV2Renderer {...props}/>);expect(screen.getByRole('heading',{name:'Марина'})).toBeTruthy()
  view.rerender(<AppV2Renderer {...props} record={{...props.record,values:{r_title:'Марина'}}}/>);expect(screen.queryByRole('link')).toBeNull()
  expect(view.container.textContent).not.toContain('marina@example.com')
})
it('opens a history event with its own record and preserves custom actions inside duplicated profiles',()=>{
  const app=appV2Fixture(), table={...fixtureTables[0]!,fields:[...fixtureTables[0]!.fields,{id:'r_date',name:'Дата',type:'datetime' as const,timeZone:'Europe/Moscow'}]}, navigate=vi.fn()
  const list=app.nodes.find(node=>node.id==='request_list')!
  if(list.type!=='collection')throw Error('fixture')
  list.layout='history';list.dateFieldId='r_date';app.screens.find(screen=>screen.id==='home')!.rootIds=[list.id]
  render(<AppV2Renderer app={app} screenId="home" actor={fixtureActor} tables={[table]} rows={{requests_source:[{id:'one',tableId:table.id,values:{r_title:'Визит Марины',r_date:'2026-11-14T08:00:00Z'}}]}} onNavigate={navigate}/> )
  fireEvent.click(screen.getByRole('button',{name:/Визит Марины/}));expect(navigate).toHaveBeenCalledWith('detail','one')
  expect(screen.getByText(/11:00/)).toBeTruthy()
  const made=addNode(app,'detail','profile',fixtureTables,null,''), original=made.app.nodes.find(node=>node.id===made.id)!
  if(original.type!=='profile')throw Error('fixture')
  const action=addNode(made.app,'detail','button',fixtureTables,original.id,'')
  const copied=duplicateNode(action.app,'detail',original.id), copy=copied.app.nodes.find(node=>node.id===copied.id)!
  expect(appV2ChildIds(copy)).toHaveLength(1);expect(appV2ChildIds(copy)[0]).not.toBe(action.id)
})
it('creates history with an automatic relation to the open profile and keeps civil dates stable',()=>{
  const tables=[...fixtureTables,{id:'visits',name:'Визиты',primaryFieldId:'v_name',views:[],fields:[{id:'v_name',name:'Услуга',type:'text' as const},{id:'v_date',name:'Дата',type:'datetime' as const},{id:'v_client',name:'Клиент',type:'relation' as const,relationTableId:'requests'}]}]
  const made=addNode(appV2Fixture(),'detail','collection',tables,null,'visits',undefined,{history:true}), node=made.app.nodes.find(node=>node.id===made.id)!
  expect(node.type==='collection'&&node.layout).toBe('history')
  expect(made.app.sources.at(-1)).toMatchObject({screenTableId:'requests',filter:{op:'includes',right:{kind:'screen_row_id'}},sorts:[{fieldId:'v_date',direction:'desc'}]})
  expect(builderV2HistoryDate('2026-11-14','date','Pacific/Honolulu')).toContain('14')
  expect(builderV2HistoryDate('bad','datetime')).toBe('')
})
