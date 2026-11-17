import { execSync, spawn } from 'node:child_process'
import { copyFileSync, existsSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TestProject } from 'vitest/node'
import { E2E_ACCOUNTS, seedE2e } from './seed'
import type { E2eAccounts } from './seed'

declare module 'vitest' {
  export interface ProvidedContext {
    e2eHost: string
    e2eAccounts: E2eAccounts
  }
}

const rootDir = fileURLToPath(new URL('../../..', import.meta.url))
/** The e2e build's data, apart from the dev server's (`nuxt.config.ts` → `hub.dir`). */
const E2E_HUB_DIR = '.data/e2e'

/**
 * Builds the app (a production build, like a deployment), migrates and seeds a fresh database for
 * it, and serves it for every e2e file (docs/guides/development.md → E2E). `E2E_SKIP_BUILD=1` reuses
 * the last e2e build while working on tests.
 */
export default async function ({ provide }: TestProject) {
  const dbDir = join(rootDir, E2E_HUB_DIR, 'db')
  const dbFile = join(dbDir, 'sqlite.db')
  const seeded = join(dbDir, 'seeded.db')
  if (!process.env.E2E_SKIP_BUILD || !existsSync(join(rootDir, '.output', 'server', 'index.mjs')) || !existsSync(seeded)) {
    // The build applies the migrations to the e2e database: start from none.
    rmSync(dbDir, { recursive: true, force: true })
    execSync('pnpm nuxt build', { cwd: rootDir, stdio: 'inherit', env: { ...process.env, E2E_HUB_DIR } })
    await seedE2e(dbFile)
    copyFileSync(dbFile, seeded)
  }
  // Every run starts from the seeded database, also when the build is reused.
  copyFileSync(seeded, dbFile)
  provide('e2eAccounts', E2E_ACCOUNTS)

  const port = await freePort()
  const host = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, ['.output/server/index.mjs'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      // Better Auth needs the site's address and a secret in a production build. Test values.
      NUXT_PUBLIC_SITE_URL: host,
      NUXT_BETTER_AUTH_SECRET: 'e2e-better-auth-secret-at-least-32-characters',
      // A bot name only, no token: the counter's QR shows; nothing is ever sent to Telegram.
      NUXT_TELEGRAM_BOT_USERNAME: 'laundry_e2e_bot',
    },
    stdio: 'inherit',
  })
  await waitUntilUp(host)
  provide('e2eHost', host)
  return () => {
    server.kill()
  }
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number }
      probe.close(() => resolve(port))
    }).on('error', reject)
  })
}

async function waitUntilUp(host: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${host}/api/health`)).ok) return
    }
    catch {
      // not listening yet
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`e2e server did not start on ${host}`)
}
