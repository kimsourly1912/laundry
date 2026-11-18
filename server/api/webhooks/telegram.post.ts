import { createTelegramBot, deliverSlips, handleUpdate, telegramUpdateSchema, webhookSecretMatches } from '#server/features/telegram'

/**
 * Telegram's webhook (D28, plan step 4): authenticated by the secret given to `setWebhook`, never by
 * a session; rate-limited per address (server/middleware/20.rate-limit.ts). A 200 tells Telegram the
 * update was handled; an error makes it send the update again later, which `handleUpdate` allows.
 * A scan's slip goes out after the answer (`waitUntil`); the every-minute job sends what's left.
 */
export default defineEventHandler(async (event) => {
  const { botToken, webhookSecret } = useRuntimeConfig(event).telegram
  // Not set up here, or not Telegram: the same 404 as any unknown path.
  if (!botToken || !webhookSecretMatches(webhookSecret, getHeader(event, 'x-telegram-bot-api-secret-token'))) {
    throw apiError(404, ErrorCodes.NOT_FOUND, 'Not found.')
  }
  const update = await readValidBody(event, telegramUpdateSchema)
  const db = useDb()
  const bot = createTelegramBot(botToken)
  const queued = await handleUpdate(db, update, { bot })
  if (queued) {
    event.waitUntil(deliverSlips(db, { bot, orderId: queued.orderId }).catch((error: unknown) => log('warn', 'Delivering a slip failed', { error: String((error as Error)?.message ?? error) }, event)))
  }
  return { ok: true }
})
