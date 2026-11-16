import { apiError, ErrorCodes, notFound, versionConflict } from '#server/utils/errors'

/** Another shop's id answers the same as a missing one. */
export const serviceTypeNotFound = () => notFound('The service type')
export const priceItemNotFound = () => notFound('The price item')
export const serviceTypeChanged = () => versionConflict('This service type')
export const priceItemChanged = () => versionConflict('This price item')

export function alreadyArchived() {
  return apiError(409, ErrorCodes.INVALID_STATE, 'This is already archived.')
}

/** An item can only go into an active service type of the shop. */
export function serviceTypeUnavailable() {
  return apiError(409, 'SERVICE_TYPE_UNAVAILABLE', 'Choose an active service type.', { fieldErrors: { serviceTypeId: ['Choose an active service type'] } })
}

export function serviceTypeInUse() {
  return apiError(409, 'SERVICE_TYPE_IN_USE', 'Archive this service type\'s price items first.')
}

export function priceListFull(max: number) {
  return apiError(409, 'PRICE_LIST_FULL', `A shop can have at most ${max} active entries here. Archive some first.`)
}
