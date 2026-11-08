import { expect,it } from 'vitest'
import { appV2Fixture,v2Catalog } from '../../../../packages/schema/src/app-v2/fixture.test-utils'
import { validateAppV2Definition } from '@tableapp/schema/app-definition'
import { builderV2ButtonAction,configureBuilderV2Button,configureBuilderV2ButtonWorkflow } from './builder-v2-button-action'
it('preserves owned row scopes and the sequence when roles change, and disconnects without removing table permissions',()=>{
  const app=appV2Fixture(),original=structuredClone(app)
  const next=configureBuilderV2Button(app,'complete_button',['worker']),node=next.nodes.find(node=>node.id==='complete_button')!,flow=builderV2ButtonAction(next,node)!.flow
  expect(flow.steps).toEqual(app.workflows.find(flow=>flow.id==='complete')!.steps)
  expect(validateAppV2Definition(next,v2Catalog).ok).toBe(true)
  const grant=next.policy.tables.find(rule=>rule.tableId==='requests')!.grants.filter(grant=>grant.audience.kind==='roles'&&grant.audience.roleIds.includes('worker')&&grant.update)
  expect(grant.every(grant=>grant.update!.rows.kind==='owned')).toBe(true)
  const off=configureBuilderV2Button(next,node.id,null)
  expect((off.nodes.find(item=>item.id===node.id) as typeof node)).toMatchObject({events:{press:null}})
  expect(off.policy.tables).toEqual(next.policy.tables);expect(app).toEqual(original)
})
it('clones shared definitions and refuses an edited workflow from a different event',()=>{
  const app=appV2Fixture(),button=app.nodes.find(node=>node.id==='complete_button')!
  if(button.type!=='button')throw new Error('Missing button')
  app.nodes.push({...button,id:'another_button'});app.screens.find(screen=>screen.id==='detail')!.rootIds.push('another_button')
  const flow=builderV2ButtonAction(app,button)!.flow,next=configureBuilderV2ButtonWorkflow(app,button.id,{...flow,name:'Закрыть заявку'})
  expect((next.nodes.find(node=>node.id===button.id) as typeof button).events.press).not.toBe(flow.id)
  expect(next.workflows.find(item=>item.id===flow.id)).toEqual(flow)
  expect(validateAppV2Definition(next,v2Catalog).ok).toBe(true)
  expect(()=>configureBuilderV2ButtonWorkflow(app,button.id,{...flow,id:'other'})).toThrow()
})
it('supports a context-free button, while form placement does not grant execution',()=>{
  const app=appV2Fixture(),button=app.nodes.find(node=>node.id==='complete_button')!
  if(button.type!=='button')throw new Error('Missing button')
  button.events.press=null;app.screens.find(screen=>screen.id==='detail')!.rootIds=app.screens.find(screen=>screen.id==='detail')!.rootIds.filter(id=>id!==button.id);app.screens.find(screen=>screen.id==='home')!.rootIds.push(button.id)
  const next=configureBuilderV2Button(app,button.id,['owner'])
  expect(builderV2ButtonAction(next,next.nodes.find(node=>node.id===button.id)!)!.flow.input).toEqual({rowTableId:null,screenTableId:null,formId:null})
  expect(validateAppV2Definition(next,v2Catalog).ok).toBe(true)
  const form=app.nodes.find(node=>node.type==='form')!;if(form.type!=='form')throw new Error('Missing form')
  app.screens.find(screen=>screen.id==='home')!.rootIds=app.screens.find(screen=>screen.id==='home')!.rootIds.filter(id=>id!==button.id);form.childIds.push(button.id)
  expect(()=>configureBuilderV2Button(app,button.id,['owner'])).toThrow('вне формы')
})
