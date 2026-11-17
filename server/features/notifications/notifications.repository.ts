import { and, asc, desc, eq, inArray, isNull, lt, lte, sql } from 'drizzle-orm'
import type { Db, Statement } from '#server/utils/batch'
import { notifications, telegramLinks } from './notifications.schema'
import type { NotificationKind } from './notifications.types'

// --- Links ---

interface NewLink {
  id: string
  shopId: string
  orderId: string
  telegramUserId: string
  chatId: string
  now: Date
}

/** A link; nothing when the same live link exists (a person who scans twice). */
export function insertLinkStatement(db: Db, link: NewLink): Statement {
  const { id, shopId, orderId, telegramUserId, chatId, now } = link
  return db.insert(telegramLinks)
    .values({ id, shopId, orderId, telegramUserId, chatId, linkedAt: now })
    .onConflictDoNothing()
}

/** Ends every live link to a chat, in every shop: the person blocked the bot, which is the platform's. */
export function revokeChatLinksStatement(db: Db, chatId: string, now: Date): Statement {
  return db.update(telegramLinks).set({ revokedAt: now }).where(and(eq(telegramLinks.chatId, chatId), isNull(telegramLinks.revokedAt)))
}

// --- The outbox ---

/** One message to one chat (the slip when someone links); nothing if it was queued already. */
export function queueChatMessageStatement(db: Db, message: { shopId: string, orderId: string, chatId: string, kind: NotificationKind, now: Date }): Statement {
  const { shopId, orderId, chatId, kind, now } = message
  return db.insert(notifications)
    .values({ id: `${kind}:${orderId}:${chatId}`, shopId, orderId, chatId, kind, nextAttemptAt: now, createdAt: now })
    .onConflictDoNothing()
}

const outboxColumns = {
  id: notifications.id,
  shopId: notifications.shopId,
  orderId: notifications.orderId,
  chatId: notifications.chatId,
  kind: notifications.kind,
  attempts: notifications.attempts,
}

export type OutboxRow = Awaited<ReturnType<typeof dueMessages>>[number]

/** Messages due now, oldest first, across shops (the delivery job); `orderId` narrows to one order. */
export function dueMessages(db: Db, options: { now: Date, limit: number, orderId?: string }) {
  const { now, limit, orderId } = options
  return db.select(outboxColumns).from(notifications)
    .where(and(eq(notifications.status, 'pending'), lte(notifications.nextAttemptAt, now), orderId ? eq(notifications.orderId, orderId) : undefined))
    .orderBy(asc(notifications.nextAttemptAt), asc(notifications.id))
    .limit(limit)
}

/**
 * Takes a due message for one sender: counts the attempt and hides it until `leaseUntil`. Only one
 * of two overlapping runs gets it: the first moves `next_attempt_at` past now, so the second's
 * condition no longer holds. A sender that dies mid-send leaves it to be retried when the lease
 * ends: at least once, never lost.
 */
export async function claimMessage(db: Db, row: { id: string }, times: { now: Date, leaseUntil: Date }) {
  const [claimed] = await db.update(notifications)
    .set({ attempts: sql`${notifications.attempts} + 1`, nextAttemptAt: times.leaseUntil })
    .where(and(eq(notifications.id, row.id), eq(notifications.status, 'pending'), lte(notifications.nextAttemptAt, times.now)))
    .returning({ id: notifications.id, attempts: notifications.attempts })
  return claimed
}

/** After a send: `sent`, `skipped` or `failed` for good, or `pending` again at `retryAt`. */
export function settleMessage(db: Db, id: string, outcome: { status: 'sent' | 'skipped' | 'failed' | 'pending', now: Date, error?: string, retryAt?: Date }) {
  const { status, now, error, retryAt } = outcome
  return db.update(notifications).set({
    status,
    lastError: error ?? null,
    ...(status === 'sent' ? { sentAt: now } : {}),
    ...(retryAt ? { nextAttemptAt: retryAt } : {}),
  }).where(eq(notifications.id, id))
}

/** An order's messages, newest first, without their chats. Bounded: a few per chat. */
export function orderMessages(db: Db, order: { shopId: string, orderId: string }) {
  return db.select({ kind: notifications.kind, status: notifications.status, createdAt: notifications.createdAt, sentAt: notifications.sentAt })
    .from(notifications)
    .where(and(eq(notifications.shopId, order.shopId), eq(notifications.orderId, order.orderId)))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(50)
}

/** Rows that will never be sent again, older than `before`. */
export function purgeMessages(db: Db, before: Date) {
  return db.delete(notifications).where(and(inArray(notifications.status, ['sent', 'skipped', 'failed']), lt(notifications.createdAt, before)))
}
