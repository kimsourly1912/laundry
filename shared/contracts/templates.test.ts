import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { templateDefinitionSchema, templatePriceRows } from './templates'
import type { TemplateDefinition } from './templates'

const definition: TemplateDefinition = {
  services: [{ key: 'wash', nameEn: 'Wash & iron', nameKm: 'បោកអ៊ុត' }, { key: 'iron', nameEn: 'Iron', nameKm: null }],
  items: [
    { key: 'shirt', nameEn: 'Shirt', nameKm: 'អាវ', unit: 'piece' },
    { key: 'pants', nameEn: 'Pants', nameKm: 'ខោ', unit: 'piece' },
    { key: 'kg', nameEn: 'Mixed', nameKm: null, unit: 'kg' },
  ],
  prices: [
    { service: 'wash', item: 'kg', price: 2000 },
    { service: 'iron', item: 'shirt', price: 500 },
    { service: 'wash', item: 'shirt', price: 1000 },
  ],
}

function issues(input: unknown) {
  const result = v.safeParse(templateDefinitionSchema, input)
  return result.success ? [] : result.issues.map(issue => `${v.getDotPath(issue)}: ${issue.message}`)
}

describe('templateDefinitionSchema', () => {
  it('accepts a template whose prices name its own services and items', () => {
    expect(issues(definition)).toEqual([])
  })

  it('refuses two services or two items with the same key', () => {
    expect(issues({ ...definition, services: [...definition.services, { key: 'wash', nameEn: 'Dry clean', nameKm: null }] })).toEqual(['services: Each service needs its own key'])
    expect(issues({ ...definition, items: [...definition.items, { key: 'shirt', nameEn: 'Coat', nameKm: null, unit: 'piece' }] })).toEqual(['items: Each item needs its own key'])
  })

  it('refuses a price for a service or item the template doesn\'t have', () => {
    expect(issues({ ...definition, prices: [...definition.prices, { service: 'dry', item: 'shirt', price: 1 }] })).toEqual(['prices: A price names a service or item that isn\'t in the template'])
    expect(issues({ ...definition, prices: [...definition.prices, { service: 'wash', item: 'coat', price: 1 }] })).toEqual(['prices: A price names a service or item that isn\'t in the template'])
  })

  it('refuses two prices for the same item in the same service', () => {
    expect(issues({ ...definition, prices: [...definition.prices, { service: 'wash', item: 'shirt', price: 1200 }] })).toEqual(['prices: An item has two prices in the same service'])
  })

  it('refuses an empty template, negative or fractional prices, and odd keys', () => {
    expect(issues({ services: [], items: [], prices: [] })).toEqual(expect.arrayContaining(['services: Add at least one service', 'items: Add at least one item', 'prices: Give at least one price']))
    expect(issues({ ...definition, prices: [{ service: 'wash', item: 'shirt', price: -1 }] })).toEqual(['prices.0.price: Can\'t be negative'])
    expect(issues({ ...definition, prices: [{ service: 'wash', item: 'shirt', price: 1.5 }] })).toEqual(['prices.0.price: Must be a whole number of riel or cents'])
    expect(issues({ ...definition, services: [{ key: 'a b', nameEn: 'X', nameKm: null }] })).toEqual(expect.arrayContaining(['services.0.key: Must be a short key']))
  })
})

describe('templatePriceRows', () => {
  it('lists the priced pairs by service, then by item, in the template\'s order', () => {
    expect(templatePriceRows(definition).map(row => `${row.serviceKey}/${row.itemKey}=${row.price}`)).toEqual(['wash/shirt=1000', 'wash/kg=2000', 'iron/shirt=500'])
    expect(templatePriceRows(definition)[1]).toEqual({ serviceKey: 'wash', itemKey: 'kg', nameEn: 'Mixed', nameKm: null, unit: 'kg', price: 2000 })
  })
})
