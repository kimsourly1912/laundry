import type { Db, Statement } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { log } from '#server/utils/log'
import * as repo from './notifications.repository'
import type { NotificationKind } from './notifications.types'
import { MAX_ATTEMPTS } from './notifications.types'

/**
 * Who gets an order's slip, and the outbox of what to send them (D28, plan §8). A change queues its
 * messages in its own batch; `deliverDue` sends them later through a channel (Telegram, step 4),
 * retrying with backoff. Messages go at least once: a sender that dies after sending sends again
 * when its lease ends.
 */

// --- Links and queueing (for the telegram feature, step 4) ---

interface Link {
  shopId: string
  orderId: string
  telegramUserId: string
  chatId: string
}

/** Links a chat to an order; nothing when that live link exists already. */
export function linkStatement(db: Db, link: Link, now: Date): Statement {
  return repo.insertLinkStatement(db, { ...link, id: newId(), now })
}

/** What the order's chats were sent (the order page), newest first, without the chats. */
export async function orderMessages(db: Db, order: { shopId: string, orderId: string }) {
  return repo.orderMessages(db, order)
}

/** One message to one chat: the slip for someone who just linked. Once per order and chat. */
export function queueChatMessageStatement(db: Db, message: { shopId: string, orderId: string, chatId: string, kind: NotificationKind }, now: Date): Statement {
  return repo.queueChatMessageStatement(db, { ...message, now })
}

export interface OutboxMessage {
  id: string
  shopId: string
  orderId: string
  chatId: string
  kind: NotificationKind
  attempt: number
}

/**
 * What a send did. `skipped`: it never will go (the shop is suspended, the order is gone); with
 * `chatGone`, the person blocked the bot or deleted the chat, and every link to it ends. `retry`:
 * try again later (after `afterMs`, when the channel said how long). `failed`: no point retrying.
 */
export type SendOutcome
  = | { status: 'sent' }
    | { status: 'skipped', error: string, chatGone?: boolean }
    | { status: 'retry', error: string, afterMs?: number }
    | { status: 'failed', error: string }

/** Minutes before attempt n + 1, after attempt n failed (spec §13: max 5 attempts). */
const BACKOFF_MINUTES = [1, 5, 15, 60]
/** How long a claimed message stays hidden from other senders. */
const LEASE_MS = 5 * 60_000
const MINUTE = 60_000

interface DeliverOptions {
  send: (message: OutboxMessage) => Promise<SendOutcome>
  now?: Date
  /** Only this order's messages (right after a link). */
  orderId?: string
  limit?: number
}

export interface DeliveryReport {
  sent: number
  retried: number
  skipped: number
  failed: number
}

/**
 * Sends what's due, one message at a time, each claimed first so overlapping runs never send the
 * same one twice at once. Safe to run any time and as often as wanted.
 */
export async function deliverDue(db: Db, options: DeliverOptions): Promise<DeliveryReport> {
  const { send, now = new Date(), orderId, limit = 25 } = options
  const report: DeliveryReport = { sent: 0, retried: 0, skipped: 0, failed: 0 }
  for (const row of await repo.dueMessages(db, { now, limit, orderId })) {
    const claimed = await repo.claimMessage(db, row, { now, leaseUntil: new Date(now.getTime() + LEASE_MS) })
    if (!claimed) continue
    const message: OutboxMessage = { id: row.id, shopId: row.shopId, orderId: row.orderId, chatId: row.chatId, kind: row.kind, attempt: claimed.attempts }
    let outcome: SendOutcome
    try {
      outcome = await send(message)
    }
    catch (error) {
      outcome = { status: 'retry', error: String((error as Error)?.message ?? error) }
    }
    await settle(db, message, outcome, now)
    report[outcome.status === 'retry' ? (message.attempt >= MAX_ATTEMPTS ? 'failed' : 'retried') : outcome.status]++
  }
  if (report.sent + report.retried + report.skipped + report.failed) log('info', 'Delivered notifications', { ...report })
  return report
}

async function settle(db: Db, message: OutboxMessage, outcome: SendOutcome, now: Date): Promise<void> {
  if (outcome.status === 'sent') {
    await repo.settleMessage(db, message.id, { status: 'sent', now })
    return
  }
  if (outcome.status === 'skipped') {
    await repo.settleMessage(db, message.id, { status: 'skipped', now, error: outcome.error })
    if (outcome.chatGone) await repo.revokeChatLinksStatement(db, message.chatId, now)
    return
  }
  if (outcome.status === 'failed' || message.attempt >= MAX_ATTEMPTS) {
    // Not the message's id: it ends with the chat id, which never reaches a log.
    log('warn', 'A notification failed', { shopId: message.shopId, orderId: message.orderId, kind: message.kind, attempts: message.attempt, error: outcome.error })
    await repo.settleMessage(db, message.id, { status: 'failed', now, error: outcome.error })
    return
  }
  const backoff = Math.max(outcome.afterMs ?? 0, BACKOFF_MINUTES[message.attempt - 1]! * MINUTE)
  await repo.settleMessage(db, message.id, { status: 'pending', now, error: outcome.error, retryAt: new Date(now.getTime() + backoff) })
}

/** Deletes messages that will never be sent again, after 90 days (spec §13). */
export async function purgeNotifications(db: Db, now = new Date()): Promise<void> {
  await repo.purgeMessages(db, new Date(now.getTime() - 90 * 24 * 60 * MINUTE))
}
