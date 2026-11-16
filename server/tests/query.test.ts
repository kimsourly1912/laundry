import { eq, sql } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '#server/utils/batch'
import { containsText, firstRow } from '#server/utils/query'
import { createTestDb, D1_MAX_PATTERN_BYTES } from '#server/tests/support/db'

const people = sqliteTable('people', { id: text().primaryKey(), name: text().notNull() })

let db: Db
beforeEach(async () => {
  db = await createTestDb()
  await db.run(sql`create table people (id text primary key, name text not null)`)
  await db.insert(people).values([
    { id: '1', name: 'Sokha Chan' },
    { id: '2', name: '100% cotton' },
    { id: '3', name: 'សុខា ចាន់' },
  ])
})

const matching = async (search: string) => (await db.select({ id: people.id }).from(people).where(containsText(people.name, search)).orderBy(people.id)).map(row => row.id)

describe('firstRow', () => {
  it('returns the first row or undefined', async () => {
    expect(await firstRow(db.select().from(people).where(eq(people.id, '2')))).toEqual({ id: '2', name: '100% cotton' })
    expect(await firstRow(db.select().from(people).where(eq(people.id, 'none')))).toBeUndefined()
  })
})

describe('containsText', () => {
  it('matches anywhere, ignoring ASCII case', async () => {
    expect(await matching('chan')).toEqual(['1'])
    expect(await matching('SOKHA')).toEqual(['1'])
  })

  it('treats % and _ as literal text, not wildcards', async () => {
    expect(await matching('%')).toEqual(['2'])
    expect(await matching('_')).toEqual([])
  })

  it('finds Khmer text, also a search longer than D1 allows a LIKE pattern', async () => {
    expect(await matching('សុខា')).toEqual(['3'])
    const long = 'ក'.repeat(D1_MAX_PATTERN_BYTES)
    expect(new TextEncoder().encode(long).length).toBeGreaterThan(D1_MAX_PATTERN_BYTES)
    expect(await matching(long)).toEqual([])
  })
})
