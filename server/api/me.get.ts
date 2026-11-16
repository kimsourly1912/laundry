import { me } from '#server/features/identity'

/**
 * `GET /api/me` (spec §9): the signed-in user, their shop (if any), the granted statements and
 * `mustChangePassword`. Answers on a temporary password too: the app then shows the change-password
 * page. Not signed in or banned: 401.
 */
export default defineEventHandler(async event => me(useDb(), await sessionUser(event)))
