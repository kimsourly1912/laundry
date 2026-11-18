/**
 * `pnpm seed:admin`: a platform admin in the local development database (.data/db/sqlite.db).
 * Signs in with NUXT_PLATFORM_ADMIN_USERNAME / NUXT_PLATFORM_ADMIN_PASSWORD from `.env`, or
 * `admin` / `admin123`. Safe to run again: an existing account with that username gets the
 * password reset and the super admin role. Run `pnpm dev` once first so the tables exist.
 */
import { existsSync } from 'node:fs'
import { createClient } from '@libsql/client'
import { hashPassword } from 'better-auth/crypto'
import { v7 } from 'uuid'

const DB_FILE = '.data/db/sqlite.db'
const username = (process.env.NUXT_PLATFORM_ADMIN_USERNAME || 'admin').trim().toLowerCase()
const password = process.env.NUXT_PLATFORM_ADMIN_PASSWORD || 'admin123'

if (!existsSync(DB_FILE)) {
  console.error(`No local database at ${DB_FILE}. Run \`pnpm dev\` once to create it, then run this again.`)
  process.exit(1)
}

const db = createClient({ url: `file:${DB_FILE}` })
try {
  const now = Date.now()
  const hash = await hashPassword(password)
  const existing = await db.execute({ sql: 'SELECT id FROM user WHERE username = ?', args: [username] })
  const userId = String(existing.rows[0]?.id ?? v7())

  await db.batch([
    {
      sql: `INSERT INTO user (id, name, email, email_verified, username, display_username, role, must_change_password, created_at, updated_at)
            VALUES (?, 'Platform admin', ?, 1, ?, ?, 'superadmin', 0, ?, ?)
            ON CONFLICT (id) DO UPDATE SET role = 'superadmin', must_change_password = 0, updated_at = excluded.updated_at`,
      args: [userId, `${userId}@users.invalid`, username, username, now, now],
    },
    { sql: `DELETE FROM account WHERE user_id = ? AND provider_id = 'credential'`, args: [userId] },
    {
      sql: `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
            VALUES (?, ?, 'credential', ?, ?, ?, ?)`,
      args: [v7(), userId, userId, hash, now, now],
    },
  ], 'write')

  console.log(`Platform admin ready. Sign in as "${username}" / "${password}".`)
}
catch (error) {
  if (String(error).includes('no such table')) console.error('The local database has no tables yet. Run `pnpm dev` once, then run this again.')
  else console.error(error)
  process.exitCode = 1
}
finally {
  db.close()
}
