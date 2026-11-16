import type { FormError } from '@nuxt/ui'
import type { PriceUnit } from '#shared/contracts/pricing'
import { MAX_ACTIVE_SERVICE_TYPES, PRICE_MAX, PRICE_NAME_MAX } from '#shared/contracts/pricing'
import type { Currency } from '#shared/contracts/shop-settings'
import type { CreateTemplateInput, Template } from '#shared/contracts/templates'
import { MAX_TEMPLATE_ITEMS, TEMPLATE_NAME_MAX } from '#shared/contracts/templates'
import { moneyInput, parseMoney } from '~/utils/format'

/**
 * The template editor's form (docs/standards/forms.md): a name, a currency, the services (columns)
 * and items (rows) in slip order, and the price grid as typed. The request contract
 * (`templateDefinitionSchema`) checks it all again; this gives the messages in the user's language.
 */

type Translate = (key: string, params?: Record<string, unknown>) => string

export interface ServiceRow {
  key: string
  nameEn: string
  nameKm: string
}

export interface ItemRow extends ServiceRow {
  unit: PriceUnit
}

export interface TemplateForm {
  name: string
  currency: Currency
  services: ServiceRow[]
  items: ItemRow[]
  /** As typed, by `priceKey(service, item)`; blank: not offered in that service. */
  prices: Record<string, string>
}

export const MAX_TEMPLATE_SERVICES = MAX_ACTIVE_SERVICE_TYPES
export { MAX_TEMPLATE_ITEMS }

/** A new key for a service or item: unique inside the template, never shown. */
export function newKey(): string {
  return crypto.randomUUID()
}

export function priceKey(service: string, item: string): string {
  return `${service}:${item}`
}

/**
 * A new template starts as the usual Phnom Penh slip, without prices: the services and clothing
 * items most shops list on paper. The admin renames, removes and prices them.
 */
export function starterTemplateForm(): TemplateForm {
  const service = (nameEn: string, nameKm: string): ServiceRow => ({ key: newKey(), nameEn, nameKm })
  const item = (nameEn: string, nameKm: string, unit: PriceUnit = 'piece'): ItemRow => ({ key: newKey(), nameEn, nameKm, unit })
  return {
    name: '',
    currency: 'KHR',
    services: [service('Wash & iron', 'បោកអ៊ុត'), service('Dry clean', 'បោកស្ងួត'), service('Iron only', 'អ៊ុត')],
    items: [
      item('Shirt', 'អាវ'),
      item('Pants', 'ខោ'),
      item('Coat', 'អាវធំ'),
      item('Silk', 'សូត្រ'),
      item('Dress', 'រ៉ូប'),
      item('Blanket & towel', 'ភួយ និងកន្សែង'),
      item('Mixed clothes', 'ខោអាវចម្រុះ', 'kg'),
    ],
    prices: {},
  }
}

export function toTemplateForm(template: Template): TemplateForm {
  const { name, currency, definition } = template
  return {
    name,
    currency,
    services: definition.services.map(service => ({ key: service.key, nameEn: service.nameEn, nameKm: service.nameKm ?? '' })),
    items: definition.items.map(item => ({ key: item.key, nameEn: item.nameEn, nameKm: item.nameKm ?? '', unit: item.unit })),
    prices: Object.fromEntries(definition.prices.map(price => [priceKey(price.service, price.item), moneyInput(price.price, currency)])),
  }
}

/** The grid's filled cells, for rows and columns that still exist. */
function filledPrices(form: TemplateForm) {
  return form.items.flatMap(item => form.services.flatMap((service) => {
    const text = form.prices[priceKey(service.key, item.key)]?.trim() ?? ''
    return text ? [{ service: service.key, item: item.key, text }] : []
  }))
}

/** Every problem, on its field (`services.0.nameEn`, `prices.<service>:<item>`). */
export function templateFormErrors(form: TemplateForm, t: Translate): FormError[] {
  const errors: FormError[] = []
  const name = (value: string, path: string, max: number) => {
    if (!value.trim()) errors.push({ name: path, message: t('validation.required') })
    else if (value.trim().length > max) errors.push({ name: path, message: t('validation.maxLength', { max }) })
  }
  name(form.name, 'name', TEMPLATE_NAME_MAX)
  form.services.forEach((service, index) => name(service.nameEn, `services.${index}.nameEn`, PRICE_NAME_MAX))
  form.items.forEach((item, index) => name(item.nameEn, `items.${index}.nameEn`, PRICE_NAME_MAX))
  if (!form.services.length) errors.push({ name: 'services', message: t('platform.templates.needService') })
  if (!form.items.length) errors.push({ name: 'items', message: t('platform.templates.needItem') })
  const prices = filledPrices(form)
  for (const price of prices) {
    const minor = parseMoney(price.text, form.currency)
    const path = `prices.${priceKey(price.service, price.item)}`
    if (minor === null) errors.push({ name: path, message: t(form.currency === 'KHR' ? 'validation.moneyKhr' : 'validation.moneyUsd') })
    else if (minor > PRICE_MAX) errors.push({ name: path, message: t('validation.tooHigh') })
  }
  if (form.services.length && form.items.length && !prices.length) errors.push({ name: 'prices', message: t('platform.templates.needPrice') })
  return errors
}

/** The request body. Call with a form that has no errors. */
export function toTemplateRequest(form: TemplateForm): CreateTemplateInput {
  return {
    name: form.name.trim(),
    currency: form.currency,
    definition: {
      services: form.services.map(service => ({ key: service.key, nameEn: service.nameEn.trim(), nameKm: service.nameKm.trim() || null })),
      items: form.items.map(item => ({ key: item.key, nameEn: item.nameEn.trim(), nameKm: item.nameKm.trim() || null, unit: item.unit })),
      prices: filledPrices(form).map(price => ({ service: price.service, item: price.item, price: parseMoney(price.text, form.currency)! })),
    },
  }
}

/** Moves `list[index]` by `step` (−1 up, +1 down), in place; out of range does nothing. */
export function move<T>(list: T[], index: number, step: -1 | 1): void {
  const target = index + step
  if (target < 0 || target >= list.length) return
  const [row] = list.splice(index, 1)
  list.splice(target, 0, row!)
}
