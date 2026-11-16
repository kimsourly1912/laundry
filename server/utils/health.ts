import { sql } from 'drizzle-orm'
import type { Db } from './batch'

/** Whether the database answers a trivial query. Throws nothing: a failure is `false`. */
export async function databaseAnswers(db: Db): Promise<boolean> {
  try {
    await db.run(sql`select 1`)
    return true
  }
  catch {
    return false
  }
}
