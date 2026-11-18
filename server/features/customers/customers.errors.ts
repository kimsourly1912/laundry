import { apiError, notFound, versionConflict } from '#server/utils/errors'

export const CustomerErrorCodes = {
  PHONE_TAKEN: 'PHONE_TAKEN',
} as const

export function customerNotFound() {
  return notFound('This customer')
}

export function customerChanged() {
  return versionConflict('This customer')
}

/** 409: another customer of the shop has this phone. */
export function phoneTaken() {
  return apiError(409, CustomerErrorCodes.PHONE_TAKEN, 'Another customer already has this phone number.', { fieldErrors: { phone: ['Another customer already has this phone number'] } })
}
