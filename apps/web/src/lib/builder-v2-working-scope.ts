import type { AppV2, AppV2Node } from '@tableapp/schema/app-v2'
import {appV2ChildIds} from '@tableapp/schema/app-v2'

/** Buttons and itemPress share one canonical row context; forms and nested lists stay separate. */
export function builderV2ActionContext(app:AppV2,screenId:string,nodeId:string){
  const screen=app.screens.find(screen=>screen.id===screenId),nodes=new Map(app.nodes.map(node=>[node.id,node])),seen=new Set<string>()
  const visit=(ids:readonly string[],parents:AppV2Node[]):AppV2Node[]|null=>{
    for(const id of ids){if(seen.has(id))continue;seen.add(id);const node=nodes.get(id);if(!node)continue
      const path=[...parents,node];if(node.id===nodeId)return path
      const found=visit(appV2ChildIds(node),path);if(found)return found
    }return null
  }
  const path=visit(screen?.rootIds??[],[])
  const target=path?.at(-1);if(!screen||!path||!target||!['button','collection'].includes(target.type)||path.some(node=>node.type==='form'))return null
  const lists=path.filter((node):node is Extract<AppV2Node,{type:'collection'}>=>node.type==='collection')
  if(lists.length>1)return null
  const collection=lists[0],source=collection?app.sources.find(source=>source.id===collection.sourceId):undefined
  if(collection&&!source)return null
  return {screen,path,collection,source,event:target.type==='collection'?'itemPress' as const:'press' as const,rowTableId:source?.tableId??screen.contextTableId,screenTableId:screen.contextTableId}
}

export function builderV2ButtonContext(app:AppV2,screenId:string,nodeId:string){const context=builderV2ActionContext(app,screenId,nodeId);return context?.event==='press'?context:null}

/** First private actions support the screen record, never an ambiguous repeated item. */
export function builderV2WorkingPath(app: AppV2, screenId: string, nodeId: string): AppV2Node[] | null {
  const nodes = new Map(app.nodes.map(node => [node.id, node])), seen = new Set<string>()
  const visit = (ids: readonly string[]): AppV2Node[] | null => {
    for (const id of ids) {
      if (seen.has(id)) continue
      seen.add(id)
      const node = nodes.get(id)
      if (!node) continue
      if (id === nodeId) return [node]
      if (node.type === 'group' || node.type === 'columns') { const children = visit(node.childIds); if (children) return [node, ...children] }
    }
    return null
  }
  return visit(app.screens.find(screen => screen.id === screenId)?.rootIds ?? [])
}
