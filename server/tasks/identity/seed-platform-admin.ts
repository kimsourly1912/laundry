import { hashPassword } from 'better-auth/crypto'
import { MIN_PASSWORD_LENGTH, seedPlatformAdmin } from '#server/features/identity'

/**
 * Creates the first super admin from `NUXT_PLATFORM_ADMIN_USERNAME` / `NUXT_PLATFORM_ADMIN_PASSWORD`
 * (spec §14), on a temporary password changed at the first sign-in. Refuses when any super admin
 * exists. Local: `npx nuxt task run identity:seed-platform-admin`. Deployed environments use
 * `scripts/platform-admin-sql.ts` instead (docs/server/operations.md → First platform admin).
 */
export default defineTask({
  meta: { name: 'identity:seed-platform-admin', description: 'Create the first platform admin from env' },
  async run() {
    const { username, password } = useRuntimeConfig().platformAdmin as { username: string, password: string }
    if (!username || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Set NUXT_PLATFORM_ADMIN_USERNAME and NUXT_PLATFORM_ADMIN_PASSWORD (at least ${MIN_PASSWORD_LENGTH} characters).`)
    }
    const admin = await seedPlatformAdmin({ db: useDb(), username, passwordHash: await hashPassword(password) })
    log('info', 'Platform admin created', { userId: admin.userId })
    return { result: { username: admin.username } }
  },
})
