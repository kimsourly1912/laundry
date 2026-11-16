/**
 * What a queued message says: the order's receipt (right after the person links), the order is
 * ready, the order was collected, the order is still waiting to be collected (spec §8.5).
 */
export const NOTIFICATION_KINDS = ['receipt', 'ready', 'collected', 'reminder'] as const
export type NotificationKind = typeof NOTIFICATION_KINDS[number]

/** Reminders an order sends to one chat, in all (spec §8.5). */
export const MAX_REMINDERS = 3

/**
 * `pending`: to send (again) at `next_attempt_at`. `sent`. `skipped`: not sent and never will be
 * (the person blocked the bot, the shop is suspended). `failed`: gave up after the last attempt.
 */
export const NOTIFICATION_STATUSES = ['pending', 'sent', 'skipped', 'failed'] as const
export type NotificationStatus = typeof NOTIFICATION_STATUSES[number]

/** Attempts before a message is `failed` (spec §13). */
export const MAX_ATTEMPTS = 5
