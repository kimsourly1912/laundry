import { apiError, ErrorCodes } from '#server/utils/errors'

export const TelegramErrorCodes = {
  TELEGRAM_NOT_SET_UP: 'TELEGRAM_NOT_SET_UP',
} as const

/** 409: this deployment has no bot (no `NUXT_TELEGRAM_BOT_USERNAME`): the app shows no QR. */
export function telegramNotSetUp() {
  return apiError(409, TelegramErrorCodes.TELEGRAM_NOT_SET_UP, 'Telegram is not set up yet.')
}

/** 409: a cancelled order gets no QR. */
export function orderCancelled() {
  return apiError(409, ErrorCodes.INVALID_STATE, 'This order is cancelled.')
}
