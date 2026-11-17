import { beforeEach, describe, expect, it } from 'vitest'
import { createTelegramBot, isChatGone, isTelegramApiError, purgeTelegram, webhookSecretMatches } from '#server/features/telegram'
import { telegramInvites } from '#server/features/telegram/telegram.schema'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'
import { createTestOrder, createTestTemplate } from '#server/tests/support/slips'

// What the bot keeps until step 4 builds the order-only flow (plan §8): the Bot API client, the
// webhook's secret check, and the purge of expired QR tokens.

describe('webhookSecretMatches', () => {
  it('needs the exact secret; an unset secret matches nothing', () => {
    expect(webhookSecretMatches('s3cret_value', 's3cret_value')).toBe(true)
    expect(webhookSecretMatches('s3cret_value', 's3cret_valuE')).toBe(false)
    expect(webhookSecretMatches('s3cret_value', 's3cret')).toBe(false)
    expect(webhookSecretMatches('s3cret_value', 's3cret_value_and_more')).toBe(false)
    expect(webhookSecretMatches('s3cret_value', undefined)).toBe(false)
    expect(webhookSecretMatches('', '')).toBe(false)
  })
})

describe('createTelegramBot', () => {
  const calls: { url: string, init: RequestInit }[] = []
  let answer: Record<string, unknown> = { ok: true }
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Response.json(answer)
  }) as unknown as typeof fetch

  beforeEach(() => {
    calls.length = 0
    answer = { ok: true }
  })

  it('sends a message as JSON and a photo as a form, to the bot\'s own address', async () => {
    const bot = createTelegramBot('123:abc', fetcher)
    await bot.sendMessage('42', 'Hello')
    await bot.sendPhoto('42', new Uint8Array([1, 2, 3]), 'Your slip')
    expect(calls.map(call => call.url)).toEqual(['https://api.telegram.org/bot123:abc/sendMessage', 'https://api.telegram.org/bot123:abc/sendPhoto'])
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ chat_id: '42', text: 'Hello' })
    const form = calls[1]!.init.body as FormData
    expect(form.get('chat_id')).toBe('42')
    expect(form.get('caption')).toBe('Your slip')
  })

  it('a refusal is an error with Telegram\'s status and its wait', async () => {
    answer = { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 7 } }
    const error = await createTelegramBot('t', fetcher).sendMessage('42', 'x').catch((caught: unknown) => caught)
    expect(isTelegramApiError(error)).toBe(true)
    expect(error).toMatchObject({ status: 429, retryAfterMs: 7000, message: 'Too Many Requests' })
  })

  it('knows a blocked bot or a missing chat from a passing failure', () => {
    const apiError = (status: number, message: string) => Object.assign(new Error(message), { status })
    expect(isChatGone(apiError(403, 'Forbidden: bot was blocked by the user'))).toBe(true)
    expect(isChatGone(apiError(400, 'Bad Request: chat not found'))).toBe(true)
    expect(isChatGone(apiError(400, 'Bad Request: message text is empty'))).toBe(false)
    expect(isChatGone(apiError(502, 'Bad Gateway'))).toBe(false)
  })
})

describe('purgeTelegram', () => {
  it('deletes expired QR tokens only', async () => {
    const db: Db = await createTestDb()
    const owner = await createOwner(db)
    const { versionId } = await createTestTemplate(db, owner.userId)
    const { orderId } = await createTestOrder(db, { shopId: owner.shopId, userId: owner.userId, versionId })
    const now = new Date('2026-11-17T03:00:00Z')
    await db.insert(telegramInvites).values([
      { tokenHash: 'expired', shopId: owner.shopId, orderId, expiresAt: new Date(now.getTime() - 1) },
      { tokenHash: 'live', shopId: owner.shopId, orderId, expiresAt: new Date(now.getTime() + 60_000) },
    ])
    await purgeTelegram(db, now)
    expect((await db.select({ tokenHash: telegramInvites.tokenHash }).from(telegramInvites)).map(row => row.tokenHash)).toEqual(['live'])
  })
})
