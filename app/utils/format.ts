import type { Currency } from '#shared/contracts/shop-settings'
import { MINOR_DIGITS } from '#shared/format'

// Shared with the server (slips, Telegram messages).
export { formatDateTime, formatMoney } from '#shared/format'

/**
 * Display formatters (docs/standards/i18n.md → Money, numbers and dates): the only place the app
 * calls `Intl` (ESLint enforces it). Dates are stored in UTC and shown in the shop's time zone.
 */

const TIME_ZONE = 'Asia/Phnom_Penh'
/** `16 Nov 2026`. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TIME_ZONE }).format(new Date(iso))
}

/** Minor units as the plain number a person types: `13500`, `12.50`. */
export function moneyInput(minor: number, currency: Currency): string {
  const digits = MINOR_DIGITS[currency]
  return digits ? (minor / 10 ** digits).toFixed(digits) : String(minor)
}

/**
 * What a person typed, in minor units: `13,500` → 13500 riel; `12.5` → 1250 cents. `null` when it
 * isn't an amount of this currency (letters, a third decimal, decimals for riel).
 */
export function parseMoney(text: string, currency: Currency): number | null {
  const plain = text.trim().replace(/[,\s]/g, '')
  const digits = MINOR_DIGITS[currency]
  const pattern = digits ? new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`) : /^\d+$/
  if (!pattern.test(plain)) return null
  const [whole, fraction = ''] = plain.split('.')
  return Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0') || 0)
}
