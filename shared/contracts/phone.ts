import { parsePhoneNumberFromString } from 'libphonenumber-js/min'
import * as v from 'valibot'

/**
 * Phone numbers (spec §6): stored in E.164, read as typed in Cambodia (region KH) — `012 345 678`,
 * `+855 12 345 678` and `855 12345678` are one number, `+85512345678`. The server runs this schema;
 * the app runs it too for its messages.
 */

export const DEFAULT_PHONE_REGION = 'KH'

/** E.164 for a valid number, else `null`. */
export function toE164(text: string): string | null {
  const parsed = parsePhoneNumberFromString(text, DEFAULT_PHONE_REGION)
  return parsed?.isValid() ? parsed.number : null
}

/** `012 345 678` for a Cambodian number, the international form for another country's. */
export function formatPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164)
  if (!parsed) return e164
  return parsed.country === DEFAULT_PHONE_REGION ? parsed.formatNational() : parsed.formatInternational()
}

/** An optional phone: blank is none (`null`); anything else must be a valid number, stored as E.164. */
export const optionalPhoneSchema = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(30, 'At most 30 characters'),
  v.check(text => !text || toE164(text) !== null, 'Not a valid phone number'),
  v.transform(text => (text ? toE164(text) : null)),
)
