'use server'
import { appUsers, appWorkflowRuns, builderWorkflowRuns, db } from '@tableapp/db'
import { appV2IdSchema } from '@tableapp/schema/app-v2'
import { and, desc, eq, lt, or } from 'drizzle-orm'
import { authorizeApp } from '@/lib/authorize'
import { builderV2Enabled } from '@/lib/builder-v2'
import type { BuilderV2WorkflowRun, BuilderV2WorkflowTrace, BuilderV2WorkflowHistorySource } from '@/lib/builder-v2-workflow-types'
import { builderV2Revision } from '@/lib/builder-v2-revision'
import { historyCursor, readHistoryCursor } from '@/lib/history-cursor'
import { RowWriteError } from '@/lib/row-mutations'

type Cursor = { at: string; id: string }
export type BuilderV2WorkflowHistory = { ok: true; runs: BuilderV2WorkflowRun[]; next: string | null } | { ok: false; error: string; reset?: boolean }
export async function readBuilderV2WorkflowRunsAction(appId: string, before?: unknown, source: BuilderV2WorkflowHistorySource = 'author'): Promise<BuilderV2WorkflowHistory> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  if (!builderV2Enabled()) return { ok: false, error: 'История действий пока недоступна' }
  if(source!=='author'&&source!=='published')return {ok:false,error:'Выберите список запусков',reset:true}
  try {
    const binding=builderV2Revision(['builder-workflow-history',appId,auth.member.workspaceId,auth.member.userId,source])
    if(before!==undefined&&typeof before!=='string')return {ok:false,error:'Обновите список запусков',reset:true}
    const input=readHistoryCursor(before as string|undefined,binding) as Cursor|null
    if(input&&(typeof input.at!=='string'||!Number.isFinite(Date.parse(input.at))||!appV2IdSchema.safeParse(input.id).success))return {ok:false,error:'Обновите список запусков',reset:true}
    const at=input?new Date(input.at):null, table=source==='published'?appWorkflowRuns:builderWorkflowRuns
    const where=and(eq(table.workspaceId,auth.member.workspaceId),eq(table.appId,appId),source==='author'?eq(table.userId,auth.member.userId):undefined,input&&at?or(lt(table.createdAt,at),and(eq(table.createdAt,at),lt(table.id,input.id))):undefined)
    const raw=source==='author'
      ?(await db.select().from(builderWorkflowRuns).where(where).orderBy(desc(builderWorkflowRuns.createdAt),desc(builderWorkflowRuns.id)).limit(11)).map(run=>({run,actor:undefined}))
      :await db.select({run:appWorkflowRuns,actor:{name:appUsers.name,email:appUsers.email}}).from(appWorkflowRuns).innerJoin(appUsers,and(eq(appUsers.appId,appWorkflowRuns.appId),eq(appUsers.id,appWorkflowRuns.userId))).where(where).orderBy(desc(appWorkflowRuns.createdAt),desc(appWorkflowRuns.id)).limit(11)
    const visible=raw.slice(0,10),last=visible.at(-1)?.run
    return {ok:true,runs:visible.map(({run,actor})=>({id:run.id,createdAt:run.createdAt.toISOString(),workflowName:run.workflowName,status:run.status,error:run.error,trace:run.trace as BuilderV2WorkflowTrace,...(actor?{actor}:{})})),next:raw.length>10&&last?historyCursor({at:last.createdAt.toISOString(),id:last.id},binding):null}
  } catch(error) { return { ok: false, error: error instanceof RowWriteError?'Обновите список запусков':'Не удалось загрузить историю. Попробуйте ещё раз.',...(error instanceof RowWriteError?{reset:true}:{}) } }
}
