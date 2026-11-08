import { compile } from '@tableapp/formula'
import type { Field } from '@tableapp/schema'

export type TablePermission = 'none' | 'view' | 'edit'
export type TableAccess = Record<string, TablePermission>
export type TableMember = { role: string; tableAccess?: TableAccess | null }
export const TABLE_PERMISSION_LABELS: Record<TablePermission,string> = { none:'Нет доступа',view:'Просмотр',edit:'Редактирование' }

export function restrictedTables(member: TableMember): boolean {
  return member.role !== 'owner' && member.tableAccess != null
}

/** The workspace role is the ceiling; missing entries in an explicit allowlist deny access. */
export function tablePermission(member: TableMember, tableId: string): TablePermission {
  if(member.role==='owner')return 'edit'
  if(member.role!=='editor'&&member.role!=='viewer')return 'none'
  if(!restrictedTables(member))return member.role==='editor'?'edit':'view'
  const level=member.tableAccess?.[tableId]
  if(level==='edit')return member.role==='editor'?'edit':'view'
  return level==='view'?'view':'none'
}

export function readableTableIds(member:TableMember):string[]|null {
  if(!restrictedTables(member)&&['owner','editor','viewer'].includes(member.role))return null
  return Object.keys(member.tableAccess??{}).filter(id=>tablePermission(member,id)!=='none')
}

/** Hide inaccessible relationships and every computed field depending on them. */
export function memberTableFields(fields:readonly Field[],member:TableMember):Field[]{
  if(!restrictedTables(member))return [...fields]
  const hidden=new Set(fields.filter(field=>field.type==='relation'&&tablePermission(member,field.options.tableId)==='none').map(field=>field.id))
  let changed=true
  while(changed){
    changed=false
    for(const field of fields){
      if(hidden.has(field.id))continue
      let blocked=false
      if(field.type==='lookup'||field.type==='rollup'||field.type==='count')blocked=hidden.has(field.options.relationFieldId)
      if(field.type==='number'&&field.options.initialFrom)blocked=hidden.has(field.options.initialFrom.relationFieldId)
      if(field.type==='formula'){
        try{blocked=compile(field.options.expression,fields).dependencies.some(id=>hidden.has(id))}
        catch{blocked=true}
      }
      if(blocked){hidden.add(field.id);changed=true}
    }
  }
  return fields.filter(field=>!hidden.has(field.id))
}

export function projectMemberData(data:Record<string,unknown>,fields:readonly Field[]):Record<string,unknown>{
  return Object.fromEntries(fields.filter(field=>Object.hasOwn(data,field.id)).map(field=>[field.id,data[field.id]]))
}
