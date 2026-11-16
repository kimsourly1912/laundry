import { apiError, ErrorCodes, notFound, versionConflict } from '#server/utils/errors'
import { MAX_RECEIPT_IMAGE_BYTES, MAX_RECEIPT_SIDE, MIN_RECEIPT_SIDE } from '#shared/contracts/receipts'

/** The shop has no receipt design yet (a background is uploaded first). */
export const designNotFound = () => notFound('The receipt design')
export const designChanged = () => versionConflict('This receipt design')

/** A design already exists: the admin's page was out of date (it sends a version to replace one). */
export function designExists() {
  return apiError(409, ErrorCodes.VERSION_CONFLICT, 'This shop already has a receipt design. Reload and try again.')
}

export function invalidImage() {
  return apiError(400, 'RECEIPT_IMAGE_INVALID', `Upload a PNG or JPEG image of at most ${MAX_RECEIPT_IMAGE_BYTES / 1_000_000} MB.`)
}

export function imageSizeOutOfRange() {
  return apiError(400, 'RECEIPT_IMAGE_SIZE', `The image must be between ${MIN_RECEIPT_SIDE} and ${MAX_RECEIPT_SIDE} pixels on each side.`)
}

/** A field names a price item or service that isn't this shop's. */
export function unknownReference(path: string) {
  return apiError(400, ErrorCodes.VALIDATION_FAILED, 'A field names an item or service this shop doesn\'t have.', { fieldErrors: { [path]: ['Not in this shop\'s price list'] } })
}
