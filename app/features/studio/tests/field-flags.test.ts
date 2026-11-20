import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { blankDesign, designSchema } from '#shared/contracts/slip-design'
import type { SlipDesign, SlipElement } from '#shared/contracts/slip-design'
import { publishProblems } from '#shared/slip/checks'
import { createElement } from '#shared/slip/elements'
import { portalOnlyPatch, requiredPatch, requiredState } from '../utils/field-flags'

/** An HTML slip that prints the order number and QR, and none of the fields. */
function slip(elements: SlipElement[]): SlipDesign {
  return { ...blankDesign(800, 500), paper: { widthMm: 80, heightMm: 52 }, elements, html: '<div>{{order.number}}<div>{{order.qrCode}}</div></div>' }
}
const codes = (design: SlipDesign) => {
  const { errors, warnings } = publishProblems(design)
  return [...errors, ...warnings].map(problem => `${problem.code}:${problem.key ?? ''}`)
}
const apply = <T extends SlipElement>(field: T, patch: object): T => ({ ...field, ...patch })

describe('Required and Portal only (pilot plan §1)', () => {
  const initials = createElement('textField', { id: 'staff_initials' }, { label: 'Staff initials' })

  it('keeps a portal-only field off the slip when it is made required', () => {
    // Review finding: Portal only, then Required, used to clear Portal only and fail Publish.
    const portal = apply(initials, portalOnlyPatch(initials, true))
    const required = apply(portal, requiredPatch(portal, true))
    expect(required).toMatchObject({ portalOnly: true, required: true, printRequired: false })
    expect(requiredState(required)).toBe(true)
    expect(codes(slip([required]))).not.toContain('missingPrintBinding:fields.staff_initials')
    expect(codes(slip([required]))).not.toContain('unplacedField:fields.staff_initials')
    expect(v.safeParse(designSchema, slip([required])).issues).toBeUndefined()
  })

  it('keeps the entry required when a required field is then kept off the slip', () => {
    const required = apply(initials, requiredPatch(initials, true))
    expect(codes(slip([required]))).toContain('missingPrintBinding:fields.staff_initials')
    const portal = apply(required, portalOnlyPatch(required, true))
    expect(portal).toMatchObject({ portalOnly: true, required: true, printRequired: false })
    expect(codes(slip([portal])).filter(code => code.endsWith('staff_initials'))).toEqual([])
  })

  it('keeps the publish guard for a field required on the printout', () => {
    const required = apply(initials, requiredPatch(initials, true))
    expect(required).toMatchObject({ required: true, printRequired: true })
    // Printed again: required on the printout again, so an unbound field still stops Publish.
    const portal = apply(required, portalOnlyPatch(required, true))
    const back = apply(portal, portalOnlyPatch(portal, false))
    expect(back).toMatchObject({ portalOnly: undefined, required: true, printRequired: true })
    expect(codes(slip([back]))).toContain('missingPrintBinding:fields.staff_initials')
    // A portal-only flag doesn't excuse a field explicitly required on the printout.
    expect(codes(slip([{ ...required, portalOnly: true }]))).toContain('missingPrintBinding:fields.staff_initials')
  })

  it('turns Required off without touching Portal only', () => {
    const portal = apply(apply(initials, portalOnlyPatch(initials, true)), { required: true })
    expect(apply(portal, requiredPatch(portal, false))).toMatchObject({ portalOnly: true, required: false })
    expect(requiredPatch(initials, false)).toEqual({ required: false, printRequired: false })
  })

  it('never gives phone or amount a printRequired, which their schema has no room for', () => {
    const phone = createElement('phone', { id: 'phone' })
    expect(portalOnlyPatch(phone, true)).toEqual({ portalOnly: true })
    expect(portalOnlyPatch({ ...phone, portalOnly: true }, false)).toEqual({ portalOnly: undefined })
    expect(v.safeParse(designSchema, slip([apply(phone, portalOnlyPatch(phone, true))])).issues).toBeUndefined()
  })
})
