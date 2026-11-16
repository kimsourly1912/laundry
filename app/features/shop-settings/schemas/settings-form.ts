import * as v from 'valibot'
import type { ShopSettings, updateShopSettingsSchema } from '#shared/contracts/shop-settings'
import { CURRENCIES, POLICY_TEXT_MAX, REMINDER_DAYS_MAX, REMINDER_DAYS_MIN, SHOP_LANGUAGES } from '#shared/contracts/shop-settings'
import { SHOP_NAME_MAX } from '#shared/contracts/platform-shops'

/**
 * The shop settings form (docs/standards/forms.md): the request contract's rules with messages in
 * the user's language, and the mapping both ways (pure, tested). Blank optional text is sent as
 * blank and stored as none.
 */

type Translate = (key: string, params?: Record<string, unknown>) => string

export interface SettingsForm {
  name: string
  phone: string
  address: string
  currency: (typeof CURRENCIES)[number]
  policyTextKm: string
  policyTextEn: string
  reminderAfterDays: number
  language: (typeof SHOP_LANGUAGES)[number]
}

const optional = (t: Translate, max: number) => v.pipe(v.string(), v.maxLength(max, t('validation.maxLength', { max })))

export function settingsFormSchema(t: Translate) {
  return v.object({
    name: v.pipe(v.string(), v.trim(), v.minLength(1, t('validation.required')), v.maxLength(SHOP_NAME_MAX, t('validation.maxLength', { max: SHOP_NAME_MAX }))),
    phone: v.pipe(v.string(), v.maxLength(30, t('validation.maxLength', { max: 30 })), v.regex(/^[\d\s+\-()]*$/, t('validation.phone'))),
    address: optional(t, 200),
    currency: v.picklist(CURRENCIES),
    policyTextKm: optional(t, POLICY_TEXT_MAX),
    policyTextEn: optional(t, POLICY_TEXT_MAX),
    reminderAfterDays: v.pipe(v.number(t('validation.required')), v.integer(t('validation.wholeNumber')), v.minValue(REMINDER_DAYS_MIN, t('validation.between', { min: REMINDER_DAYS_MIN, max: REMINDER_DAYS_MAX })), v.maxValue(REMINDER_DAYS_MAX, t('validation.between', { min: REMINDER_DAYS_MIN, max: REMINDER_DAYS_MAX }))),
    language: v.picklist(SHOP_LANGUAGES),
  })
}

export function toSettingsForm(settings: ShopSettings): SettingsForm {
  return {
    name: settings.name,
    phone: settings.phone ?? '',
    address: settings.address ?? '',
    currency: settings.currency,
    policyTextKm: settings.policyTextKm ?? '',
    policyTextEn: settings.policyTextEn ?? '',
    reminderAfterDays: settings.reminderAfterDays,
    language: settings.language,
  }
}

/** The request body, at the version the form opened with; the server trims and stores blank as none. */
export function toSettingsRequest(form: SettingsForm, version: number): v.InferInput<typeof updateShopSettingsSchema> {
  return { version, ...form }
}
