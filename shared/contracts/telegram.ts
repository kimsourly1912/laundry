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
