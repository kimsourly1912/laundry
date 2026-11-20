/**
 * An intake field's Required and Portal only (pilot plan §1). Required means staff must enter it; on
 * a field the slip prints it also means the HTML must print it (`printRequired`, which Publish
 * guards). A portal-only field is kept off the slip on purpose, so it can be required for staff
 * without being required on the printout.
 */

export interface FieldFlags {
  type: string
  required: boolean
  printRequired?: boolean
  portalOnly?: boolean
}

export type FieldFlagsPatch = Partial<Omit<FieldFlags, 'type'>>

/** Phone and amount are the order's own: they have no `printRequired` (`elementSchema`). */
const hasPrintBinding = (field: FieldFlags) => field.type !== 'phone' && field.type !== 'amount'

/** Required as the ✱ shows it: a portal-only field by its entry alone; otherwise `mixed` when the two checks differ. */
export function requiredState(field: FieldFlags): boolean | 'mixed' {
  if (field.portalOnly) return field.required
  const onSlip = Boolean(field.printRequired)
  return field.required === onSlip ? onSlip : 'mixed'
}

/** ✱ on or off: a portal-only field stays portal-only and only its entry changes. */
export function requiredPatch(field: FieldFlags, required: boolean): FieldFlagsPatch {
  return field.portalOnly ? { required } : { required, printRequired: required }
}

/**
 * Keep off the slip, or print on it again. Keeping it off drops the printout's requirement, keeping
 * the entry's; printing it again makes a required field required on the printout too.
 */
export function portalOnlyPatch(field: FieldFlags, portalOnly: boolean): FieldFlagsPatch {
  if (!hasPrintBinding(field)) return { portalOnly: portalOnly || undefined }
  return portalOnly ? { portalOnly: true, printRequired: false } : { portalOnly: undefined, printRequired: field.required }
}
