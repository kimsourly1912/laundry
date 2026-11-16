import { describe, expect, it } from 'vitest'
import type { Db } from '#server/utils/batch'
import { databaseAnswers } from '#server/utils/health'
import { createTestDb } from '#server/tests/support/db'

describe('databaseAnswers', () => {
  it('is true when the database answers', async () => {
    expect(await databaseAnswers(await createTestDb())).toBe(true)
  })

  it('is false, without throwing, when it does not', async () => {
    const broken = { run: async () => {
      throw new Error('D1_ERROR: network')
    } } as unknown as Db
    expect(await databaseAnswers(broken)).toBe(false)
  })
})
