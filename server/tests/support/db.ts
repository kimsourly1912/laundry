import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import type { Client, InStatement } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import type { Logger } from 'drizzle-orm/logger'
import { inject } from 'vitest'
import type { Db } from '#server/utils/batch'
import { trackClient } from './clients'

/** Where drizzle-kit writes migrations (`.nuxt/hub/db/drizzle.config.ts` → `out`) and NuxtHub applies them from. */
const migrationsDir = fileURLToPath(new URL('../../db/migrations/sqlite', import.meta.url))

/** D1 refuses a statement with more bound parameters than this ("too many SQL variables"); libsql allows 32,766. */
export const D1_MAX_PARAMS = 100

/** D1 refuses a LIKE or GLOB pattern over 50 bytes ("LIKE or GLOB pattern too complex"); libsql allows 50,000. */
export const D1_MAX_PATTERN_BYTES = 50

type Stmt = string | { sql: string, args?: unknown[] | Record<string, unknown> }

function paramCount(stmt: Stmt): number {
  if (typeof stmt === 'string') return 0
  return Array.isArray(stmt.args) ? stmt.args.length : Object.keys(stmt.args ?? {}).length
}

/** Refuses what D1 refuses. Which argument is a pattern isn't known, so any long text beside like/glob counts: stricter than D1, never looser. */
function checkLikeD1(stmt: Stmt) {
  const count = paramCount(stmt)
  const text = typeof stmt === 'string' ? stmt : stmt.sql
  if (count > D1_MAX_PARAMS) throw new Error(`too many SQL variables: ${count} bound parameters (D1 allows ${D1_MAX_PARAMS}) in: ${text.slice(0, 120)}`)
  if (typeof stmt === 'string' || !/\b(?:like|glob)\b/i.test(stmt.sql)) return
  const args = Array.isArray(stmt.args) ? stmt.args : Object.values(stmt.args ?? {})
  for (const arg of args) {
    if (typeof arg === 'string' && new TextEncoder().encode(arg).length > D1_MAX_PATTERN_BYTES) {
      throw new Error(`LIKE or GLOB pattern too complex: ${arg.length} characters bound beside like/glob (D1 allows ${D1_MAX_PATTERN_BYTES} bytes) in: ${text.slice(0, 120)}`)
    }
  }
}

/** The client, refusing what D1 refuses: more than 100 bound parameters in one statement, a LIKE pattern over 50 bytes. */
function likeD1(client: Client): Client {
  return new Proxy(client, {
    get(target, key, receiver) {
      if (key === 'execute') {
        // async, so a refusal is a rejected promise, as D1's own refusals are.
        return async (stmt: Stmt, args?: unknown[]) => {
          checkLikeD1(args ? { sql: stmt as string, args } : stmt)
          return target.execute(stmt as never, args as never)
        }
      }
      if (key === 'batch') {
        return async (stmts: Stmt[], mode?: unknown) => {
          stmts.forEach(checkLikeD1)
          return target.batch(stmts as never, mode as never)
        }
      }
      const value = Reflect.get(target, key, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/**
 * A fresh in-memory SQLite database with every checked-in migration applied, in NuxtHub's
 * snake_case mode. Foreign keys are enforced (as on D1), and so are D1's limits. Closed after the
 * test that opened it, or after the file when opened outside a test (./clients.ts).
 */
export async function createTestDb(options: { logger?: Logger } = {}): Promise<Db> {
  const { logger } = options
  const client = trackClient(createClient({ url: ':memory:' }))
  // The whole schema and its rows in one transaction, then foreign keys on: the pragma can't change
  // inside a transaction, and copied rows needn't be in key order.
  const schema = await migratedSchema()
  if (schema.length) await client.batch(schema, 'write')
  await client.execute('PRAGMA foreign_keys = ON')
  return drizzle({ client: likeD1(client), casing: 'snake_case', logger })
}

declare module 'vitest' {
  interface ProvidedContext {
    migratedSchema: InStatement[]
  }
}

let migrated: Promise<InStatement[]> | undefined

/**
 * What the checked-in migrations build, as statements that recreate it. The server project's
 * global setup builds it once per run; a project without it builds it once per test file.
 * Replaying a dump is much faster than replaying every migration for every test database.
 */
export function migratedSchema(): Promise<InStatement[]> {
  return migrated ??= Promise.resolve(inject('migratedSchema') ?? buildMigratedSchema())
}

/** Runs every migration on a scratch database and dumps the result (`dumpSchema`). */
export async function buildMigratedSchema(): Promise<InStatement[]> {
  const client = await createTestClient()
  for (const file of migrationFiles()) await applyMigration(client, file)
  const statements = await dumpSchema(client)
  client.close()
  return statements
}

/** A database's tables, indexes, triggers and views (in creation order), then every row of its tables. */
export async function dumpSchema(client: Client): Promise<InStatement[]> {
  const objects = (await client.execute(`SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid`)).rows
  const statements: InStatement[] = objects.map(object => String(object.sql))
  for (const name of objects.filter(object => object.type === 'table').map(object => String(object.name))) {
    // Generated columns (hidden 2 and 3) can't be inserted.
    const columns = (await client.execute({ sql: 'SELECT name FROM pragma_table_xinfo(?) WHERE hidden = 0', args: [name] })).rows.map(column => `"${String(column.name)}"`)
    const insert = `INSERT INTO "${name}" (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
    for (const row of (await client.execute(`SELECT ${columns.join(', ')} FROM "${name}"`)).rows) {
      statements.push({ sql: insert, args: columns.map((_, i) => row[i]!) })
    }
  }
  return statements
}

/** An empty in-memory database like `createTestDb`'s (foreign keys on, D1's limits), no migrations. */
export async function createTestClient(): Promise<Client> {
  const client = likeD1(trackClient(createClient({ url: ':memory:' })))
  await client.execute('PRAGMA foreign_keys = ON')
  return client
}

/** The checked-in migration files, in order. None before the first table exists. */
export function migrationFiles(): string[] {
  return existsSync(migrationsDir) ? readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).sort() : []
}

/** Runs one migration file statement by statement, as NuxtHub does. */
export async function applyMigration(client: Client, file: string) {
  const statements = readFileSync(`${migrationsDir}/${file}`, 'utf8').split('--> statement-breakpoint')
  for (const statement of statements) {
    if (statement.trim()) await client.execute(statement)
  }
}
