/** The identity feature's public API (docs/server/architecture.md → Features). */
export { authorizePlatform, authorizeShop, authorizeSignedIn, me, resetPasswordStatements, revokeSessionsStatements, seedPlatformAdmin } from './identity.service'
export { placeholderEmail, normalizeUsername, MIN_PASSWORD_LENGTH } from './identity.rules'
export type { ShopPermission, PlatformPermission, ShopRole } from './identity.permissions'
export type { MeResponse, PlatformActor, SessionUser, ShopActor } from './identity.types'
