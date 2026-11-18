import { and, eq, gt, lt } from 'drizzle-orm'
import type { Db, Statement } from '#server/utils/batch'
import { firstRow } from '#server/utils/query'
import { telegramInvites } from './telegram.schema'

/** Expired QR tokens (the daily purge). */
export function purgeExpiredInvites(db: Db, now: Date) {
  return db.delete(telegramInvites).where(lt(telegramInvites.expiresAt, now))
}

/** A QR token, by its SHA-256 only (security.md → Telegram links). */
export function insertInviteStatement(db: Db, invite: { tokenHash: string, shopId: string, orderId: string, expiresAt: Date, now: Date }): Statement {
  const { tokenHash, shopId, orderId, expiresAt, now } = invite
  return db.insert(telegramInvites).values({ tokenHash, shopId, orderId, expiresAt, createdAt: now })
}

/** The order a scanned token leads to, while it's valid; across shops (the token names its shop). */
export function findLiveInvite(db: Db, tokenHash: string, now: Date) {
  return firstRow(db.select({ shopId: telegramInvites.shopId, orderId: telegramInvites.orderId })
    .from(telegramInvites).where(and(eq(telegramInvites.tokenHash, tokenHash), gt(telegramInvites.expiresAt, now))))
}
