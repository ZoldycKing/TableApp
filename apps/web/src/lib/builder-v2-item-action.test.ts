import {expect,it} from 'vitest'
import {appV2Fixture,v2Catalog} from '../../../../packages/schema/src/app-v2/fixture.test-utils'
import {validateAppV2Definition} from '@tableapp/schema/app-definition'
import {configureBuilderV2ItemAction,configureBuilderV2ItemWorkflow} from './builder-v2-item-action'
import {builderV2NodeAction} from './builder-v2-button-action'
import {collectionCardScreen} from '@/components/builder/v2/collection-navigation'

it('switches card navigation to an explicitly authorized chain and retains owned write scopes',()=>{
 const original=appV2Fixture(),app=configureBuilderV2ItemAction(original,'request_list',['worker']),node=app.nodes.find(node=>node.id==='request_list')!,flow=builderV2NodeAction(app,node)!.flow
 expect(collectionCardScreen(app,node)).toBeUndefined();expect(flow.input).toEqual({rowTableId:'requests',screenTableId:null,formId:null})
 const next=configureBuilderV2ItemWorkflow(app,node.id,{...flow,name:'Завершить',steps:[{id:'finish',type:'update_row',tableId:'requests',target:{kind:'current'},values:{r_status:{kind:'literal',value:'Готово'}}}]})
 expect(validateAppV2Definition(next,v2Catalog).ok).toBe(true)
 const grants=next.policy.tables.find(rule=>rule.tableId==='requests')!.grants.filter(grant=>grant.audience.kind==='roles'&&grant.audience.roleIds.includes('worker')&&grant.update)
 expect(grants.every(grant=>grant.update!.rows.kind==='owned')).toBe(true)
 expect(collectionCardScreen(original,original.nodes.find(other=>other.id===node.id)!)).toBe('detail')
 const off=configureBuilderV2ItemAction(next,node.id,null);expect(off.policy.tables).toEqual(next.policy.tables);expect(builderV2NodeAction(off,off.nodes.find(other=>other.id===node.id)!)).toBeNull()
})
it('clones a shared itemPress definition and preserves the other event and its grants',()=>{
 let app=configureBuilderV2ItemAction(appV2Fixture(),'request_list',['owner']),node=app.nodes.find(node=>node.id==='request_list')!;if(node.type!=='collection')throw new Error('No list')
 app.nodes.push({...node,id:'second-list'});app.screens[0]!.rootIds.push('second-list')
 const flow=builderV2NodeAction(app,node)!.flow,next=configureBuilderV2ItemWorkflow(app,node.id,{...flow,name:'Только первый список'})
 expect(builderV2NodeAction(next,next.nodes.find(other=>other.id===node.id)!)!.flow.id).not.toBe(flow.id);expect(next.workflows.find(item=>item.id===flow.id)).toEqual(flow)
 expect(next.policy.workflows.some(grant=>grant.workflowId===flow.id)).toBe(true);expect(validateAppV2Definition(next,v2Catalog).ok).toBe(true)
})
it('keeps related row and parent contexts distinct and refuses foreign workflows and nested lists',()=>{
 const base=appV2Fixture(),list=base.nodes.find(node=>node.id==='task_list')!;if(list.type!=='collection')throw new Error('No list')
 base.screens[0]!.rootIds=base.screens[0]!.rootIds.filter(id=>id!==list.id);base.screens.find(screen=>screen.id==='detail')!.rootIds.push(list.id)
 const app=configureBuilderV2ItemAction(base,list.id,['owner']),flow=builderV2NodeAction(app,app.nodes.find(node=>node.id===list.id)!)!.flow
 expect(flow.input).toEqual({rowTableId:'tasks',screenTableId:'requests',formId:null})
 expect(()=>configureBuilderV2ItemWorkflow(app,list.id,{...flow,id:'another'})).toThrow()
 expect(()=>configureBuilderV2ItemAction(app,list.id,['undeclared'])).toThrow()
 const parent=base.nodes.find(node=>node.id==='request_list')!;if(parent.type!=='collection')throw new Error('No parent')
 base.screens.find(screen=>screen.id==='detail')!.rootIds=base.screens.find(screen=>screen.id==='detail')!.rootIds.filter(id=>id!==list.id);parent.itemIds=[list.id]
 expect(()=>configureBuilderV2ItemAction(base,list.id,['owner'])).toThrow()
})
