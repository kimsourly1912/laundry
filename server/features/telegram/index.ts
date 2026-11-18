/** The telegram feature's public API (docs/server/architecture.md → Features). */
export { purgeTelegram, webhookSecretMatches } from './telegram.service'
export { createOrderInvite, deliverSlips, handleUpdate, sendSlipMessage } from './telegram.orders'
export { createTelegramBot, isChatGone, isTelegramApiError } from './telegram.bot'
export type { TelegramApiError, TelegramBot } from './telegram.bot'
export { telegramUpdateSchema } from './telegram.update'
export type { TelegramUpdate } from './telegram.update'
