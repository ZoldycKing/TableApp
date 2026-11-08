import type { BuilderV2WorkflowEffect, BuilderV2WorkflowTrace } from './builder-v2-workflow-types'
import type { BuilderV2SubmitResult } from './builder-v2-submit-types'
export type BuilderV2ButtonScope = { screenId: string; nodeId: string; recordId?: string; itemId?:string }
export type BuilderV2ButtonState = { revision: string; fingerprint: string; recordLabel: string | null; tableName: string | null; actionName: string; stepCount: number; kind?:'delete' }
export type BuilderV2ButtonRequest = BuilderV2ButtonScope & { requestId: string; revision: string; fingerprint: string; confirmation?:string }
export type BuilderV2ButtonInspection = { ok: true; state: BuilderV2ButtonState } | { ok: false; error: string;stale?:boolean }
export type BuilderV2ActionResult = { ok: true; rowId?: string; tableId?: string; repeated: boolean; effects?: BuilderV2WorkflowEffect[]; trace?: BuilderV2WorkflowTrace } | Extract<BuilderV2SubmitResult, {ok:false}>
