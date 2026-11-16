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
