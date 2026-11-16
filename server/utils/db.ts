import { db } from 'hub:db'
import type { Db } from './batch'

/** The NuxtHub database (local SQLite, D1 on Cloudflare), typed for services. Routes call it; features receive it. */
export function useDb(): Db {
  return db as unknown as Db
}
