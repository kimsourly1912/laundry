/**
 * Better Auth's tables (plugins included) as NuxtHub merges them, for explicit imports: services and
 * tests don't use Nitro auto-imports. Written by identity only (and Better Auth itself).
 *
 * Other features may read only these columns, in a join (docs/server/repositories.md → Other
 * features' tables): `user.id`, `user.name`; `organization.id`, `.name`, `.slug`.
 */
export { account, member, organization, rateLimit, session, user } from 'hub:db:schema'
