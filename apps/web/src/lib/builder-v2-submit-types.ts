import type { AppV2Json } from '@tableapp/schema/app-v2'
import type { BuilderV2FormScope, BuilderV2FormState } from './builder-v2-form-types'
import type { BuilderV2WorkflowEffect, BuilderV2WorkflowTrace } from './builder-v2-workflow-types'
export type BuilderV2WorkingFormState = BuilderV2FormState & { revision: string }
export type BuilderV2SubmitRequest = BuilderV2FormScope & { requestId: string; revision: string; fingerprint: string; values: Record<string, AppV2Json>; confirmation?:string }
export type BuilderV2SubmitResult = { ok: true; rowId: string; tableId: string; repeated: boolean; effects?: BuilderV2WorkflowEffect[]; trace?: BuilderV2WorkflowTrace } | { ok: false; error: string; errors?: Record<string, string>; stale?: boolean; uncertain?: boolean; trace?: BuilderV2WorkflowTrace; confirmation?:import('./builder-v2-workflow-types').BuilderV2WorkflowConfirmation }
