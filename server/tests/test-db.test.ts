import type { Client } from '@libsql/client'
import { sql } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '#server/utils/batch'
import { applyMigration, createTestClient, createTestDb, D1_MAX_PARAMS, D1_MAX_PATTERN_BYTES, dumpSchema, migrationFiles } from '#server/tests/support/db'

// `Db` is typed without its client; the libsql client is there at runtime.
const clientOf = (db: Db) => (db as unknown as { $client: Client }).$client

async function objects(client: Client) {
  return (await client.execute(`SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`)).rows.map(row => ({ ...row }))
}

describe('createTestDb', () => {
  it('has exactly the schema the migrations build', async () => {
    const migrated = await createTestClient()
    for (const file of migrationFiles()) await applyMigration(migrated, file)
    expect(await objects(clientOf(await createTestDb()))).toEqual(await objects(migrated))
  })

  it('enforces foreign keys and D1\'s limits', async () => {
    const db = await createTestDb()
    expect((await clientOf(db).execute('PRAGMA foreign_keys')).rows[0]![0]).toBe(1)
    const params = Array.from({ length: D1_MAX_PARAMS + 1 }, () => 1)
    await expect(clientOf(db).execute({ sql: `SELECT ${params.map(() => '?').join(', ')}`, args: params })).rejects.toThrow(/too many SQL variables/)
    await expect(clientOf(db).execute({ sql: `SELECT 'x' LIKE ?`, args: ['%'.repeat(D1_MAX_PATTERN_BYTES + 1)] })).rejects.toThrow(/pattern too complex/)
  })

  it('gives every call its own database', async () => {
    const first = await createTestDb()
    const second = await createTestDb()
    await first.run(sql`CREATE TABLE only_here (id integer)`)
    expect((await clientOf(second).execute(`SELECT count(*) FROM sqlite_master WHERE name = 'only_here'`)).rows[0]![0]).toBe(0)
  })
})

describe('dumpSchema', () => {
  it('recreates tables and rows, whatever their key order', async () => {
    const source = await createTestClient()
    await source.execute('PRAGMA foreign_keys = OFF')
    await source.execute('CREATE TABLE parents (id text primary key)')
    await source.execute('CREATE TABLE children (id text primary key, parent_id text references parents(id))')
    await source.execute(`INSERT INTO children VALUES ('c', 'p')`)
    await source.execute(`INSERT INTO parents VALUES ('p')`)
    const copy = await createTestClient()
    await copy.execute('PRAGMA foreign_keys = OFF')
    await copy.batch(await dumpSchema(source), 'write')
    expect(await objects(copy)).toEqual(await objects(source))
    expect((await copy.execute('SELECT * FROM children')).rows.map(row => ({ ...row }))).toEqual([{ id: 'c', parent_id: 'p' }])
  })
})

// libsql crashes the worker when the GC frees an open database, so every one is closed.
describe('closing test databases', () => {
  let fromBeforeAll: Db
  let fromBeforeEach: Db
  let fromTest: Db
  beforeAll(async () => {
    fromBeforeAll = await createTestDb()
  })
  beforeEach(async () => {
    fromBeforeEach = await createTestDb()
  })

  it('opens them for the test', async () => {
    fromTest = await createTestDb()
    for (const db of [fromBeforeAll, fromBeforeEach, fromTest]) expect(clientOf(db).closed).toBe(false)
  })

  it('closed the previous test\'s, and keeps one from beforeAll open until the file ends', () => {
    expect(clientOf(fromTest).closed).toBe(true)
    expect(clientOf(fromBeforeAll).closed).toBe(false)
    expect(clientOf(fromBeforeEach).closed).toBe(false)
  })
})
