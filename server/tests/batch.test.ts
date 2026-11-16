import { eq, inArray, sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '#server/utils/batch'
import {
  chunk,
  IDS_PER_STATEMENT,
  insertAll,
  isForeignKeyError,
  isStaleWrite,
  isUniqueViolation,
  readInChunks,
  requireAtMost,
  requireCount,
  requireOneChange,
  runBatch,
  updateAtVersion,
} from '#server/utils/batch'
import { versionConflict } from '#server/utils/errors'
import { createTestDb } from '#server/tests/support/db'

const things = sqliteTable('things', {
  id: text().primaryKey(),
  shopId: text().notNull(),
  name: text().notNull(),
  status: text().notNull(),
  version: integer().notNull(),
})
const notes = sqliteTable('notes', {
  id: text().primaryKey(),
  thingId: text().notNull(),
  body: text().notNull(),
})

let db: Db
beforeEach(async () => {
  db = await createTestDb()
  await db.run(sql`create table things (id text primary key, shop_id text not null, name text not null, status text not null, version integer not null)`)
  await db.run(sql`create table notes (id text primary key, thing_id text not null references things(id), body text not null unique)`)
  await db.insert(things).values([
    { id: 'a', shopId: 'shop-a', name: 'A', status: 'received', version: 1 },
    { id: 'b', shopId: 'shop-b', name: 'B', status: 'received', version: 1 },
  ])
})

const thing = async (id: string) => (await db.select().from(things).where(eq(things.id, id)))[0]
const noteBodies = async () => (await db.select({ body: notes.body }).from(notes).orderBy(notes.body)).map(row => row.body)
const note = (body: string, thingId = 'a') => db.insert(notes).values({ id: body, thingId, body })
const stale = () => versionConflict('The thing')

describe('updateAtVersion + requireOneChange', () => {
  it('applies the whole batch when the version still matches, and moves to the next version', async () => {
    await runBatch(db, [updateAtVersion(db, things, { shopId: 'shop-a', id: 'a', version: 1 }, { name: 'A2' }), requireOneChange(db), note('changed')], stale)
    expect(await thing('a')).toMatchObject({ name: 'A2', version: 2 })
    expect(await noteBodies()).toEqual(['changed'])
  })

  it('rolls back everything, before and after the guard, on a stale version', async () => {
    const run = runBatch(db, [note('before'), updateAtVersion(db, things, { shopId: 'shop-a', id: 'a', version: 7 }, { name: 'A2' }), requireOneChange(db), note('after')], stale)
    await expect(run).rejects.toMatchObject({ statusCode: 409, data: { code: 'VERSION_CONFLICT' } })
    expect(await thing('a')).toMatchObject({ name: 'A', version: 1 })
    expect(await noteBodies()).toEqual([])
  })

  it('never changes another shop\'s row, even with its right id and version', async () => {
    const run = runBatch(db, [updateAtVersion(db, things, { shopId: 'shop-a', id: 'b', version: 1 }, { name: 'stolen' }), requireOneChange(db)], stale)
    await expect(run).rejects.toMatchObject({ statusCode: 409 })
    expect(await thing('b')).toMatchObject({ name: 'B', version: 1 })
  })

  it('checks the extra condition (the state an edit is valid from)', async () => {
    await db.update(things).set({ status: 'ready' }).where(eq(things.id, 'a'))
    const run = runBatch(db, [updateAtVersion(db, things, { shopId: 'shop-a', id: 'a', version: 1 }, { name: 'A2' }, inArray(things.status, ['received', 'in_progress'])), requireOneChange(db)], stale)
    await expect(run).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('requireCount and requireAtMost', () => {
  it('pass or abort the batch on a count', async () => {
    const count = db.$count(things, eq(things.shopId, 'shop-a'))
    await runBatch(db, [requireCount(db, sql`${count}`, 1), note('one')], stale)
    await expect(runBatch(db, [note('two'), requireCount(db, sql`${count}`, 2)], stale)).rejects.toMatchObject({ statusCode: 409 })
    await expect(runBatch(db, [note('three'), requireAtMost(db, sql`${count}`, 0)], stale)).rejects.toMatchObject({ statusCode: 409 })
    expect(await noteBodies()).toEqual(['one'])
  })
})

describe('runBatch', () => {
  it('runs nothing for no statements', async () => {
    expect(await runBatch(db, [], stale)).toEqual([])
  })

  it('rethrows failures that are not guards, and classifies them', async () => {
    await note('x')
    const unique = await runBatch(db, [note('x')], stale).catch((error: unknown) => error)
    expect(isUniqueViolation(unique)).toBe(true)
    expect(isStaleWrite(unique)).toBe(false)
    const foreign = await runBatch(db, [note('y', 'missing')], stale).catch((error: unknown) => error)
    expect(isForeignKeyError(foreign)).toBe(true)
  })
})

describe('D1 limits', () => {
  it('chunk splits a list into pieces', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([])).toEqual([])
  })

  it('the test database refuses what D1 refuses: one IN list over 100 parameters', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `id-${i}`)
    // Drizzle wraps the driver's error; the driver's message is its cause.
    await expect(db.select().from(things).where(inArray(things.id, ids))).rejects.toMatchObject({ cause: { message: expect.stringMatching(/too many SQL variables/) } })
  })

  it('readInChunks reads a long id list in pieces, and runs nothing for none', async () => {
    const ids = ['a', ...Array.from({ length: IDS_PER_STATEMENT * 2 }, (_, i) => `missing-${i}`), 'b']
    const rows = await readInChunks(ids, piece => db.select({ id: things.id }).from(things).where(inArray(things.id, piece)))
    expect(rows.map(row => row.id).sort()).toEqual(['a', 'b'])
    let calls = 0
    await readInChunks([], async () => {
      calls++
      return []
    })
    expect(calls).toBe(0)
  })

  it('insertAll inserts many rows in statements under the limit', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ id: `n${i}`, thingId: 'a', body: `body ${i}` }))
    const statements = insertAll(db, notes, rows)
    expect(statements.length).toBeGreaterThan(1)
    await runBatch(db, statements, stale)
    expect((await noteBodies()).length).toBe(120)
    expect(insertAll(db, notes, [])).toEqual([])
  })
})
