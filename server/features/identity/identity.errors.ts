import { apiError, ErrorCodes } from '#server/utils/errors'

/** The access refusals (spec §12 → Access helpers). */

export function unauthenticated() {
  return apiError(401, ErrorCodes.UNAUTHENTICATED, 'Sign in to continue.')
}

export function passwordChangeRequired() {
  return apiError(403, ErrorCodes.PASSWORD_CHANGE_REQUIRED, 'Change your temporary password to continue.')
}

export function noShop() {
  return apiError(403, ErrorCodes.NO_SHOP, 'This account doesn\'t belong to a shop.')
}

export function shopSuspended() {
  return apiError(403, ErrorCodes.SHOP_SUSPENDED, 'This shop is suspended. Contact the platform team.')
}

export function forbidden() {
  return apiError(403, ErrorCodes.FORBIDDEN, 'You don\'t have permission to do this.')
}

/** A route asked for a statement that doesn't exist: our bug, answered as a 500 (spec §5). */
export function unknownStatement(request: unknown) {
  return new Error(`Unknown permission statement: ${JSON.stringify(request)}`)
}

export function platformAdminExists() {
  return apiError(409, 'PLATFORM_ADMIN_EXISTS', 'A platform admin already exists.')
}

/** Shop creation: the owner's username is another account's. */
export function usernameTaken() {
  return apiError(409, 'USERNAME_TAKEN', 'This username is already used by another account.', { fieldErrors: { 'owner.username': ['Already used by another account'] } })
}

/** Shop creation: another shop has this short name. */
export function slugTaken() {
  return apiError(409, 'SLUG_TAKEN', 'Another shop already uses this short name.', { fieldErrors: { slug: ['Already used by another shop'] } })
}
