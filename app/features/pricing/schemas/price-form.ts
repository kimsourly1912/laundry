import * as v from 'valibot'
import type { PriceItem, PriceUnit, ServiceType, priceItemInputSchema, serviceTypeInputSchema } from '#shared/contracts/pricing'
import { PRICE_MAX, PRICE_NAME_MAX, PRICE_UNITS } from '#shared/contracts/pricing'
import type { Currency } from '#shared/contracts/shop-settings'
import { moneyInput, parseMoney } from '~/utils/format'

/**
 * The price list's forms (docs/standards/forms.md): names in English (required) and Khmer, and a
 * price typed in the shop's currency (riel, or dollars with cents), sent as minor units (spec T12).
 */

type Translate = (key: string, params?: Record<string, unknown>) => string

const nameEn = (t: Translate) => v.pipe(v.string(), v.trim(), v.minLength(1, t('validation.required')), v.maxLength(PRICE_NAME_MAX, t('validation.maxLength', { max: PRICE_NAME_MAX })))
const nameKm = (t: Translate) => v.pipe(v.string(), v.maxLength(PRICE_NAME_MAX, t('validation.maxLength', { max: PRICE_NAME_MAX })))

export interface ServiceTypeForm {
  nameEn: string
  nameKm: string
}

export function serviceTypeFormSchema(t: Translate) {
  return v.object({ nameEn: nameEn(t), nameKm: nameKm(t) })
}

export function toServiceTypeForm(type?: ServiceType): ServiceTypeForm {
  return { nameEn: type?.nameEn ?? '', nameKm: type?.nameKm ?? '' }
}

export function toServiceTypeRequest(form: ServiceTypeForm): v.InferInput<typeof serviceTypeInputSchema> {
  return { nameEn: form.nameEn, nameKm: form.nameKm }
}

export interface PriceItemForm {
  serviceTypeId: string
  nameEn: string
  nameKm: string
  unit: PriceUnit
  /** As typed: `13500`, `12.50`. */
  price: string
}

/** The price must be an amount of the shop's currency, up to the contract's maximum. */
export function priceItemFormSchema(t: Translate, currency: Currency) {
  return v.object({
    serviceTypeId: v.pipe(v.string(), v.minLength(1, t('validation.required'))),
    nameEn: nameEn(t),
    nameKm: nameKm(t),
    unit: v.picklist(PRICE_UNITS),
    price: v.pipe(
      v.string(),
      v.minLength(1, t('validation.required')),
      v.check(text => parseMoney(text, currency) !== null, t(currency === 'KHR' ? 'validation.moneyKhr' : 'validation.moneyUsd')),
      v.check(text => (parseMoney(text, currency) ?? 0) <= PRICE_MAX, t('validation.tooHigh')),
    ),
  })
}

export function toPriceItemForm(item: PriceItem | undefined, currency: Currency): PriceItemForm {
  return {
    serviceTypeId: item?.serviceTypeId ?? '',
    nameEn: item?.nameEn ?? '',
    nameKm: item?.nameKm ?? '',
    unit: item?.unit ?? 'piece',
    price: item ? moneyInput(item.price, currency) : '',
  }
}

/** The request body: the price in minor units. Call with a form that passed the schema. */
export function toPriceItemRequest(form: PriceItemForm, currency: Currency): v.InferInput<typeof priceItemInputSchema> {
  return { serviceTypeId: form.serviceTypeId, nameEn: form.nameEn, nameKm: form.nameKm, unit: form.unit, price: parseMoney(form.price, currency)! }
}
