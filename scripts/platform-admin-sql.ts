/**
 * The first platform admin of a deployed environment (docs/server/operations.md → First platform
 * admin). A Worker has no command line, so this prints SQL to run with
 * `wrangler d1 execute <database> --remote --file <file>`. The password is hashed here, with
 * Better Auth's own `hashPassword`: only the hash reaches the database.
 *
 * Like the seed task, it creates nothing when any super admin exists (each insert is guarded), and
 * the admin must change the password at the first sign-in.
 *
 * Usage (Node 24 runs TypeScript directly):
 *   NUXT_PLATFORM_ADMIN_USERNAME=… NUXT_PLATFORM_ADMIN_PASSWORD=… node scripts/platform-admin-sql.ts > admin.sql
 */
import { hashPassword } from 'better-auth/crypto'
import { v7 } from 'uuid'

const MIN_PASSWORD_LENGTH = 10

const username = (process.env.NUXT_PLATFORM_ADMIN_USERNAME ?? '').trim().toLowerCase()
const password = process.env.NUXT_PLATFORM_ADMIN_PASSWORD ?? ''
if (!/^[a-z0-9_.]{3,32}$/.test(username) || password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Set NUXT_PLATFORM_ADMIN_USERNAME (3–32 of a-z 0-9 _ .) and NUXT_PLATFORM_ADMIN_PASSWORD (at least ${MIN_PASSWORD_LENGTH} characters).`)
  process.exit(1)
}

const quote = (value: string) => `'${value.replaceAll('\'', '\'\'')}'`
const userId = v7()
const now = Date.now()
const hash = await hashPassword(password)
const noAdminYet = `NOT EXISTS (SELECT 1 FROM "user" WHERE role = 'superadmin')`

console.log(`-- First platform admin "${username}". Creates nothing if a super admin exists.
INSERT INTO "user" (id, name, email, email_verified, username, display_username, role, must_change_password, created_at, updated_at)
SELECT ${quote(userId)}, 'Platform admin', ${quote(`${userId}@users.invalid`)}, 1, ${quote(username)}, ${quote(username)}, 'superadmin', 1, ${now}, ${now}
WHERE ${noAdminYet};
INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
SELECT ${quote(v7())}, ${quote(userId)}, 'credential', ${quote(userId)}, ${quote(hash)}, ${now}, ${now}
WHERE EXISTS (SELECT 1 FROM "user" WHERE id = ${quote(userId)});`)
