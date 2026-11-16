import type { Currency } from './contracts/shop-settings'
import type { PriceUnit } from './contracts/pricing'

/**
 * Formatters the app and the server both need (docs/standards/i18n.md → Money, numbers and dates):
 * the app shows them on screen (through app/utils/format.ts), the server writes them on receipts
 * and Telegram messages. Dates are stored in UTC and shown in Phnom Penh time.
 */

const TIME_ZONE = 'Asia/Phnom_Penh'
const intlLocale = (locale: string) => (locale === 'km' ? 'km-KH' : 'en-GB')

/** `16 Nov 2026, 14:05` (en) / Khmer month names, 24-hour time, in the shop's time zone. */
export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TIME_ZONE }).format(new Date(iso))
}

/** Minor units per major unit: riel have no decimals, dollars have cents (spec T12). */
export const MINOR_DIGITS: Record<Currency, number> = { KHR: 0, USD: 2 }

/**
 * An amount in minor units, shown in its currency: `13,500៛`, `$12.50`, in both languages, with
 * Latin digits (i18n.md → Digits). `Intl` only groups the digits: browsers' currency symbols differ
 * (Chromium shows `KHR 13,500` in Khmer, Node `13,500៛`), and the paper tickets write `13,500៛`.
 */
export function formatMoney(minor: number, currency: Currency, _locale: string): string {
  const digits = MINOR_DIGITS[currency]
  const amount = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / 10 ** digits)
  return currency === 'KHR' ? `${amount}៛` : `$${amount}`
}

/** Pieces as `3`; grams as kilograms, `2500` → `2.5`. */
export function formatQuantity(unit: PriceUnit, quantity: number): string {
  if (unit === 'piece') return String(quantity)
  const whole = Math.floor(quantity / 1000)
  const fraction = String(quantity % 1000).padStart(3, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}
