import { and, eq, gt, lt } from 'drizzle-orm'
import type { Db, Statement } from '#server/utils/batch'
import { firstRow } from '#server/utils/query'
import { telegramInvites, telegramPending } from './telegram.schema'

// --- Invites ---

export function insertInviteStatement(db: Db, invite: { tokenHash: string, shopId: string, orderId: string, expiresAt: Date, now: Date }): Statement {
  const { tokenHash, shopId, orderId, expiresAt, now } = invite
  return db.insert(telegramInvites).values({ tokenHash, shopId, orderId, expiresAt, createdAt: now })
}

/** The invite with this token's hash, while it hasn't expired. */
export function findLiveInvite(db: Db, tokenHash: string, now: Date) {
  return firstRow(db.select({ shopId: telegramInvites.shopId, orderId: telegramInvites.orderId })
    .from(telegramInvites).where(and(eq(telegramInvites.tokenHash, tokenHash), gt(telegramInvites.expiresAt, now))))
}

// --- Waiting for a phone ---

export function upsertPendingStatement(db: Db, pending: { telegramUserId: string, shopId: string, orderId: string, chatId: string, expiresAt: Date }): Statement {
  const { telegramUserId, ...rest } = pending
  return db.insert(telegramPending).values(pending).onConflictDoUpdate({ target: telegramPending.telegramUserId, set: rest })
}

export function findLivePending(db: Db, telegramUserId: string, now: Date) {
  return firstRow(db.select({ shopId: telegramPending.shopId, orderId: telegramPending.orderId, chatId: telegramPending.chatId })
    .from(telegramPending).where(and(eq(telegramPending.telegramUserId, telegramUserId), gt(telegramPending.expiresAt, now))))
}

export function deletePendingStatement(db: Db, telegramUserId: string): Statement {
  return db.delete(telegramPending).where(eq(telegramPending.telegramUserId, telegramUserId))
}

// --- Purge ---

export function purgeExpired(db: Db, now: Date) {
  return db.batch([
    db.delete(telegramInvites).where(lt(telegramInvites.expiresAt, now)),
    db.delete(telegramPending).where(lt(telegramPending.expiresAt, now)),
  ])
}
