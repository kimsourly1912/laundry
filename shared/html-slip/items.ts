import type { OwnerField } from '#shared/slip/fields'
import { createElement } from '#shared/slip/elements'

/*
 * The laundry item list (D42): what Cambodian shops print on their paper slips, from real slips and
 * shops' price lists. One list for the Studio's "Add from list" and the presets, so an item has
 * the same field id and label in every template. Labels and kinds only: no prices (D44). New items
 * are added here.
 */

export const INTAKE_GROUPS = ['weight', 'tops', 'bottoms', 'formal', 'small', 'bedding', 'home', 'other', 'services', 'extras'] as const
export type IntakeGroup = typeof INTAKE_GROUPS[number]

/** `count`: pieces; `weight`: kg; `checkbox`: a ticked service; `text`: free text. */
export type IntakeKind = 'count' | 'weight' | 'checkbox' | 'text'

export interface IntakeItem {
  /** The item's stable key: a count's field id is `<key>_count`, every other kind's is the key. */
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

type ItemCandidate = { id: string, type: string, unit?: string, item?: string }

/** Whether a field is the item's kind: a count (no unit), a weight (kg), a tick or text. */
function isItemKind(element: ItemCandidate, kind: IntakeKind): boolean {
  switch (kind) {
    case 'count': return element.type === 'number' && element.unit !== 'kg'
    case 'weight': return element.type === 'number' && element.unit === 'kg'
    case 'checkbox': return element.type === 'checkbox'
    case 'text': return element.type === 'textField'
  }
}

/**
 * Whether the design already has the item, among fields of its kind (a text field the admin called
 * "Shirt count" isn't the Shirt count): the field added from the list (`item`, whatever its id
 * became), or an untracked field with the item's id (added before `item` was kept).
 */
export function hasIntakeItem(elements: readonly ItemCandidate[], entry: IntakeItem): boolean {
  return elements.some(element => isItemKind(element, entry.kind) && (
    element.item === entry.key
    || (element.item === undefined && element.id === intakeFieldId(entry))
  ))
}

/**
 * The intake field for an item, with the Studio's defaults for its kind. A count or weight records a
 * quantity only: staff type the total (manual total, D44).
 */
export function intakeField(entry: IntakeItem): OwnerField {
  const id = intakeFieldId(entry)
  // `item` remembers the list entry, so a suffixed id (`shirt_count_2`) is still this item.
  const { key: item, label } = entry
  switch (entry.kind) {
    case 'weight': return createElement('number', { id }, { label, item, unit: 'kg', decimals: 2, min: 0, max: 100 })
    case 'count': return createElement('number', { id }, { label, item })
    case 'checkbox': return createElement('checkbox', { id }, { label, item })
    case 'text': return createElement('textField', { id }, { label, item, maxLength: item === 'note' ? 100 : 40 })
  }
}
