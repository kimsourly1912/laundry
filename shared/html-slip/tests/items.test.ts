import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { designSchema, elementSchema, keySchema } from '#shared/contracts/slip-design'
import { publishProblems } from '#shared/slip/checks'
import { checkHtml } from '#shared/html-slip/catalog'
import { placeholderText } from '#shared/html-slip/build'
import { hasIntakeItem, INTAKE_GROUPS, INTAKE_ITEMS, intakeField, intakeFieldId, intakeItem, slipPrices } from '../items'
import { newHtmlSlip } from '../presets'
import { sampleOrder } from '../sample'

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

  it('prices counts and weights by the item key, per piece or per kg', () => {
    expect(intakeField(intakeItem('shirt'))).toMatchObject({ id: 'shirt_count', type: 'number', priceKey: 'shirt', unit: '' })
    expect(intakeField(intakeItem('bedding_kg'))).toMatchObject({ id: 'bedding_kg', type: 'number', priceKey: 'bedding_kg', unit: 'kg', decimals: 2 })
    expect(intakeField(intakeItem('express'))).toMatchObject({ id: 'express', type: 'checkbox' })
    expect(intakeField(intakeItem('note'))).toMatchObject({ id: 'note', type: 'textField', maxLength: 100 })
    expect(() => intakeItem('spacesuit')).toThrow()
  })

  it('finds an item on a slip by its price key, whatever the field is called', () => {
    const { elements } = newHtmlSlip('byWeight')
    // By weight's field is `weight_kg`, priced as Wash & fold.
    expect(hasIntakeItem(elements, intakeItem('wash_kg'))).toBe(true)
    expect(hasIntakeItem(elements, intakeItem('wash_iron'))).toBe(true)
    expect(hasIntakeItem(elements, intakeItem('shirt'))).toBe(false)
    // A count with the same id but no price key isn't the item.
    expect(hasIntakeItem([{ id: 'shirt_count', type: 'number' }], intakeItem('shirt'))).toBe(false)
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

  it('totals the kilos and the pieces from their prices', () => {
    const typical = sampleOrder(design, { sample: 'typical', date: '2026-11-19' })
    expect(typical.order.lines).toHaveLength(7)
    expect(typical.order.lines![0]).toEqual({ label: 'Weight', unit: 'kg', quantity: 2500, lineTotal: 7500 })
    expect(placeholderText('fields.wash_kg', design, typical)).toBe('2.50 kg')
  })
})

describe('price keys on a slip (D43)', () => {
  const withKey = (priceKey: string, unit = '') => {
    const design = newHtmlSlip('byItem')
    return { ...design, elements: design.elements.map(element => (element.id === 'shirt_count' ? { ...element, priceKey, unit } : element)) }
  }

  it('must name an item on the list, counted or weighed as the field is', () => {
    expect(publishProblems(withKey('shirt')).errors).toEqual([])
    expect(publishProblems(withKey('shirt.dry')).errors).toEqual([{ code: 'unknownPriceKey', key: 'shirt_count' }])
    expect(publishProblems(withKey('wash_kg')).errors).toEqual([{ code: 'priceUnitMismatch', key: 'shirt_count' }])
    expect(publishProblems(withKey('shirt', 'kg')).errors).toEqual([{ code: 'priceUnitMismatch', key: 'shirt_count' }])
  })

  it('lists each priced key once, named and united by the list, in slip order', () => {
    expect(slipPrices([newHtmlSlip('byWeight'), newHtmlSlip('mixed')]).slice(0, 3)).toEqual([
      { key: 'wash_kg', label: 'Wash & fold', unit: 'kg' },
      { key: 'shirt', label: 'Shirt', unit: 'piece' },
      { key: 'trousers', label: 'Trousers', unit: 'piece' },
    ])
    // A key from before D43 keeps its field's label and unit.
    expect(slipPrices([{ elements: [{ type: 'number', label: 'Bags', unit: '', priceKey: 'bag.big' }] }])).toEqual([{ key: 'bag.big', label: 'Bags', unit: 'piece' }])
  })
})
