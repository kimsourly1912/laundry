import { queueReminders } from '#server/features/orders'
import { createTelegramBot, deliverOutbox } from '#server/features/telegram'

/**
 * Reminds customers of orders still waiting (spec §8.5): daily at 09:00 Phnom Penh,
 * `shared/scheduled-tasks.ts`. Queues, then sends; what fails to send, the per-minute job retries.
 */
export default defineTask({
  meta: { name: 'orders:remind-uncollected', description: 'Queue and send reminders for ready orders not collected' },
  async run() {
    const { botToken } = useRuntimeConfig().telegram
    if (!botToken) return { result: 'Telegram is not set up' }
    const db = useDb()
    const orders = await queueReminders(db)
    const { sent, retried, failed } = await deliverOutbox(db, { bot: createTelegramBot(botToken) })
    log('info', 'Reminders queued', { orders, sent, retried, failed })
    return { result: `orders ${orders}, sent ${sent}` }
  },
})
