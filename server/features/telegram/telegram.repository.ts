import { lt } from 'drizzle-orm'
import type { Db } from '#server/utils/batch'
import { telegramInvites } from './telegram.schema'

/** Expired QR tokens (the daily purge). */
export function purgeExpiredInvites(db: Db, now: Date) {
  return db.delete(telegramInvites).where(lt(telegramInvites.expiresAt, now))
}
