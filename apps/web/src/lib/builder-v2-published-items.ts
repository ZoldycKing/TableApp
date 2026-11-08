import {appV2ChildIds,evaluateAppV2Condition,matchesAppV2Audience,type AppV2,type AppV2Actor,type AppV2Node,type AppV2Record} from '@tableapp/schema/app-v2'

/** Return only per-row visibility decisions. Conditions and hidden values stay on the server. */
export function publishedV2ItemNodes(app:AppV2,actor:AppV2Actor,collection:Extract<AppV2Node,{type:'collection'}>,row:AppV2Record,screenRow?:AppV2Record){
  const visible:string[]=[],nodes=new Map(app.nodes.map(node=>[node.id,node]))
  const visit=(ids:readonly string[])=>{for(const id of ids){const node=nodes.get(id);if(!node||node.visibleTo&&!matchesAppV2Audience(node.visibleTo,actor))continue
    if(node.visibleWhen){const show=evaluateAppV2Condition(node.visibleWhen,{actor,row,screenRow});if(!show.ok||!show.value)continue}
    visible.push(id);visit(appV2ChildIds(node))
  }}
  visit(collection.itemIds);return visible
}
