/** Saved-slip delivery plus the historical ready kind kept in existing database rows. */
export const NOTIFICATION_KINDS = ['slip', 'ready'] as const
export type NotificationKind = typeof NOTIFICATION_KINDS[number]

/**
 * `pending`: to send (again) at `next_attempt_at`. `sent`. `skipped`: not sent and never will be
 * (the person blocked the bot, the shop is suspended). `failed`: gave up after the last attempt.
 */
export const NOTIFICATION_STATUSES = ['pending', 'sent', 'skipped', 'failed'] as const
export type NotificationStatus = typeof NOTIFICATION_STATUSES[number]

/** Attempts before a message is `failed` (spec §13). */
export const MAX_ATTEMPTS = 5
