/**
 * The order's way to Telegram (`POST /api/shop/orders/:id/telegram`, plan §3 steps 5–6, step 4):
 * a QR the customer scans; the bot then sends the filled slip as a picture.
 */

export interface OrderTelegramMessage {
  /** `pending` (waiting or retrying), `sent`, `skipped` (the person blocked the bot), `failed`. */
  status: 'pending' | 'sent' | 'skipped' | 'failed'
  /** ISO 8601. */
  createdAt: string
  sentAt: string | null
}

export interface OrderTelegram {
  /** `https://t.me/<bot>?start=<token>`: what the QR holds. A new token each time, valid a day. */
  url: string
  /** ISO 8601. */
  expiresAt: string
  /** What the order's chats were sent, newest first, without the chats. */
  messages: OrderTelegramMessage[]
}
