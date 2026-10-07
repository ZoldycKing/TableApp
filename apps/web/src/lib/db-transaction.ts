import type { db } from '@tableapp/db'

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
