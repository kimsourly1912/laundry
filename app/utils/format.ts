/**
 * Display formatters (docs/standards/i18n.md → Money, numbers and dates). Dates are stored in UTC
 * and shown in the shop's time zone (`Asia/Phnom_Penh`), whatever the device's.
 */

const TIME_ZONE = 'Asia/Phnom_Penh'

/** `16 Nov 2026` (en) / `16 វិច្ឆិកា 2026` (km). */
export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'km' ? 'km-KH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TIME_ZONE }).format(new Date(iso))
}
