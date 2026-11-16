import { purgeNotifications } from '#server/features/notifications'
import { purgeTelegram } from '#server/features/telegram'

/** Deletes old messages (90 days) and expired QR tokens (spec §13). Daily, `shared/scheduled-tasks.ts`. */
export default defineTask({
  meta: { name: 'notifications:purge', description: 'Delete sent messages older than 90 days and expired Telegram invites' },
  async run() {
    const db = useDb()
    await purgeNotifications(db)
    await purgeTelegram(db)
    log('info', 'Purged notifications')
    return { result: 'ok' }
  },
})
