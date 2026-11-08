import {publishedV2EnterState} from './builder-v2-enter'
import {builderV2RecordParent,collectionCardScreen} from '@/components/builder/v2/collection-navigation'
import {publishedV2Node} from './builder-v2-published-data'
import {builderV2NodeAction} from './builder-v2-button-action'
import {db} from '@tableapp/db'
import {appV2ChildIds,authorizeAppV2Write,canInvokeAppV2Workflow,canOpenAppV2Screen,matchesAppV2Audience,evaluateAppV2Condition,type AppV2,type AppV2Json,type AppV2Node} from '@tableapp/schema/app-v2'
import {withPublishedV2Read,publishedV2Context,publishedV2Screen} from './builder-v2-published'
import {loadBuilderV2ReadMetadata} from './builder-v2-row-data'
import {publishedV2Row} from './builder-v2-published-rows'
import {publishedV2ButtonState} from './builder-v2-published-write'
import {RowWriteError} from './row-mutations'
import type {BuilderV2ButtonState} from './builder-v2-button-types'
import type {BuilderV2Table} from './builder-v2'
import {builderV2FormInputs} from './builder-v2-form-types'
import { builderBusinessLink, loadBuilderBusinessTargets } from './builder-v2-business'
import type { BuilderBusinessLink } from './builder-v2-business-types'
import { builderV2ScreenNodes } from './builder-v2-data-types'
import { builderV2StatusColumn } from './builder-v2-order-summary'
import { builderV2StatusForm } from './builder-v2-status-form'
import { isBuilderV2OrderTable } from '@/components/builder/v2/record-presentation'

/** Only the current visible page is serialized; access lists, policies and action bodies stay server-side. */
export async function loadPublishedV2Page(slug:string,request:{screen?:string;row?:string}){
  return withPublishedV2Read(async tx=>{
    const current=await publishedV2Context(slug,tx),{app,actor,revision}=current,visibleScreens=app.screens.filter(screen=>canOpenAppV2Screen(app,actor,screen.id))
    if(!visibleScreens.length)return {login:true as const,id:app.id,workspaceId:app.workspaceId,name:app.name,accent:app.theme.accent,theme:app.theme,appearance:app.appearance}
    const screen=publishedV2Screen(app,actor,request.screen??(visibleScreens.find(screen=>screen.id===app.homeScreenId)??visibleScreens.find(screen=>!screen.contextTableId)??visibleScreens[0])!.id)
    if(request.row&&!screen.contextTableId)throw new RowWriteError('denied','Запись недоступна')
    const selected=screen.contextTableId&&request.row?await publishedV2Row(await loadBuilderV2ReadMetadata(tx,app.workspaceId,[screen.contextTableId]),app,actor,screen.contextTableId,request.row):undefined
    const targetIds = [...new Set(builderV2ScreenNodes(app, screen.id).flatMap(node => node.type === 'business' && node.target ? [node.target.appId] : []))]
    const businessTargets = await loadBuilderBusinessTargets(app.workspaceId, current.catalog.views, tx, targetIds)
    const businessLinks: Record<string, BuilderBusinessLink> = {}
    const map=new Map(app.nodes.map(node=>[node.id,node])),nodes:AppV2Node[]=[],buttons:Record<string,BuilderV2ButtonState>={},rowActions:Record<string,{name:string}>={}
    const visit=async(ids:readonly string[],repeated=false):Promise<string[]>=>{
      const kept:string[]=[]
      for(const id of ids){const node=map.get(id);if(!node||node.visibleTo&&!matchesAppV2Audience(node.visibleTo,actor))continue
        if(selected&&'value'in node&&(!repeated&&node.value.kind==='row'||node.value.kind==='screen_row')&&!Object.hasOwn(selected.record.values,node.value.fieldId))continue
        if(node.visibleWhen&&!repeated){const result=evaluateAppV2Condition(node.visibleWhen,{actor,row:selected?.record,screenRow:selected?.record});if(!result.ok||!result.value)continue}
        if(node.type==='button'&&(!actor.authenticated||!node.events.press||!canInvokeAppV2Workflow(app,actor,node.events.press)))continue
        if(node.type==='form'&&(!actor.authenticated||!node.events.submit||!canInvokeAppV2Workflow(app,actor,node.events.submit)))continue
        let safe:AppV2Node={...node,visibleTo:null,visibleWhen:null}
        if (node.type === 'business') {
          const link = !repeated && builderBusinessLink(businessTargets, node, actor, selected?.record)
          if (!link) continue
          businessLinks[node.id] = link
          safe = { ...node, visibleTo: null, visibleWhen: null, target: null }
        }
        const children=await visit(appV2ChildIds(node),repeated||node.type==='collection');if('childIds'in safe)safe={...safe,childIds:children};if(safe.type==='collection')safe={...safe,itemIds:children,kanbanMoveRoleIds:undefined}
        if(safe.type==='collection'&&actor.authenticated&&safe.events.itemPress&&canInvokeAppV2Workflow(app,actor,safe.events.itemPress)&&!collectionCardScreen(app,node)){const action=builderV2NodeAction(app,node);if(action)rowActions[safe.id]={name:action.flow.name}}
        if(safe.type==='button'&&!repeated&&(!screen.contextTableId||request.row))buttons[id]=(await publishedV2ButtonState(current,tx,{screenId:screen.id,nodeId:id,...(request.row?{recordId:request.row}:{})})).state
        nodes.push(safe);kept.push(id)
      }
      return kept
    }
    const rootIds=await visit(screen.rootIds)
    const recordTable = current.tables.find(table => table.id === screen.contextTableId)
    const statusField = recordTable?.fields.find(field => field.type === 'single_select' && builderV2StatusColumn(field))
    const groupedOrder = app.nodes.some(node => node.type === 'collection' && node.recordGroup && collectionCardScreen(app, node) === screen.id)
    const statusFormId = selected && !groupedOrder && isBuilderV2OrderTable(recordTable) && statusField && Object.hasOwn(selected.record.values, statusField.id) &&
      authorizeAppV2Write(app, actor, { operation: 'update', row: { ...selected.record, values: selected.stored.data as Record<string, AppV2Json> }, values: { [statusField.id]: null } }).ok
      ? rootIds.find(id => {
        const node = map.get(id)
        return node?.type === 'form' && node.tableId === screen.contextTableId && builderV2StatusForm(app, node, actor, statusField.id)
      }) : undefined
    const parent = builderV2RecordParent(app, screen.id, (parentId, node) => {
      if (!node.events.itemPress || !canOpenAppV2Screen(app, actor, parentId) || !canInvokeAppV2Workflow(app, actor, node.events.itemPress)) return false
      try {
        return Boolean(publishedV2Node(app, actor, parentId, node.id))
      } catch (error) {
        if (error instanceof RowWriteError && error.code === 'denied') return false
        throw error
      }
    })
    const queue = selected ? parent?.queue : undefined
    if (queue) nodes.push({ ...queue, visibleTo: null, visibleWhen: null })
    const sourceIds=new Set(nodes.flatMap(node=>'sourceId'in node?[node.sourceId]:[])),tableIds=new Set(nodes.flatMap(node=>node.type==='form'?[node.tableId]:[]))
    if(screen.contextTableId)tableIds.add(screen.contextTableId)
    const sources=app.sources.filter(source=>sourceIds.has(source.id)).map(source=>{tableIds.add(source.tableId);return {...source,filter:null,sorts:[],viewId:null}})
    const fields=new Map<string,Set<string>>()
    for(const rule of app.policy.tables)for(const grant of rule.grants)if(grant.read&&matchesAppV2Audience(grant.audience,actor)){const ids=fields.get(rule.tableId)??new Set<string>();grant.read.fieldIds.forEach(id=>ids.add(id));fields.set(rule.tableId,ids)}
    for(const node of nodes)if(node.type==='form'){const ids=fields.get(node.tableId)??new Set<string>();for(const input of builderV2FormInputs(app,node))ids.add(input.fieldId);fields.set(node.tableId,ids)}
    const tables:BuilderV2Table[]=current.tables.filter(table=>tableIds.has(table.id)).map(table=>({...table,fields:table.fields.filter(field=>fields.get(table.id)?.has(field.id)),views:[]}))
    const navigationIds=new Set(nodes.flatMap(node=>node.type==='collection'&&node.events.itemPress&&collectionCardScreen(app,node)?[node.events.itemPress]:[]))
    const workflows=app.workflows.filter(flow=>navigationIds.has(flow.id)&&canInvokeAppV2Workflow(app,actor,flow.id)).map(flow=>({...flow,steps:flow.steps.filter(step=>step.type==='open_screen'&&canOpenAppV2Screen(app,actor,step.screenId))}))
    const safe:AppV2={...app,authentication:{mode:'invite_only',defaultRoleId:null,members:[]},roles:app.roles.filter(role=>actor.roleIds.includes(role.id)),policy:{tables:[],workflows:[]},screens:visibleScreens.map(item=>({...item,catalog:item.id===screen.id?item.catalog:undefined,rootIds:item.id===screen.id?rootIds:queue&&item.id===parent?.screenId?[queue.id]:[],events:{enter:null}})),nodes,sources,workflows}
    const enter=(!screen.contextTableId||request.row)?await publishedV2EnterState(current,tx,{screenId:screen.id,...(request.row?{recordId:request.row}:{})}):undefined
    const titleFieldId = screen.catalog?.titleFieldId ?? screen.recordTitleFieldId ?? current.tables.find(table=>table.id===screen.contextTableId)?.primaryFieldId
    return {login:false as const,...(enter?{enter}:{}),app:safe,tables,actor,revision,screenId:screen.id,...(parent?{sectionId:parent.screenId}:{}),...(statusFormId?{statusFormId}:{}),recordId:request.row,record:selected?.record,title:selected?(titleFieldId&&selected.record.display[titleFieldId]||'Запись'):screen.name,buttons,rowActions,...(Object.keys(businessLinks).length ? { businessLinks } : {})}
  })
}
