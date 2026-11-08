import {expect,it} from 'vitest'
import {appV2Fixture} from '../../../../packages/schema/src/app-v2/fixture.test-utils'
import {builderV2PublicationError} from './builder-v2-publish'
it('rejects unsupported enter events and unconfigured read access before publication',()=>{
 const app=appV2Fixture();app.screens[0]!.events.enter='complete';expect(builderV2PublicationError(app)).toContain('при открытии')
 app.screens[0]!.events.enter=null;app.policy.tables=[];expect(builderV2PublicationError(app)).toContain('разрешите чтение')
})
it('supports server-checked per-row visibility while refusing ambiguous nested lists',()=>{
 const app=appV2Fixture(),list=app.nodes.find(node=>node.id==='request_list')!,field=structuredClone(app.nodes.find(node=>node.id==='request_title')!)
 if(list.type!=='collection')throw new Error('No list');field.id='conditional-item';field.visibleWhen={op:'eq',left:{kind:'row',fieldId:'r_title'},right:{kind:'literal',value:'Тест'}};list.itemIds=[field.id];app.nodes.push(field)
 expect(builderV2PublicationError(app)).toBeNull()
 list.itemIds.push('task_list');app.screens[0]!.rootIds=app.screens[0]!.rootIds.filter(id=>id!=='task_list');expect(builderV2PublicationError(app)).toContain('вложенный список')
})
