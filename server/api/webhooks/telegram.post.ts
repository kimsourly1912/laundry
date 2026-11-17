import { telegramUpdateSchema, webhookSecretMatches } from '#server/features/telegram'

/**
 * Telegram's webhook (D28): authenticated by the secret given to `setWebhook`, never by a session;
 * rate-limited per address (server/middleware/20.rate-limit.ts). A 200 tells Telegram the update was
 * handled; an error makes it send the update again later.
 *
 * Until step 4 builds the order-only flow (plan §8), a valid update is accepted and ignored.
 */
export default defineEventHandler(async (event) => {
  const { botToken, webhookSecret } = useRuntimeConfig(event).telegram
  // Not set up here, or not Telegram: the same 404 as any unknown path.
  if (!botToken || !webhookSecretMatches(webhookSecret, getHeader(event, 'x-telegram-bot-api-secret-token'))) {
    throw apiError(404, ErrorCodes.NOT_FOUND, 'Not found.')
  }
  await readValidBody(event, telegramUpdateSchema)
  return { ok: true }
})
