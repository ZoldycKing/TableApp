'use server'
import {apps,appConfigVersions} from '@tableapp/db'
import {newId} from '@tableapp/schema'
import {readAppDefinition,validateAppV2Definition} from '@tableapp/schema/app-definition'
import {and,desc,eq} from 'drizzle-orm'
import {revalidatePath} from 'next/cache'
import {authorizeApp} from '@/lib/authorize'
import {builderV2Enabled,loadBuilderV2Catalog} from '@/lib/builder-v2'
import {builderV2Revision} from '@/lib/builder-v2-revision'
import {builderV2PublicationError} from '@/lib/builder-v2-publish'
import {mayIncrease,PlanLimitError} from '@/lib/limits'
import {writeRows} from '@/lib/row-mutations'
import {learningAfterPublication} from '@/lib/builder-learning'
import type {BuilderLearningProgress} from '@/lib/builder-learning-types'
import {validateBuilderV2Logo} from '@/lib/builder-v2-logo'
import {isBuilderV2LogoKey} from '@/lib/builder-v2-logo-types'
import { validateBuilderBusinessTargets } from '@/lib/builder-v2-business'
export async function publishBuilderV2Action(appId:string,expectedRevision:string):Promise<{ok:true;href:string;learning?:BuilderLearningProgress}|{ok:false;error:string}>{
  const auth=await authorizeApp(appId);if(!auth.ok)return auth
  if(!builderV2Enabled()||typeof expectedRevision!=='string'||!/^[a-f0-9]{64}$/.test(expectedRevision))return {ok:false,error:'Обновите редактор перед публикацией'}
  try{
    const result=await writeRows(auth.member.workspaceId,async({tx})=>{
      const [record]=await tx.select().from(apps).where(and(eq(apps.id,appId),eq(apps.workspaceId,auth.member.workspaceId))).for('update'),read=readAppDefinition(record?.draft)
      if(!record||!read.ok||read.formatVersion!==2||read.app.id!==record.id||read.app.workspaceId!==record.workspaceId||read.app.slug!==record.slug)return {ok:false as const,error:'Черновик недоступен'}
      if(builderV2Revision(record.draft)!==expectedRevision)return {ok:false as const,error:'Черновик изменился. Обновите редактор и проверьте правки.'}
      const {catalog}=await loadBuilderV2Catalog(record.workspaceId,tx),checked=validateAppV2Definition(read.app,catalog)
      if(!checked.ok)return {ok:false as const,error:checked.issues[0]!.message}
      const error=builderV2PublicationError(checked.app);if(error)return {ok:false as const,error}
      const businessError = await validateBuilderBusinessTargets(checked.app, catalog.views, tx)
      if (businessError) return { ok: false as const, error: businessError }
      if (checked.app.theme.logoKey && isBuilderV2LogoKey(checked.app.theme.logoKey)) {
        const logoError = await validateBuilderV2Logo(tx, checked.app)
        if (logoError) return { ok: false as const, error: logoError }
      }
      if(!record.published){const limit=await mayIncrease({workspaceId:record.workspaceId,resource:'publishedApps',tx});if(!limit.ok)return limit}
      const [last]=await tx.select().from(appConfigVersions).where(and(eq(appConfigVersions.appId,appId),eq(appConfigVersions.workspaceId,record.workspaceId))).orderBy(desc(appConfigVersions.number)).limit(1)
      if(last?.kind!=='published'||last.fingerprint!==expectedRevision)await tx.insert(appConfigVersions).values({id:newId('appConfigVersion'),workspaceId:record.workspaceId,appId,number:(last?.number??0)+1,kind:'published',definition:checked.app,fingerprint:expectedRevision,authorId:auth.member.userId})
      await tx.update(apps).set({published:checked.app,publishedAt:new Date()}).where(eq(apps.id,appId))
      const learning=await learningAfterPublication(tx,checked.app,auth.member)
      return {ok:true as const,href:`/a/${encodeURIComponent(record.slug)}`,...(learning?{learning}:{})}
    })
    if(result.ok){revalidatePath('/apps');revalidatePath(`/apps/${appId}`);revalidatePath(result.href)}
    return result
  }catch(error){return {ok:false,error:error instanceof PlanLimitError?error.message:'Не удалось подтвердить публикацию. Повторите попытку.'}}
}
