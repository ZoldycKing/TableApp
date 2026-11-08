import {describe,expect,it} from 'vitest'
import {appV2Fixture,fixtureActor,fixtureTables} from '@/components/builder/v2/fixture.test-utils'
import {addBuilderLearningForm,builderLearningFormTarget} from './builder-learning-form'
import {configureBuilderV2FormSave} from './builder-v2-form-action'
describe('first save lesson form selection',()=>{
 it('uses an available configured form and ignores hidden or repeated forms',()=>{
  const app=appV2Fixture(),target=builderLearningFormTarget(app,fixtureActor)
  expect(target).toMatchObject({formId:'create_form',configured:true,mode:'create'})
  const form=app.nodes.find(node=>node.id==='create_form')!;form.visibleTo={kind:'roles',roleIds:['worker']}
  expect(builderLearningFormTarget(app,fixtureActor)).toBeNull()
 })
 it('adds a real form without granting write rights or replacing existing screens',()=>{
  const app=appV2Fixture();app.nodes=app.nodes.filter(node=>!['create_form','title_input','amount_input'].includes(node.id));app.screens=app.screens.filter(screen=>screen.id!=='new')
  const previous=structuredClone(app.policy),result=addBuilderLearningForm(app,fixtureTables)
  expect(result.app.policy).toEqual(previous);expect(app.screens.some(screen=>screen.id===result.screenId)).toBe(false)
  expect(builderLearningFormTarget(result.app,fixtureActor)).toMatchObject({formId:result.id,configured:false,tableId:'requests'})
  const configured=configureBuilderV2FormSave(result.app,result.id,['owner']);expect(builderLearningFormTarget(configured,fixtureActor)).toMatchObject({formId:result.id,configured:true})
 })
})
