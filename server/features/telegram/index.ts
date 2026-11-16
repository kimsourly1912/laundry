/** The telegram feature's public API (docs/server/architecture.md → Features). */
export { createInvite, deliverOutbox, handleUpdate, purgeTelegram, sendOutboxMessage, webhookSecretMatches } from './telegram.service'
export { createTelegramBot } from './telegram.bot'
export type { TelegramBot } from './telegram.bot'
export { telegramUpdateSchema } from './telegram.update'
