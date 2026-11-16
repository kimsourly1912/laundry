import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { createTemplateSchema } from '#shared/contracts/templates'
import type { Template } from '#shared/contracts/templates'
import type { TemplateForm } from '../schemas/template-form'
import { move, priceKey, starterTemplateForm, templateFormErrors, toTemplateForm, toTemplateRequest } from '../schemas/template-form'

const t = (key: string) => key

function priced(form: TemplateForm, text = '1,500'): TemplateForm {
  return { ...form, name: ' Standard ', prices: { [priceKey(form.services[0]!.key, form.items[0]!.key)]: text } }
}

describe('templateFormErrors', () => {
  it('passes a named template with one price, and the request passes the contract (never looser)', () => {
    const form = priced(starterTemplateForm())
    expect(templateFormErrors(form, t)).toEqual([])
    const request = toTemplateRequest(form)
    expect(v.safeParse(createTemplateSchema, request).success).toBe(true)
    expect(request.name).toBe('Standard')
    expect(request.definition.prices).toEqual([{ service: form.services[0]!.key, item: form.items[0]!.key, price: 1500 }])
    // A blank Khmer name is no name.
    expect(toTemplateRequest({ ...form, services: [{ ...form.services[0]!, nameKm: ' ' }], items: [form.items[0]!] }).definition.services[0]!.nameKm).toBeNull()
  })

  it('asks for a name, a price, and names on every row', () => {
    const form = starterTemplateForm()
    form.services[1]!.nameEn = ' '
    expect(templateFormErrors(form, t).map(error => error.name)).toEqual(['name', 'services.1.nameEn', 'prices'])
    expect(v.safeParse(createTemplateSchema, toTemplateRequest(form)).success).toBe(false)
  })

  it('refuses an amount the currency can\'t hold, on its cell', () => {
    const form = priced(starterTemplateForm(), '12.5')
    const cell = `prices.${priceKey(form.services[0]!.key, form.items[0]!.key)}`
    expect(templateFormErrors(form, t)).toEqual([{ name: cell, message: 'validation.moneyKhr' }])
    expect(templateFormErrors({ ...form, currency: 'USD' }, t)).toEqual([])
    expect(templateFormErrors({ ...form, prices: { [cell.slice(7)]: '999999999' } }, t)).toEqual([{ name: cell, message: 'validation.tooHigh' }])
  })

  it('drops the prices of a removed service or item', () => {
    const form = priced(starterTemplateForm())
    const request = toTemplateRequest({ ...form, items: form.items.slice(1) })
    expect(request.definition.prices).toEqual([])
  })

  it('needs at least one service and one item', () => {
    const form = { ...starterTemplateForm(), name: 'X', services: [], items: [] }
    expect(templateFormErrors(form, t).map(error => error.name)).toEqual(['services', 'items'])
  })
})

describe('toTemplateForm', () => {
  it('shows a saved template as typed, and saves back the same definition', () => {
    const request = toTemplateRequest(priced(starterTemplateForm()))
    const template: Template = { id: 'x', status: 'active', version: 1, serviceCount: 3, itemCount: 7, updatedAt: '', ...v.parse(createTemplateSchema, request) }
    const form = toTemplateForm(template)
    expect(form.prices[priceKey(request.definition.prices[0]!.service, request.definition.prices[0]!.item)]).toBe('1500')
    expect(toTemplateRequest(form)).toEqual(request)
  })
})

describe('move', () => {
  it('moves a row up or down, and nothing past the ends', () => {
    const list = ['a', 'b', 'c']
    move(list, 0, -1)
    move(list, 2, 1)
    expect(list).toEqual(['a', 'b', 'c'])
    move(list, 0, 1)
    expect(list).toEqual(['b', 'a', 'c'])
    move(list, 2, -1)
    expect(list).toEqual(['b', 'c', 'a'])
  })
})
