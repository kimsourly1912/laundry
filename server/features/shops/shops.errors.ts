import { apiError, ErrorCodes, notFound, versionConflict } from '#server/utils/errors'

/** Another shop's id answers the same as a missing one. */
export function shopNotFound() {
  return notFound('The shop')
}

export function shopChanged() {
  return versionConflict('This shop')
}

export function ownerNotFound() {
  return notFound('The shop\'s owner')
}

export function alreadySuspended() {
  return apiError(409, ErrorCodes.INVALID_STATE, 'This shop is already suspended.')
}

export function notSuspended() {
  return apiError(409, ErrorCodes.INVALID_STATE, 'This shop is not suspended.')
}
