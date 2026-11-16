import { apiError, ErrorCodes, notFound, versionConflict } from '#server/utils/errors'

/** Another shop's customer answers the same as a missing one. */
export const customerNotFound = () => notFound('The customer')
export const customerChanged = () => versionConflict('This customer')

export function customerAnonymized() {
  return apiError(409, ErrorCodes.INVALID_STATE, 'This customer was anonymized.')
}

/** Another customer of the shop has this phone (spec §16): the app offers that customer. */
export function phoneTaken() {
  return apiError(409, 'PHONE_TAKEN', 'Another customer already has this phone number.', { fieldErrors: { phone: ['Another customer already has this phone number'] } })
}
