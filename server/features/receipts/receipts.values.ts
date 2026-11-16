import type { Order } from '#shared/contracts/orders'
import type { ReceiptField } from '#shared/contracts/receipts'
import { formatPhone } from '#shared/contracts/phone'
import type { ShopLanguage } from '#shared/contracts/shop-settings'
import { formatDateTime, formatMoney, formatQuantity } from '#shared/format'
import type { ReceiptValues } from '#shared/receipt-fields'
import type { ShopProfile } from '#server/features/shops'

/**
 * What a receipt's fields show (D28), in the shop's customer-facing language (D6). These words
 * reach customers, not the app's screens, so they live here with the receipt rather than in the
 * app's locale files.
 */
const WORDS: Record<ShopLanguage, { walkIn: string, former: string, paid: string, unpaid: string, kg: string }> = {
  en: { walkIn: 'Walk-in', former: 'Former customer', paid: 'Paid', unpaid: 'Not paid', kg: 'kg' },
  km: { walkIn: 'អតិថិជនដើរចូល', former: 'អតិថិជនចាស់', paid: 'បានបង់', unpaid: 'មិនទាន់បង់', kg: 'គ.ក' },
}

/** The id of the service type each of the order's price items is in. */
export type ServiceOf = ReadonlyMap<string, string>

/** An order's values for its receipt. */
export function orderValues(order: Order, shop: ShopProfile, serviceOf: ServiceOf): ReceiptValues {
  const words = WORDS[shop.language]
  const { customer } = order
  const quantities = new Map<string, { unit: 'piece' | 'kg', quantity: number }>()
  for (const line of order.lines) {
    if (!line.priceItemId) continue
    const sum = quantities.get(line.priceItemId)
    quantities.set(line.priceItemId, { unit: line.unit, quantity: (sum?.quantity ?? 0) + line.quantity })
  }
  return {
    text: {
      shopName: shop.name,
      number: String(order.number),
      date: formatDateTime(order.createdAt, shop.language),
      customer: customer.anonymized ? words.former : customer.name || (customer.phone ? formatPhone(customer.phone) : words.walkIn),
      phone: customer.phone && !customer.anonymized ? formatPhone(customer.phone) : '',
      total: formatMoney(order.total, order.currency, shop.language),
      payment: order.paymentStatus === 'paid' ? words.paid : words.unpaid,
      note: order.note ?? '',
    },
    quantities: Object.fromEntries([...quantities].map(([id, { unit, quantity }]) =>
      [id, unit === 'kg' ? `${formatQuantity(unit, quantity)} ${words.kg}` : formatQuantity(unit, quantity)])),
    paid: order.paymentStatus === 'paid',
    services: [...new Set(order.lines.flatMap(line => (line.priceItemId && serviceOf.get(line.priceItemId)) || []))],
  }
}

/** Made-up values for the designer's preview: every quantity and service box filled, paid. */
export function sampleValues(fields: readonly ReceiptField[], shop: ShopProfile, now: Date): ReceiptValues {
  const words = WORDS[shop.language]
  const khmer = shop.language === 'km'
  return {
    text: {
      shopName: shop.name,
      number: '61',
      date: formatDateTime(now.toISOString(), shop.language),
      customer: khmer ? 'សុខ ដារ៉ា' : 'Sok Dara',
      phone: '012 345 678',
      total: formatMoney(shop.currency === 'USD' ? 1250 : 13_500, shop.currency, shop.language),
      payment: words.paid,
      note: khmer ? 'អាវពណ៌ស កុំដាក់ម៉ាស៊ីនសម្ងួត' : 'White shirt: no dryer',
    },
    quantities: Object.fromEntries(fields.flatMap(field => (field.kind === 'quantity' ? [[field.priceItemId, '2']] : []))),
    paid: true,
    services: fields.flatMap(field => (field.kind === 'serviceCheck' ? [field.serviceTypeId] : [])),
  }
}
