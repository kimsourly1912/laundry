import { apiError } from '#server/utils/errors'

/**
 * The bot isn't set up in this environment (`NUXT_TELEGRAM_BOT_USERNAME`). A 409, not a 503: it's
 * a known state the app asks about on every saved order, not a fault to log as one.
 */
export function telegramOff() {
  return apiError(409, 'TELEGRAM_OFF', 'Telegram isn\'t set up yet. Ask support.')
}
