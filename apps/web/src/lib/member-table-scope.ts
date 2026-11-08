import { inArray,type AnyColumn } from 'drizzle-orm'
import { readableTableIds,type TableMember } from './table-permissions'

export function memberTableScope(member:TableMember,column:AnyColumn){
  const allowed=readableTableIds(member)
  return allowed===null?undefined:inArray(column,allowed)
}
