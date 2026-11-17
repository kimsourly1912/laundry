import type { Db } from '#server/utils/batch'
import { log } from '#server/utils/log'
import * as repo from './telegram.repository'

/**
 * The platform's Telegram bot (D28, plan §8). After the reset (plan step 1) it keeps its transport:
 * the Bot API client (telegram.bot.ts), the webhook's secret check and its update schema. Step 4
 * builds the order-only flow on them: the QR after saving, the scan, and the slip sent as a photo.
 */

/** Deletes expired QR tokens (the daily purge). */
export async function purgeTelegram(db: Db, now = new Date()): Promise<void> {
  await repo.purgeExpiredInvites(db, now)
  log('info', 'Purged expired Telegram invites')
}

/**
 * Whether a webhook call carries our secret (`X-Telegram-Bot-Api-Secret-Token`, set with
 * `setWebhook`). Compared in constant time; an empty secret matches nothing.
 */
export function webhookSecretMatches(expected: string, given: string | undefined): boolean {
  if (!expected || given === undefined || given.length !== expected.length) return false
  let difference = 0
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  return difference === 0
}
