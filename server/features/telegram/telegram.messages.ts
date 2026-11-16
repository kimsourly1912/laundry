import type { Order } from '#shared/contracts/orders'
import type { ShopLanguage } from '#shared/contracts/shop-settings'
import { formatDateTime, formatMoney, formatQuantity } from '#shared/format'

/**
 * What the bot says (D28), in the shop's customer-facing language (D6). Every message names the
 * shop: one bot serves every shop (spec P9). These reach customers, not the app's screens, so they
 * live here rather than in the app's locale files. Before the bot knows the shop, it says it in
 * both languages.
 */

interface OrderFacts {
  shop: string
  number: number
  total: string
  paid: boolean
  /** When it became ready, without the time: `16 Nov 2026`. */
  readySince: string
}

function facts(order: Order, shop: string, language: ShopLanguage): OrderFacts {
  const readySince = order.readyAt ? formatDateTime(order.readyAt, language).replace(/,?\s*\d{1,2}:\d{2}$/, '') : ''
  return { shop, number: order.number, total: formatMoney(order.total, order.currency, language), paid: order.paymentStatus === 'paid', readySince }
}

const TEXT = {
  en: {
    askPhone: (shop: string, number: number) => `${shop}: to get updates about all your orders here, share your phone number with the button below. Or get updates about order #${number} only.`,
    sharePhone: 'Share my phone number',
    onlyThisOrder: 'Only this order',
    linkedCustomer: (shop: string) => `Done. You'll get updates about all your orders at ${shop} here.`,
    linkedOrder: (shop: string, number: number) => `Done. You'll get updates about order #${number} at ${shop} here.`,
    notYourContact: 'Please share your own phone number with the button below.',
    receipt: ({ shop, number, total, paid }: OrderFacts) => `${shop} · order #${number}\nTotal ${total} · ${paid ? 'paid' : 'not paid yet'}\nWe'll message you here when it's ready.`,
    ready: ({ shop, number, total, paid }: OrderFacts) => `${shop}: your order #${number} is ready to collect.${paid ? '' : ` To pay: ${total}.`}`,
    collected: ({ shop, number }: OrderFacts) => `${shop}: order #${number} was collected. Thank you!`,
    reminder: ({ shop, number, total, paid, readySince }: OrderFacts) => `${shop}: a reminder that your order #${number} has been ready since ${readySince}. Please come and collect it.${paid ? '' : ` To pay: ${total}.`}`,
    kg: 'kg',
  },
  km: {
    askPhone: (shop: string, number: number) => `${shop}៖ ដើម្បីទទួលព័ត៌មានអំពីការបញ្ជាទិញទាំងអស់របស់អ្នកនៅទីនេះ សូមចែករំលែកលេខទូរសព្ទរបស់អ្នកដោយប្រើប៊ូតុងខាងក្រោម។ ឬទទួលព័ត៌មានតែការបញ្ជាទិញ #${number} ប៉ុណ្ណោះ។`,
    sharePhone: 'ចែករំលែកលេខទូរសព្ទរបស់ខ្ញុំ',
    onlyThisOrder: 'តែការបញ្ជាទិញនេះ',
    linkedCustomer: (shop: string) => `រួចរាល់។ អ្នកនឹងទទួលព័ត៌មានអំពីការបញ្ជាទិញទាំងអស់របស់អ្នកនៅ ${shop} នៅទីនេះ។`,
    linkedOrder: (shop: string, number: number) => `រួចរាល់។ អ្នកនឹងទទួលព័ត៌មានអំពីការបញ្ជាទិញ #${number} នៅ ${shop} នៅទីនេះ។`,
    notYourContact: 'សូមចែករំលែកលេខទូរសព្ទផ្ទាល់ខ្លួនរបស់អ្នក ដោយប្រើប៊ូតុងខាងក្រោម។',
    receipt: ({ shop, number, total, paid }: OrderFacts) => `${shop} · ការបញ្ជាទិញ #${number}\nសរុប ${total} · ${paid ? 'បានបង់' : 'មិនទាន់បង់'}\nយើងនឹងផ្ញើសារមកអ្នកនៅទីនេះ ពេលរួចរាល់។`,
    ready: ({ shop, number, total, paid }: OrderFacts) => `${shop}៖ ការបញ្ជាទិញ #${number} របស់អ្នករួចរាល់ហើយ អាចមកយកបាន។${paid ? '' : ` ត្រូវបង់៖ ${total}។`}`,
    collected: ({ shop, number }: OrderFacts) => `${shop}៖ ការបញ្ជាទិញ #${number} ត្រូវបានយករួចហើយ។ សូមអរគុណ!`,
    reminder: ({ shop, number, total, paid, readySince }: OrderFacts) => `${shop}៖ សូមរំលឹកថា ការបញ្ជាទិញ #${number} របស់អ្នករួចរាល់តាំងពី ${readySince}។ សូមអញ្ជើញមកយក។${paid ? '' : ` ត្រូវបង់៖ ${total}។`}`,
    kg: 'គ.ក',
  },
} satisfies Record<ShopLanguage, unknown>

/** Before the bot knows the shop: both languages, Khmer first. */
export const BOTH = {
  help: 'ស្កេនកូដ QR នៅហាងបោកអ៊ុតរបស់អ្នក ដើម្បីទទួលព័ត៌មានអំពីការបញ្ជាទិញនៅទីនេះ។\n\nScan the QR code at your laundry to get updates about your order here.',
  invalidCode: 'កូដ QR នេះផុតកំណត់ ឬមិនត្រឹមត្រូវ។ សូមសុំហាងបង្ហាញម្តងទៀត។\n\nThis QR code has expired or isn\'t valid. Ask the shop to show it again.',
}

export function textsFor(language: ShopLanguage) {
  return TEXT[language]
}

/** Whether a message is the "only this order" answer, in either language. */
export function isOnlyThisOrder(text: string): boolean {
  return text.trim() === TEXT.en.onlyThisOrder || text.trim() === TEXT.km.onlyThisOrder
}

/** The receipt as text, for a shop without a receipt design: the summary, then each line. */
export function receiptText(order: Order, shop: string, language: ShopLanguage): string {
  const text = TEXT[language]
  const name = (names: { en: string, km: string | null }) => (language === 'km' && names.km ? names.km : names.en)
  const lines = order.lines.map((line) => {
    const quantity = formatQuantity(line.unit, line.quantity)
    const item = name({ en: line.itemNameEn, km: line.itemNameKm })
    const service = name({ en: line.serviceNameEn, km: line.serviceNameKm })
    return line.unit === 'kg' ? `${quantity} ${text.kg} ${item} (${service})` : `${quantity} × ${item} (${service})`
  })
  return [text.receipt(facts(order, shop, language)), '', ...lines].join('\n')
}

export function receiptCaption(order: Order, shop: string, language: ShopLanguage): string {
  return TEXT[language].receipt(facts(order, shop, language))
}

export function statusText(kind: 'ready' | 'collected' | 'reminder', order: Order, shop: string, language: ShopLanguage): string {
  return TEXT[language][kind](facts(order, shop, language))
}
