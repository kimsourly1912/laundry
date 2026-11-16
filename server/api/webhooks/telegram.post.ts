import { createTelegramBot, handleUpdate, telegramUpdateSchema, webhookSecretMatches } from '#server/features/telegram'

/**
 * Telegram's webhook (D28, spec §8.2): authenticated by the secret given to `setWebhook`, never by
 * a session; rate-limited per address (server/middleware/20.rate-limit.ts). A 200 tells Telegram
 * the update was handled; an error makes it send the update again later.
 */
export default defineEventHandler(async (event) => {
  const { botToken, webhookSecret } = useRuntimeConfig(event).telegram
  // Not set up here, or not Telegram: the same 404 as any unknown path.
  if (!botToken || !webhookSecretMatches(webhookSecret, getHeader(event, 'x-telegram-bot-api-secret-token'))) {
    throw apiError(404, ErrorCodes.NOT_FOUND, 'Not found.')
  }
  const update = await readValidBody(event, telegramUpdateSchema)
  await handleUpdate(useDb(), update, { bot: createTelegramBot(botToken) })
  return { ok: true }
})
