import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { designSchema, elementSchema, keySchema } from '#shared/contracts/slip-design'
import { publishProblems } from '#shared/slip/checks'
import { createElement } from '#shared/slip/elements'
import { checkHtml } from '#shared/html-slip/catalog'
import { hasIntakeItem, INTAKE_GROUPS, INTAKE_ITEMS, intakeField, intakeFieldId, intakeItem } from '../items'
import { newHtmlSlip } from '../presets'

describe('the laundry item list', () => {
  it('gives every item one key, one field id and a valid field', () => {
    const keys = INTAKE_ITEMS.map(item => item.key)
    expect(new Set(keys).size).toBe(keys.length)
    const ids = INTAKE_ITEMS.map(intakeFieldId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const item of INTAKE_ITEMS) {
      expect(INTAKE_GROUPS).toContain(item.group)
      expect(v.is(keySchema, intakeFieldId(item))).toBe(true)
      expect(v.safeParse(elementSchema, intakeField(item)).issues).toBeUndefined()
    }
  })

  it('adds counts and weights as quantities with no price (manual total)', () => {
    expect(intakeField(intakeItem('shirt'))).toMatchObject({ id: 'shirt_count', type: 'number', unit: '' })
    expect(intakeField(intakeItem('shirt'))).not.toHaveProperty('priceKey')
    expect(intakeField(intakeItem('bedding_kg'))).toMatchObject({ id: 'bedding_kg', type: 'number', unit: 'kg', decimals: 2 })
    expect(intakeField(intakeItem('bedding_kg'))).not.toHaveProperty('priceKey')
    expect(intakeField(intakeItem('express'))).toMatchObject({ id: 'express', type: 'checkbox' })
    expect(intakeField(intakeItem('note'))).toMatchObject({ id: 'note', type: 'textField', maxLength: 100 })
    expect(() => intakeItem('spacesuit')).toThrow()
  })

  it('finds an item on a slip by its field id, or by its price key whatever the field is called', () => {
    const manual = newHtmlSlip('byWeight').elements
    // By weight's `weight_kg` is no list item.
    expect(hasIntakeItem(manual, intakeItem('wash_kg'))).toBe(false)
    expect(hasIntakeItem(manual, intakeItem('wash_iron'))).toBe(true)
    expect(hasIntakeItem(manual, intakeItem('shirt'))).toBe(false)
    // A count added from the list is the item, so it isn't offered twice.
    expect(hasIntakeItem([{ id: 'shirt_count', type: 'number' }], intakeItem('shirt'))).toBe(true)
  })

  it('remembers the list item a field came from', () => {
    expect(intakeField(intakeItem('shirt'))).toMatchObject({ item: 'shirt' })
    expect(intakeField(intakeItem('wash_iron'))).toMatchObject({ item: 'wash_iron' })
  })

  it('matches only fields of the item\'s kind, and follows the item when its id takes a suffix', () => {
    // Review finding: a text field "Shirt count" takes the id `shirt_count` and blocked the Shirt count.
    const custom = createElement('textField', { id: 'shirt_count' }, { label: 'Shirt count' })
    const shirt = intakeItem('shirt')
    expect(hasIntakeItem([custom], shirt)).toBe(false)
    // Added after it, the Shirt count's id gets a suffix; the picker still knows it's on the slip.
    const added = { ...intakeField(shirt), id: 'shirt_count_2' }
    expect(hasIntakeItem([custom, added], shirt)).toBe(true)
    // The custom text field isn't another list item either.
    expect(INTAKE_ITEMS.filter(item => hasIntakeItem([custom], item))).toEqual([])
    // Wash & iron is a weight and a service tick: each is matched by its own kind.
    const tick = intakeField(intakeItem('wash_iron'))
    expect(hasIntakeItem([tick], intakeItem('wash_iron_kg'))).toBe(false)
    expect(hasIntakeItem([{ ...tick, id: 'wash_iron_kg', item: undefined }], intakeItem('wash_iron_kg'))).toBe(false)
    // An untracked count is no weight, even with a weight item's id.
    expect(hasIntakeItem([{ id: 'wash_kg', type: 'number', unit: '' }], intakeItem('wash_kg'))).toBe(false)
  })
})

describe('the Kilos and pieces preset', () => {
  const design = newHtmlSlip('mixed')

  it('publishes with clean markup and a valid design', () => {
    expect(v.safeParse(designSchema, design).issues).toBeUndefined()
    expect(publishProblems(design).errors).toEqual([])
    expect(checkHtml(design.html!, design).problems).toEqual([])
  })

  it('prints every field it asks staff for', () => {
    for (const element of design.elements.filter(item => item.type === 'number' || item.type === 'checkbox' || item.type === 'textField')) {
      expect(design.html).toContain(`{{fields.${element.id}}}`)
    }
    expect(design.fillOrder).toEqual(['phone', 'wash_kg', 'shirt_count', 'trousers_count', 'dress_count', 'coat_count', 'blanket_count', 'towel_count', 'other', 'wash_iron', 'dry_clean', 'iron_only', 'express', 'received_by', 'total', 'paid'])
  })
})
