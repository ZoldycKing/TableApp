export type BuilderV2DeleteScope = { screenId: string; nodeId: string; recordId: string }
export type BuilderV2DeleteState = { revision: string; fingerprint: string; recordLabel: string; tableName: string }
export type BuilderV2DeleteRequest = BuilderV2DeleteScope & { requestId: string; revision: string; fingerprint: string; confirmed: true }
export type BuilderV2DeleteInspection = { ok: true; state: BuilderV2DeleteState } | { ok: false; error: string; stale?:boolean }
