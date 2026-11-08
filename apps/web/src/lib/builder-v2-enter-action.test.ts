import {expect,it} from 'vitest'
import {appV2Fixture,v2Catalog} from '../../../../packages/schema/src/app-v2/fixture.test-utils'
import {validateAppV2Definition} from '@tableapp/schema/app-definition'
import {configureBuilderV2Enter,configureBuilderV2EnterWorkflow,builderV2EnterAction} from './builder-v2-enter-action'
import {configureBuilderV2Button} from './builder-v2-button-action'
import {builderV2PublicationError} from './builder-v2-publish'
it('configures an explicit screen event without mutating the app or unrelated grants',()=>{
 const app=appV2Fixture(),before=structuredClone(app),next=configureBuilderV2Enter(app,'home',['owner']);expect(app).toEqual(before);expect(next.policy.tables).toEqual(app.policy.tables);expect(validateAppV2Definition(next,v2Catalog).ok).toBe(true);expect(builderV2PublicationError(next)).toBeNull();expect(builderV2EnterAction(next,'home')?.flow.input).toEqual({formId:null,rowTableId:null,screenTableId:null});expect(()=>configureBuilderV2Enter(app,'home',['unknown'])).toThrow('роль')
 const disabled=configureBuilderV2Enter(next,'home',null);expect(disabled.screens.find(screen=>screen.id==='home')!.events.enter).toBeNull();expect(disabled.policy.tables).toEqual(next.policy.tables)
})
it('copies shared workflows in either editor instead of changing a screen and button together',()=>{
 let app=configureBuilderV2Enter(appV2Fixture(),'home',['owner']);const flow=builderV2EnterAction(app,'home')!.flow;app.nodes.push({id:'ping',name:'Кнопка',type:'button',label:'Кнопка',variant:'primary',events:{press:flow.id},visibleTo:null,visibleWhen:null});app.screens.find(screen=>screen.id==='home')!.rootIds.push('ping')
 const edited=configureBuilderV2EnterWorkflow(app,'home',{...flow,name:'Экран отдельно'});expect(builderV2EnterAction(edited,'home')!.flow.id).not.toBe(flow.id);expect(edited.nodes.find(node=>node.id==='ping')).toMatchObject({events:{press:flow.id}})
 const button=configureBuilderV2Button(app,'ping',['owner'],{...flow,name:'Кнопка отдельно'});expect(builderV2EnterAction(button,'home')!.flow).toEqual(flow);expect(button.nodes.find(node=>node.id==='ping')).not.toMatchObject({events:{press:flow.id}})
})
it('retains context and explicit grants when editing steps, and rejects an incompatible event before publication',()=>{
 const app=configureBuilderV2Enter(appV2Fixture(),'detail',['worker']),flow=builderV2EnterAction(app,'detail')!.flow,next=configureBuilderV2EnterWorkflow(app,'detail',{...flow,steps:[{id:'update',type:'update_row',tableId:'requests',target:{kind:'current'},values:{r_title:{kind:'literal',value:'Новое название'}}}]});expect(validateAppV2Definition(next,v2Catalog).ok).toBe(true);expect(builderV2EnterAction(next,'detail')!.flow.input.rowTableId).toBe('requests')
 const invalid=structuredClone(next);invalid.workflows.find(item=>item.id===flow.id)!.input.rowTableId=null;expect(builderV2PublicationError(invalid)).toContain('действие при открытии');expect(configureBuilderV2Enter(invalid,'detail',null).screens.find(screen=>screen.id==='detail')!.events.enter).toBeNull()
})
