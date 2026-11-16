import { and, asc, count, desc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { Db, Statement } from '#server/utils/batch'
import { notifications, telegramLinks } from './notifications.schema'
import type { NotificationKind } from './notifications.types'

// --- Links ---

interface NewLink {
  id: string
  shopId: string
  customerId: string
  /** `null`: every order of the customer (a proved phone). */
  orderId: string | null
  telegramUserId: string
  chatId: string
  now: Date
}

/** A link; nothing when the same live link exists (a person who scans twice). */
export function insertLinkStatement(db: Db, link: NewLink): Statement {
  const { id, shopId, customerId, orderId, telegramUserId, chatId, now } = link
  return db.insert(telegramLinks)
    .values({ id, shopId, customerId, orderId, telegramUserId, chatId, verifiedPhone: orderId === null, linkedAt: now })
    .onConflictDoNothing()
}

/** Ends every live link of a customer of the shop (anonymized). */
export function revokeCustomerLinksStatement(db: Db, key: { shopId: string, customerId: string }, now: Date): Statement {
  return db.update(telegramLinks).set({ revokedAt: now })
    .where(and(eq(telegramLinks.shopId, key.shopId), eq(telegramLinks.customerId, key.customerId), isNull(telegramLinks.revokedAt)))
}

/** Ends every live link to a chat, in every shop: the person blocked the bot, which is the platform's. */
export function revokeChatLinksStatement(db: Db, chatId: string, now: Date): Statement {
  return db.update(telegramLinks).set({ revokedAt: now }).where(and(eq(telegramLinks.chatId, chatId), isNull(telegramLinks.revokedAt)))
}

/** The shop's live links that reach an order: the customer's own, and those for this order alone. */
function linksTo(order: { shopId: string, orderId: string, customerId: string }) {
  return and(
    eq(telegramLinks.shopId, order.shopId),
    isNull(telegramLinks.revokedAt),
    or(and(isNull(telegramLinks.orderId), eq(telegramLinks.customerId, order.customerId)), eq(telegramLinks.orderId, order.orderId)),
  )
}

export function countLinksTo(db: Db, order: { shopId: string, orderId: string, customerId: string }): Promise<number> {
  return db.$count(telegramLinks, linksTo(order))
}

// --- The outbox ---

interface QueueOrder {
  shopId: string
  orderId: string
  customerId: string
  kind: NotificationKind
  /** What makes this message unique for the order: its version for `ready`, … */
  key: string
  now: Date
}

/**
 * A message to each chat linked to the order, for the change's own batch. One per chat, however
 * many links lead there; nothing for a chat that already has this message (the id is the dedupe
 * key).
 */
export function queueOrderMessagesStatement(db: Db, message: QueueOrder & { maxOfKind?: number }): Statement {
  const { shopId, orderId, customerId, kind, key, now, maxOfKind } = message
  const at = sql.param(now, notifications.nextAttemptAt)
  // A cap per chat: how many of this kind the order already sent there (spec §8.5: 3 reminders).
  const earlier = alias(notifications, 'earlier')
  const underCap = maxOfKind === undefined
    ? undefined
    : sql`(${db.select({ n: count() }).from(earlier).where(and(eq(earlier.orderId, orderId), eq(earlier.kind, kind), eq(earlier.chatId, telegramLinks.chatId)))}) < ${maxOfKind}`
  return db.insert(notifications).select(
    db.selectDistinct({
      id: sql<string>`${`${kind}:${orderId}:${key}:`} || ${telegramLinks.chatId}`.as('id'),
      shopId: telegramLinks.shopId,
      orderId: sql<string>`${orderId}`.as('order_id'),
      chatId: telegramLinks.chatId,
      kind: sql<NotificationKind>`${kind}`.as('kind'),
      status: sql<'pending'>`'pending'`.as('status'),
      attempts: sql<number>`0`.as('attempts'),
      lastError: sql<null>`null`.as('last_error'),
      nextAttemptAt: sql<Date>`${at}`.as('next_attempt_at'),
      createdAt: sql<Date>`${at}`.as('created_at'),
      sentAt: sql<null>`null`.as('sent_at'),
    }).from(telegramLinks).where(and(linksTo({ shopId, orderId, customerId }), underCap)),
  ).onConflictDoNothing()
}

/** One message to one chat (the receipt when someone links); nothing if it was queued already. */
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
