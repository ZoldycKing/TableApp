import {rows} from '@tableapp/db'
import {compileTableFormulas,computeDerivedRow,relatedIndexFrom} from '@tableapp/formula'
import {systemRowData,type Field} from '@tableapp/schema'
import {readableAppV2Fields,type AppV2,type AppV2Actor,type AppV2Json} from '@tableapp/schema/app-v2'
import {and,asc,eq,inArray,isNull} from 'drizzle-orm'
import {formatCell} from './format'
import {builderV2Json,loadBuilderV2ReadMetadata,type BuilderV2ReadMetadata,type BuilderV2DerivedRow} from './builder-v2-row-data'
import type {RuntimeSourceRow} from './runtime-project'
import {RowWriteError} from './row-mutations'

export const publishedV2Fields=(app:AppV2,actor:AppV2Actor,row:RuntimeSourceRow)=>readableAppV2Fields(app,actor,{id:row.id,tableId:row.tableId,values:row.data as Record<string,AppV2Json>})
export const canReadPublishedV2Row=(app:AppV2,actor:AppV2Actor,row:RuntimeSourceRow)=>publishedV2Fields(app,actor,row).size>0

/** Apply row/field grants before relationship traversal, search or calculation. */
export async function derivePublishedV2Rows(meta:BuilderV2ReadMetadata,app:AppV2,actor:AppV2Actor,candidates:RuntimeSourceRow[],asOf=Date.now()):Promise<BuilderV2DerivedRow[]> {
  const roots=candidates.filter(row=>canReadPublishedV2Row(app,actor,row)),found=new Map<string,RuntimeSourceRow>(),allowed=new Map<string,ReadonlySet<string>>()
  let pending=roots
  while(pending.length){
    const wanted=new Map<string,Set<string>>()
    for(const row of pending){
      const key=`${row.tableId}:${row.id}`;if(found.has(key))continue
      const permitted=publishedV2Fields(app,actor,row);if(!permitted.size)continue
      found.set(key,row);allowed.set(key,permitted)
      if(found.size>20000)throw new RowWriteError('invalid','Слишком много связанных данных. Уменьшите количество связей.')
      for(const field of meta.fieldsByTable.get(row.tableId)??[])if(field.type==='relation'&&permitted.has(field.id)&&meta.fieldsByTable.has(field.options.tableId)){
        const ids=row.data[field.id],group=wanted.get(field.options.tableId)??new Set<string>()
        if(Array.isArray(ids))for(const id of ids)if(typeof id==='string'&&!found.has(`${field.options.tableId}:${id}`))group.add(id)
        wanted.set(field.options.tableId,group)
      }
    }
    pending=[]
    for(const [tableId,ids] of wanted){const list=[...ids];if(list.length>20000)throw new RowWriteError('invalid','Слишком много связанных данных');for(let offset=0;offset<list.length;offset+=200){const batch=await meta.runner.select().from(rows).where(and(eq(rows.tableId,tableId),inArray(rows.id,list.slice(offset,offset+200)),isNull(rows.deletedAt))).orderBy(asc(rows.id));pending.push(...batch as RuntimeSourceRow[])}}
  }
  // The calculation metadata cannot recreate a hidden computed field from its dependencies.
  const safe=new Map<string,Set<string>>()
  for(const row of found.values()){const fields=allowed.get(`${row.tableId}:${row.id}`)!,prior=safe.get(row.tableId);safe.set(row.tableId,prior?new Set([...prior].filter(id=>fields.has(id))):new Set(fields))}
  const formulas=new Map([...meta.fieldsByTable].map(([id,fields])=>[id,compileTableFormulas(fields)]))
  let changed=true
  while(changed){changed=false;for(const [tableId,ids] of safe)for(const field of meta.fieldsByTable.get(tableId)??[]){
    if(!ids.has(field.id))continue
    const formula=formulas.get(tableId)?.get(field.id)
    const relationId='relationFieldId' in field.options?field.options.relationFieldId:undefined
    const relation=(meta.fieldsByTable.get(tableId)??[]).find(item=>item.id===relationId)
    const target=relation?.type==='relation'?relation.options.tableId:null
    if(field.type==='formula'&&(!formula||[...formula.dependencies].some(id=>!ids.has(id)))||(field.type==='lookup'||field.type==='rollup'||field.type==='count')&&(!relation||!ids.has(relation.id)||field.type!=='count'&&(!target||!safe.get(target)?.has(field.options.targetFieldId)))){ids.delete(field.id);changed=true}
  }}
  const calculationFields=new Map([...meta.fieldsByTable].map(([id,fields])=>[id,fields.filter(field=>safe.get(id)?.has(field.id))]))
  const buckets=new Map<string,Map<string,Record<string,unknown>>>()
  for(const row of found.values()){
    const fields=meta.fieldsByTable.get(row.tableId)??[],permitted=allowed.get(`${row.tableId}:${row.id}`)!,raw=systemRowData(row,fields),data=Object.fromEntries(Object.entries(raw).filter(([id])=>permitted.has(id)&&safe.get(row.tableId)?.has(id)))
    for(const field of fields)if(field.type==='relation'&&Array.isArray(data[field.id]))data[field.id]=(data[field.id] as string[]).filter(id=>found.has(`${field.options.tableId}:${id}`))
    const bucket=buckets.get(row.tableId)??new Map();bucket.set(row.id,data);buckets.set(row.tableId,bucket)
  }
  const options={now:new Date(asOf)},related=relatedIndexFrom(buckets,calculationFields,options)
  return roots.map(row=>{
    const fields=meta.fieldsByTable.get(row.tableId)??[],compute=calculationFields.get(row.tableId)??[],raw=buckets.get(row.tableId)?.get(row.id)??{},data=computeDerivedRow(raw,compute,related,compileTableFormulas(compute),options)
    const display:Record<string,string>={}
    for(const field of fields)if(Object.hasOwn(data,field.id)){
      if(field.type==='relation'){
        const primary=meta.primaryByTable.get(field.options.tableId),target=meta.fieldsByTable.get(field.options.tableId)?.find(item=>item.id===primary)
        display[field.id]=(Array.isArray(data[field.id])?data[field.id] as string[]:[]).map(id=>target&&safe.get(field.options.tableId)?.has(target.id)?formatCell(target,related.get(field.options.tableId)?.get(id)?.[target.id])||'Без названия':'Запись').join(', ')
      }else display[field.id]=formatCell(field,data[field.id])
    }
    return {...row,data,display}
  })
}
export async function publishedV2Row(meta:Awaited<ReturnType<typeof loadBuilderV2ReadMetadata>>,app:AppV2,actor:AppV2Actor,tableId:string,recordId?:string,lock=false,includeDeleted=false){
  if(!recordId)throw new RowWriteError('missing','Запись недоступна')
  const query=meta.runner.select().from(rows).where(and(eq(rows.tableId,tableId),eq(rows.id,recordId),includeDeleted?undefined:isNull(rows.deletedAt))),[stored]=lock?await query.for('update'):await query
  if(!stored||!canReadPublishedV2Row(app,actor,stored as RuntimeSourceRow))throw new RowWriteError('missing','Запись недоступна')
  const [derived]=await derivePublishedV2Rows(meta,app,actor,[stored as RuntimeSourceRow])
  return {stored,record:{id:stored.id,tableId:stored.tableId,values:builderV2Json(derived!.data) as Record<string,AppV2Json>,display:derived!.display}}
}
