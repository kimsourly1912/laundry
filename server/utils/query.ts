import { sql } from 'drizzle-orm'
import type { AnyColumn, SQL } from 'drizzle-orm'

/**
 * Building blocks for repositories (docs/server/repositories.md). They keep Drizzle's inferred
 * result types; nothing here runs a write.
 */

/**
 * The first row of a select, or `undefined`: adds `limit 1`. Pass the query without a limit.
 *
 * @example
 * return firstRow(db.select(orderColumns).from(orders).where(and(eq(orders.shopId, shopId), eq(orders.id, id))))
 */
export async function firstRow<T>(query: { limit: (n: number) => PromiseLike<T[]> }): Promise<T | undefined> {
  const [row] = await query.limit(1)
  return row
}

/**
 * Whether `column` contains `search` as literal text, ignoring ASCII case. Not `like`: D1 refuses a
 * pattern over 50 bytes (a Khmer search reaches that in about 17 letters), and `%`, `_` would be
 * wildcards. `instr` takes no pattern, so nothing needs escaping and there's no length limit of its
 * own. Like `like '%…%'`, it scans: no index helps.
 */
export function containsText(column: AnyColumn, search: string): SQL {
  return sql`instr(lower(${column}), lower(${search})) > 0`
}
