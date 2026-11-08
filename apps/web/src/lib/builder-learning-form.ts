import {canOpenAppV2Screen,matchesAppV2Audience,type AppV2,type AppV2Actor} from '@tableapp/schema/app-v2'
import {builderV2SaveFormAction} from './builder-v2-form-action'
import {builderV2WorkingPath} from './builder-v2-working-scope'
import {builderLearningTarget} from './builder-learning-types'
import {addNode,newScreen} from '@/components/builder/v2/model'
import type {BuilderV2Table} from './builder-v2'

export function builderLearningFormTarget(app:AppV2,actor:AppV2Actor){
  const tableId=builderLearningTarget(app)?.tableId
  const forms=app.nodes.flatMap(node=>{
    if(node.type!=='form')return []
    const screen=app.screens.find(screen=>builderV2WorkingPath(app,screen.id,node.id))
    if(!screen||!canOpenAppV2Screen(app,actor,screen.id)||builderV2WorkingPath(app,screen.id,node.id)?.some(node=>node.visibleWhen||node.visibleTo&&!matchesAppV2Audience(node.visibleTo,actor))||node.mode==='edit'&&screen.contextTableId!==node.tableId)return []
    const action=builderV2SaveFormAction(app,node),grant=action&&app.policy.workflows.find(grant=>grant.workflowId===action.flow.id)
    const configured=Boolean(action&&grant&&matchesAppV2Audience(grant.audience,actor))
    return [{formId:node.id,screenId:screen.id,tableId:node.tableId,mode:node.mode,configured,contextTableId:screen.contextTableId,name:node.name}]
  })
  return forms.sort((a,b)=>Number(b.tableId===tableId)-Number(a.tableId===tableId)||Number(b.configured)-Number(a.configured)||Number(a.mode==='edit')-Number(b.mode==='edit'))[0]??null
}

/** Adds only the UI. The author explicitly configures the save action and its roles. */
export function addBuilderLearningForm(app:AppV2,tables:readonly BuilderV2Table[]){
  const target=builderLearningTarget(app),table=tables.find(table=>table.id===target?.tableId)??tables.find(table=>table.fields.some(field=>['text','number','email'].includes(field.type)))
  if(!table)throw new Error('Сначала добавьте таблицу с полями для записи')
  let name='Новая запись',number=2;while(app.screens.some(screen=>screen.name===name))name=`Новая запись ${number++}`
  const next=newScreen(app,name),screenId=next.screens.at(-1)!.id,result=addNode(next,screenId,'form',tables,null,table.id)
  return {...result,screenId}
}
