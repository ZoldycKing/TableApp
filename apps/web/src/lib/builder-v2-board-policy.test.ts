import {expect,it} from 'vitest'
import {appV2Fixture} from '../../../../packages/schema/src/app-v2/fixture.test-utils'
import {builderV2CanMove,configureBuilderV2BoardMove} from './builder-v2-board-policy'
it('keeps owned-row restrictions while opting roles in, and disables moving without erasing unrelated grants',()=>{
 const app=appV2Fixture(),node=app.nodes.find(node=>node.id==='request_list')!;if(node.type!=='collection')throw new Error('Fixture');node.layout='kanban';node.groupFieldId='r_status'
 const own={id:'row_a',tableId:'requests',values:{r_owner:'anna@example.com',r_status:'new'}},other={...own,id:'row_b',values:{...own.values,r_owner:'other@example.com'}},actor={authenticated:true,id:'anna',roleIds:['worker'],email:'anna@example.com',name:'Анна',company:''}
 expect(builderV2CanMove(app,node,actor,own)).toBe(false);const configured=configureBuilderV2BoardMove(app,node.id,['worker','worker']),next=configured.nodes.find(item=>item.id===node.id)!;expect(next).toMatchObject({kanbanMoveRoleIds:['worker']});expect(builderV2CanMove(configured,next,actor,own)).toBe(true);expect(builderV2CanMove(configured,next,actor,other)).toBe(false);expect(builderV2CanMove(configured,next,{...actor,authenticated:false},own)).toBe(false)
 const disabled=configureBuilderV2BoardMove(configured,node.id,null);expect(builderV2CanMove(disabled,disabled.nodes.find(item=>item.id===node.id)!,actor,own)).toBe(false);expect(disabled.policy.tables).toEqual(configured.policy.tables);expect(()=>configureBuilderV2BoardMove(app,node.id,['unknown'])).toThrow()
})
