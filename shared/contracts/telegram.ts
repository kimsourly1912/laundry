/**
 * Linking a customer's Telegram to an order (D28, spec §8.2): the counter shows a QR code; the
 * person scans it, the bot asks for their phone, and they get the order's receipt and updates.
 */

/** `POST /api/shop/orders/:id/telegram-invite`: the QR's address, valid for a day. */
export interface TelegramInvite {
  /** `https://t.me/<bot>?start=<token>`: shown as a QR code, never stored by the app. */
  url: string
  /** ISO 8601. */
  expiresAt: string
}

/**
 * `GET /api/shop/orders/:id/telegram`: whether the order's customer hears about it on Telegram,
 * and what was sent (D28). Never a chat id or a Telegram account: only counts and statuses.
 */
export interface OrderTelegramStatus {
  /** Chats linked to the order: the customer's own links and this order's. */
  chats: number
  /** Newest first. */
  messages: {
    kind: 'receipt' | 'ready' | 'collected' | 'reminder'
    status: 'pending' | 'sent' | 'skipped' | 'failed'
    /** ISO 8601: when it was queued, and when it went. */
    createdAt: string
    sentAt: string | null
  }[]
}
