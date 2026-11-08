import type { Field,View } from '@tableapp/schema'

/** A saved condition must not disclose a value belonging to an inaccessible field. */
export function memberTableView(view:View,all:readonly Field[],visible:readonly Field[]):View{
  const allowed=new Set(visible.map(field=>field.id)),hidden=new Set(all.filter(field=>!allowed.has(field.id)).map(field=>field.id))
  if(!hidden.size)return view
  const scrub=(value:unknown):unknown=>{
    if(Array.isArray(value))return value.filter(item=>typeof item!=='string'||!hidden.has(item)).map(scrub).filter(item=>item!==undefined)
    if(!value||typeof value!=='object')return value
    const record=value as Record<string,unknown>
    if(typeof record.fieldId==='string'&&hidden.has(record.fieldId))return undefined
    return Object.fromEntries(Object.entries(record).filter(([key])=>!hidden.has(key)).map(([key,child])=>[key,typeof child==='string'&&key.endsWith('FieldId')&&hidden.has(child)?null:scrub(child)]))
  }
  return {...view,config:scrub(view.config)} as View
}
