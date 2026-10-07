import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL не задан')

declare global {
  // eslint-disable-next-line no-var
  var __tableappSql: ReturnType<typeof postgres> | undefined
}

// Пул переживает hot reload в разработке, иначе соединения утекают на каждой правке.
const sql = globalThis.__tableappSql ?? postgres(url, { max: 10 })
if (process.env.NODE_ENV !== 'production') globalThis.__tableappSql = sql

export const db = drizzle(sql, { schema })
export { sql, schema }
export type Db = typeof db
