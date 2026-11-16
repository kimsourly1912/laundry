/**
 * The shop's day (spec T14): "today", reports and reminders use Phnom Penh time. Cambodia is
 * UTC+7 all year (no daylight saving), so this needs no time-zone database.
 */
const PHNOM_PENH_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** The UTC instant of the last midnight in Phnom Penh at `now`. */
export function startOfShopDay(now: Date): Date {
  const local = now.getTime() + PHNOM_PENH_OFFSET_MS
  return new Date(local - (local % DAY_MS) - PHNOM_PENH_OFFSET_MS)
}
