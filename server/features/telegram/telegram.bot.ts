/**
 * The Bot API calls we make (D28): send a message, send a photo. Plain `fetch`: three calls don't
 * need a framework (grammY, planned in the spec, would add a dependency for what a few lines do).
 * Services take a `TelegramBot`, so tests pass a fake one and nothing reaches Telegram.
 */

/** A keyboard under the message: a button that shares the person's own phone, and plain answers. */
export type ReplyMarkup
  = | { keyboard: ({ text: string, request_contact?: boolean })[][], one_time_keyboard: true, resize_keyboard: true }
    | { remove_keyboard: true }

export interface TelegramBot {
  sendMessage: (chatId: string, text: string, replyMarkup?: ReplyMarkup) => Promise<void>
  sendPhoto: (chatId: string, photo: Uint8Array<ArrayBuffer>, caption: string) => Promise<void>
}

/** Telegram said no: its HTTP status (`error_code`), and how long to wait when it limits us. */
export interface TelegramApiError extends Error {
  status: number
  retryAfterMs?: number
}

export function isTelegramApiError(error: unknown): error is TelegramApiError {
  return error instanceof Error && typeof (error as TelegramApiError).status === 'number'
}

interface ApiResponse {
  ok: boolean
  error_code?: number
  description?: string
  parameters?: { retry_after?: number }
}

/** The Bot API with the bot's token. `fetcher` for tests. */
export function createTelegramBot(token: string, fetcher: typeof fetch = fetch): TelegramBot {
  async function call(method: string, body: Record<string, unknown> | FormData): Promise<void> {
    const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, body instanceof FormData
      ? { method: 'POST', body }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({ ok: false })) as ApiResponse
    if (data.ok) return
    const error = new Error(data.description ?? `Telegram ${method} failed`) as TelegramApiError
    error.status = data.error_code ?? response.status
    if (data.parameters?.retry_after) error.retryAfterMs = data.parameters.retry_after * 1000
    throw error
  }

  function sendMessage(chatId: string, text: string, replyMarkup?: ReplyMarkup) {
    return call('sendMessage', { chat_id: chatId, text, link_preview_options: { is_disabled: true }, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) })
  }

  function sendPhoto(chatId: string, photo: Uint8Array<ArrayBuffer>, caption: string) {
    const form = new FormData()
    form.set('chat_id', chatId)
    form.set('caption', caption)
    form.set('photo', new Blob([photo], { type: 'image/png' }), 'receipt.png')
    return call('sendPhoto', form)
  }

  return { sendMessage, sendPhoto }
}

/**
 * Whether the person can't be reached any more: they blocked the bot (403), or the chat or account
 * is gone. Their links end; retrying would only fail again.
 */
export function isChatGone(error: TelegramApiError): boolean {
  return error.status === 403 || (error.status === 400 && /chat not found|user is deactivated|bot was kicked/i.test(error.message))
}
