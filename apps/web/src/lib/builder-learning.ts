import { createHash } from 'node:crypto'
import { apps, builderLearning, db } from '@tableapp/db'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { and, eq, sql } from 'drizzle-orm'
import type { Transaction } from './db-transaction'
import type { Member } from './session'
import { BUILDER_LEARNING_STEPS, builderLearningListSettings, builderLearningTarget, type BuilderLearningIntent, type BuilderLearningProgress, type BuilderLearningResult } from './builder-learning-types'
import { builderV2Revision } from './builder-v2-revision'
import { builderV2PublicationError } from './builder-v2-publish'

type Author = Pick<Member, 'userId' | 'workspaceId'>
type ProgressRow = typeof builderLearning.$inferSelect
const ownProgress = (appId: string, author: Author) => and(eq(builderLearning.appId, appId), eq(builderLearning.workspaceId, author.workspaceId), eq(builderLearning.userId, author.userId))
const fingerprint = (app: AppV2, nodeId: string) => createHash('sha256').update(builderLearningListSettings(app, nodeId) ?? '').digest('hex')
const updatedAt = sql`greatest(clock_timestamp(), ${builderLearning.updatedAt} + interval '1 millisecond')`
function present(row: ProgressRow, app: AppV2): BuilderLearningProgress {
  return { version: 1, revision: row.updatedAt.toISOString(), list: row.listDone ? 'done' : row.listSkipped ? 'skipped' : 'pending', record: row.recordDone ? 'done' : row.recordSkipped ? 'skipped' : 'pending', save:row.saveDone?'done':row.saveSkipped?'skipped':'pending', access:row.accessDone?'done':row.accessSkipped?'skipped':'pending', publish:row.publishDone?'done':row.publishSkipped?'skipped':'pending', paused: row.paused, target: builderLearningTarget(app, row.targetNodeId) }
}
export async function loadBuilderLearning(app: AppV2, author: Author, connection: Transaction | typeof db = db) {
  const [row] = await connection.select().from(builderLearning).where(ownProgress(app.id, author))
  return row?.version === 1 ? present(row, app) : null
}
async function lockedApp(tx: Transaction, appId: string, author: Author) {
  const [record] = await tx.select({ draft: apps.draft }).from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, author.workspaceId))).for('share')
  const read = readAppDefinition(record?.draft)
  return read.ok && read.formatVersion === 2 && read.app.id === appId && read.app.workspaceId === author.workspaceId ? read.app : null
}

export async function changeBuilderLearning(appId: string, author: Author, intent: BuilderLearningIntent): Promise<BuilderLearningResult> {
  return db.transaction(async tx => {
    const app = await lockedApp(tx, appId, author)
    if (!app) return { ok: false, error: 'Обучение доступно в новом конструкторе' }
    if (intent === 'start' || intent === 'resume') {
      const target = builderLearningTarget(app)
      const [existing]=await tx.select().from(builderLearning).where(ownProgress(appId,author))
      if (!target&&!existing) return { ok: false, error: 'Сначала добавьте список из своей таблицы. Затем можно будет пройти первые шаги.' }
      if(target)await tx.insert(builderLearning).values({ appId, workspaceId: author.workspaceId, userId: author.userId, targetNodeId: target.nodeId, baseline: fingerprint(app, target.nodeId) }).onConflictDoNothing()
    }
    const [row] = await tx.select().from(builderLearning).where(ownProgress(appId, author)).for('update')
    if (!row) return { ok: true, progress: null }
    if (row.version !== 1) return { ok: false, error: 'Обновите страницу, чтобы продолжить обучение' }
    const patch: Omit<Partial<typeof builderLearning.$inferInsert>, 'updatedAt'> & { updatedAt: typeof updatedAt } = { updatedAt }
    if (intent === 'pause') patch.paused = true
    if (intent === 'resume') {
      patch.paused = false
      if (!builderLearningTarget(app, row.targetNodeId)&&builderLearningTarget(app)) {
        const target = builderLearningTarget(app)!
        patch.targetNodeId = target.nodeId; patch.baseline = fingerprint(app, target.nodeId)
      }
    }
    for(const step of BUILDER_LEARNING_STEPS){
      const done=`${step}Done` as const, skipped=`${step}Skipped` as const
      if(intent===`skip_${step}`&&!row[done])patch[skipped]=true
      if(intent===`retry_${step}`&&row[skipped]){patch[skipped]=false;patch.paused=false;if(step==='list')patch.baseline=fingerprint(app,row.targetNodeId)}
    }
    // Starting an existing lesson must never reset pause, skipped or completed steps.
    if (intent === 'start') return { ok: true, progress: present(row, app) }
    const [saved] = await tx.update(builderLearning).set(patch).where(ownProgress(appId, author)).returning()
    return { ok: true, progress: present(saved!, app) }
  })
}

/** Called only after a validated draft save in the same transaction. Renaming does not count. */
export async function learningAfterDraftSave(tx: Transaction, previous: AppV2, next: AppV2, author: Author) {
  const [row] = await tx.select().from(builderLearning).where(ownProgress(next.id, author)).for('update')
  if (!row || row.version !== 1) return null
  if (!row.listDone && builderLearningTarget(next, row.targetNodeId) && builderLearningListSettings(previous, row.targetNodeId) !== builderLearningListSettings(next, row.targetNodeId) && fingerprint(next, row.targetNodeId) !== row.baseline) {
    const [saved] = await tx.update(builderLearning).set({ listDone: true, listSkipped: false, updatedAt }).where(ownProgress(next.id, author)).returning()
    return present(saved!, next)
  }
  return present(row, next)
}

/** The row has already been read by the authenticated record endpoint; the stored card link must agree. */
export async function learningAfterRecordRead(appId: string, author: Author, proof: { screenId: string; tableId: string }) {
  return db.transaction(async tx => {
    const app = await lockedApp(tx, appId, author)
    if (!app) return null
    const [row] = await tx.select().from(builderLearning).where(ownProgress(appId, author)).for('update')
    if (!row || row.version !== 1) return null
    const target = builderLearningTarget(app, row.targetNodeId)
    if (!row.recordDone && target?.cardScreenId === proof.screenId && target.tableId === proof.tableId) {
      const [saved] = await tx.update(builderLearning).set({ recordDone: true, recordSkipped: false, updatedAt }).where(ownProgress(appId, author)).returning()
      return present(saved!, app)
    }
    return present(row, app)
  })
}

/** Explicit review is accepted only for the saved, publishable configuration. */
export async function confirmBuilderLearningAccess(appId:string,author:Author,expectedRevision:string):Promise<BuilderLearningResult>{
  return db.transaction(async tx=>{
    const app=await lockedApp(tx,appId,author)
    if(!app||builderV2Revision(app)!==expectedRevision)return {ok:false,error:'Настройки изменились. Сохраните черновик и проверьте доступ ещё раз.'}
    const error=builderV2PublicationError(app);if(error)return {ok:false,error}
    if(!app.screens.some(screen=>screen.audience.kind==='public')&&app.authentication.mode==='invite_only'&&!app.authentication.members.length)return {ok:false,error:'Добавьте хотя бы один адрес для входа в приложение.'}
    const [row]=await tx.select().from(builderLearning).where(ownProgress(appId,author)).for('update')
    if(!row||row.version!==1)return {ok:true,progress:null}
    if(row.accessDone)return {ok:true,progress:present(row,app)}
    const [saved]=await tx.update(builderLearning).set({accessDone:true,accessSkipped:false,updatedAt}).where(ownProgress(appId,author)).returning()
    return {ok:true,progress:present(saved!,app)}
  })
}
/** Called in the same transaction as a successful publication, never when its dialog opens. */
export async function learningAfterPublication(tx:Transaction,app:AppV2,author:Author){
  const [row]=await tx.select().from(builderLearning).where(ownProgress(app.id,author)).for('update')
  if(!row||row.version!==1)return null
  if(row.publishDone)return present(row,app)
  const [saved]=await tx.update(builderLearning).set({publishDone:true,publishSkipped:false,updatedAt}).where(ownProgress(app.id,author)).returning()
  return present(saved!,app)
}

/** The validated form workflow, row, receipt and history have all succeeded in this transaction. */
export async function learningAfterFormSave(tx:Transaction,app:AppV2,author:Author,formId:string){
  if(!app.nodes.some(node=>node.id===formId&&node.type==='form'))return null
  const [row]=await tx.select().from(builderLearning).where(ownProgress(app.id,author)).for('update')
  if(!row||row.version!==1)return null
  if(row.saveDone)return present(row,app)
  const [saved]=await tx.update(builderLearning).set({saveDone:true,saveSkipped:false,updatedAt}).where(ownProgress(app.id,author)).returning()
  return present(saved!,app)
}
