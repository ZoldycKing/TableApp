import {appV2ChildIds,type AppV2,type AppV2Audience,type AppV2RowScope} from '@tableapp/schema/app-v2'
export function configureBuilderV2Read(app:AppV2,tableId:string,audience:AppV2Audience,fieldIds:string[],scope:AppV2RowScope):AppV2{
  const rule=app.policy.tables.find(rule=>rule.tableId===tableId),grants:AppV2['policy']['tables'][number]['grants']=[]
  for(const grant of rule?.grants??[]){
    const same=audience.kind==='public'?grant.audience.kind==='public':grant.audience.kind==='roles'&&grant.audience.roleIds.includes(audience.roleIds[0]!)
    if(!same||!grant.read){grants.push(grant);continue}
    if(audience.kind==='roles'&&grant.audience.kind==='roles'){const remaining=grant.audience.roleIds.filter(id=>id!==audience.roleIds[0]);if(remaining.length)grants.push({...grant,audience:{kind:'roles',roleIds:remaining}})}
    const {read:_,...write}=grant;if(write.create||write.update||write.delete)grants.push({...write,audience})
  }
  if(fieldIds.length)grants.push({audience,read:{fieldIds:[...new Set(fieldIds)],rows:scope}})
  const next={tableId,grants},others=app.policy.tables.filter(rule=>rule.tableId!==tableId)
  return {...app,policy:{...app.policy,tables:grants.length?[...others,next]:others}}
}

export function configureBuilderV2ScreenAccess(app:AppV2,screenId:string,roleId:string,allowed:boolean):AppV2{
  if(!app.screens.some(screen=>screen.id===screenId))return app
  const screens=app.screens.map(screen=>{
    if(screen.id!==screenId)return screen
    if(roleId==='public')return {...screen,audience:allowed?{kind:'public' as const}:{kind:'roles' as const,roleIds:app.roles.map(role=>role.id)}}
    if(screen.audience.kind==='public')return screen
    if(!allowed&&screen.audience.roleIds.length===1&&screen.audience.roleIds[0]===roleId)return screen
    return {...screen,audience:{kind:'roles' as const,roleIds:allowed?[...new Set([...screen.audience.roleIds,roleId])]:screen.audience.roleIds.filter(id=>id!==roleId)}}
  })
  return syncBuilderV2CardAccess({...app,screens})
}

/** Only pure card navigation follows screen access; mutation grants stay explicit. */
export function syncBuilderV2CardAccess(app:AppV2):AppV2{
  const navigation=new Map<string,AppV2Audience[]>(),nodeMap=new Map(app.nodes.map(node=>[node.id,node]))
  for(const screen of app.screens){
    const visit=(ids:readonly string[])=>{for(const id of ids){const node=nodeMap.get(id);if(!node)continue;if(node.type==='collection'&&node.events.itemPress){const flow=app.workflows.find(flow=>flow.id===node.events.itemPress);if(flow?.steps.length===1&&flow.steps[0]?.type==='open_screen'){const audiences=navigation.get(flow.id)??[];audiences.push(screen.audience);navigation.set(flow.id,audiences)}}visit(appV2ChildIds(node))}}
    visit(screen.rootIds)
  }
  const workflows=app.policy.workflows.filter(grant=>!navigation.has(grant.workflowId))
  for(const [workflowId,audiences]of navigation){const audience:AppV2Audience=audiences.some(audience=>audience.kind==='public')?{kind:'public'}:{kind:'roles',roleIds:[...new Set(audiences.flatMap(audience=>audience.kind==='roles'?audience.roleIds:[]))]};if(audience.kind==='public'||audience.roleIds.length)workflows.push({workflowId,audience})}
  return {...app,policy:{...app.policy,workflows}}
}
