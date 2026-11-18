import { drizzle } from 'drizzle-orm/libsql'
import { describe, expect, it } from 'vitest'
import { linkStatement, queueChatMessageStatement } from '#server/features/notifications'
import type { Db } from '#server/utils/batch'
import { applyMigration, createTestClient, migrationFiles } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'
import { createTestTemplate } from '#server/tests/support/slips'
import { newId } from '#server/utils/ids'

// A hand-edited migration keeps the business data a generated one would have lost
// (docs/server/operations.md → Migrations: a migration never deletes business data).

describe('0003_order_stages', () => {
  it('adds the stage in place: the order and its Telegram link and message survive', async () => {
    const client = await createTestClient()
    const files = migrationFiles()
    const before = files.filter(file => file < '0003')
    for (const file of before) await applyMigration(client, file)
    const db = drizzle({ client, casing: 'snake_case' }) as unknown as Db
    const owner = await createOwner(db)
    const { versionId } = await createTestTemplate(db, owner.userId)
    // Written as the old schema had it (Drizzle's insert names the new columns too).
    const orderId = newId()
    await client.execute({
      sql: `INSERT INTO orders (id, shop_id, number, date, template_version_id, "values", shop, created_by) VALUES (?, ?, 1, '2026-11-18', ?, '{}', '{"name":"Shop","phone":null,"address":null,"logoImageId":null,"currency":"KHR"}', ?)`,
      args: [orderId, owner.shopId, versionId, owner.userId],
    })
    await db.batch([
      linkStatement(db, { shopId: owner.shopId, orderId, telegramUserId: '7', chatId: '7' }, new Date()),
      queueChatMessageStatement(db, { shopId: owner.shopId, orderId, chatId: '7', kind: 'slip' }, new Date()),
    ])

    await applyMigration(client, files.find(file => file.startsWith('0003'))!)

    const count = async (table: string) => Number((await client.execute(`SELECT count(*) AS n FROM ${table}`)).rows[0]!.n)
    expect([await count('orders'), await count('telegram_links'), await count('notifications')]).toEqual([1, 1, 1])
    expect((await client.execute('SELECT stage, ready_at FROM orders')).rows[0]).toMatchObject({ stage: 'received', ready_at: null })
    await expect(client.execute(`UPDATE orders SET stage = 'washing'`)).rejects.toThrow()
    await expect(client.execute(`UPDATE notifications SET kind = 'ready'`)).resolves.toBeDefined()
    expect((await client.execute('PRAGMA foreign_key_check')).rows).toEqual([])
  })
})
