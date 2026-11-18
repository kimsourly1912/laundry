import { createTelegramBot, deliverSlips } from '#server/features/telegram'

/** Sends the slips still due, with backoff (D28, spec §13). Every minute, `shared/scheduled-tasks.ts`. */
export default defineTask({
  meta: { name: 'notifications:deliver', description: 'Send queued Telegram slips that are due' },
  async run() {
    const { botToken } = useRuntimeConfig().telegram
    if (!botToken) return { result: 'no bot' }
    const { sent, retried, skipped, failed } = await deliverSlips(useDb(), { bot: createTelegramBot(botToken) })
    return { result: `sent ${sent}, retried ${retried}, skipped ${skipped}, failed ${failed}` }
  },
})
