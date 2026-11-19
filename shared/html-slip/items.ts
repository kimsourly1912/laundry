import type { OwnerField } from '#shared/slip/fields'
import { createElement } from '#shared/slip/elements'

/*
 * The laundry item list (D42): what Cambodian shops print on their paper slips, from real slips and
 * shops' price lists. One list for the Studio's "Add from list" and the presets, so a field's price
 * key is the same in every template and in every shop's price list. New items are added here.
 */

export const INTAKE_GROUPS = ['weight', 'tops', 'bottoms', 'formal', 'small', 'bedding', 'home', 'other', 'services', 'extras'] as const
export type IntakeGroup = typeof INTAKE_GROUPS[number]

/** `count`: pieces; `weight`: kg; both priced by `key`. `checkbox`: a ticked service; `text`: free text. */
export type IntakeKind = 'count' | 'weight' | 'checkbox' | 'text'

export interface IntakeItem {
  /** The price-list key of a count or weight; the field id of a checkbox or text. */
  key: string
  /** The field's starting label; the Studio can rename it. */
  label: string
  group: IntakeGroup
  kind: IntakeKind
}

const item = (group: IntakeGroup, kind: IntakeKind) => ([key, label]: readonly [string, string]): IntakeItem => ({ key, label, group, kind })
const counts = (group: IntakeGroup, entries: readonly (readonly [string, string])[]) => entries.map(item(group, 'count'))

export const INTAKE_ITEMS: readonly IntakeItem[] = [
  ...([
    ['wash_kg', 'Wash & fold'],
    ['wash_iron_kg', 'Wash & iron'],
    ['bedding_kg', 'Blankets & bedding'],
    ['curtain_kg', 'Curtains'],
  ] as const).map(item('weight', 'weight')),
  ...counts('tops', [['shirt', 'Shirt'], ['tshirt', 'T-shirt'], ['blouse', 'Blouse'], ['sweater', 'Sweater'], ['jacket', 'Jacket'], ['coat', 'Coat']]),
  ...counts('bottoms', [['trousers', 'Trousers'], ['jeans', 'Jeans'], ['shorts', 'Shorts'], ['skirt', 'Skirt']]),
  ...counts('formal', [['dress', 'Dress'], ['suit', 'Suit'], ['silk', 'Silk'], ['uniform', 'Uniform'], ['traditional', 'Traditional outfit']]),
  ...counts('small', [['underwear', 'Underwear'], ['socks', 'Socks (pair)'], ['scarf', 'Scarf'], ['cap', 'Cap']]),
  ...counts('bedding', [['blanket', 'Blanket'], ['duvet', 'Duvet'], ['bed_sheet', 'Bed sheet'], ['duvet_cover', 'Duvet cover'], ['pillowcase', 'Pillowcase'], ['pillow', 'Pillow']]),
  ...counts('home', [['towel', 'Towel'], ['foot_towel', 'Foot towel'], ['curtain', 'Curtain'], ['tablecloth', 'Tablecloth']]),
  ...counts('other', [['shoes', 'Shoes (pair)'], ['bag', 'Bag'], ['soft_toy', 'Soft toy']]),
  ...([
    ['wash', 'Wash'],
    ['wash_iron', 'Wash & iron'],
    ['dry_clean', 'Dry clean'],
    ['iron_only', 'Iron only'],
    ['express', 'Express'],
  ] as const).map(item('services', 'checkbox')),
  ...([['received_by', 'Received by'], ['other', 'Other items'], ['note', 'Note']] as const).map(item('extras', 'text')),
]

export function intakeItem(key: string): IntakeItem {
  const found = INTAKE_ITEMS.find(entry => entry.key === key)
  if (!found) throw new Error(`No intake item ${key}`)
  return found
}

/** The field id an item adds: `{{fields.shirt_count}}` for a count, the key otherwise. */
export function intakeFieldId(entry: IntakeItem): string {
  return entry.kind === 'count' ? `${entry.key}_count` : entry.key
}

/** Whether the design already has the item: a priced field by its price key, others by id. */
export function hasIntakeItem(elements: readonly { id: string, type: string, priceKey?: string }[], entry: IntakeItem): boolean {
  const priced = entry.kind === 'count' || entry.kind === 'weight'
  return elements.some(element => priced ? element.type === 'number' && element.priceKey === entry.key : element.id === intakeFieldId(entry))
}

/** The items a price key may name: counts and weights. */
export const PRICED_ITEMS: readonly IntakeItem[] = INTAKE_ITEMS.filter(item => item.kind === 'count' || item.kind === 'weight')

/** The priced item of `key`, or undefined when the key isn't on the list. */
export function pricedItem(key: string): IntakeItem | undefined {
  return PRICED_ITEMS.find(item => item.key === key)
}

/** What a shop prices for one key on its slips (D43): the list's name, and per piece or per kg. */
export interface SlipPrice {
  key: string
  label: string
  unit: 'piece' | 'kg'
}

/**
 * Every priced key on these slips, once each, in slip order (D43). The name and unit come from the
 * item list; a key that isn't on it (a slip published before D43) takes its first field's label and
 * unit.
 */
export function slipPrices(designs: readonly { elements: readonly { type: string, label?: string, unit?: string, priceKey?: string }[] }[]): SlipPrice[] {
  const found = new Map<string, SlipPrice>()
  for (const design of designs) {
    for (const element of design.elements) {
      const key = element.type === 'number' ? element.priceKey : undefined
      if (!key || found.has(key)) continue
      const item = pricedItem(key)
      found.set(key, item
        ? { key, label: item.label, unit: item.kind === 'weight' ? 'kg' : 'piece' }
        : { key, label: element.label?.trim() || key, unit: element.unit === 'kg' ? 'kg' : 'piece' })
    }
  }
  return [...found.values()]
}

/** The intake field for an item, with the Studio's defaults for its kind. */
export function intakeField(entry: IntakeItem): OwnerField {
  const id = intakeFieldId(entry)
  const { key, label } = entry
  switch (entry.kind) {
    case 'weight': return createElement('number', { id }, { label, unit: 'kg', decimals: 2, min: 0, max: 100, priceKey: key })
    case 'count': return createElement('number', { id }, { label, priceKey: key })
    case 'checkbox': return createElement('checkbox', { id }, { label })
    case 'text': return createElement('textField', { id }, { label, maxLength: key === 'note' ? 100 : 40 })
  }
}
