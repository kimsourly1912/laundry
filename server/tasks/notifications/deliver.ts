import { createTelegramBot, deliverOutbox } from '#server/features/telegram'

/** Sends due messages (spec §13): every minute, `shared/scheduled-tasks.ts`. Safe to overlap. */
export default defineTask({
  meta: { name: 'notifications:deliver', description: 'Send due Telegram messages, with backoff' },
  async run() {
    const { botToken } = useRuntimeConfig().telegram
    if (!botToken) return { result: 'Telegram is not set up' }
    const { sent, retried, skipped, failed } = await deliverOutbox(useDb(), { bot: createTelegramBot(botToken) })
    return { result: `sent ${sent}, retried ${retried}, skipped ${skipped}, failed ${failed}` }
  },
})
