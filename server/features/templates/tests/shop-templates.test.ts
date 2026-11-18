import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { orderTemplates, setDefaultTemplate } from '#server/features/templates'
import { templateShops } from '#server/features/templates/templates.schema'
import { auditEvents } from '#server/features/platform/platform.schema'
import type { ShopActor } from '#server/features/identity'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'
import { attachTestTemplate, counterDesign, createTestTemplate } from '#server/tests/support/slips'

// The shop's default paper slip (plan §4, sheet 05): only an attached template, one per shop,
// another shop's choice untouched.

let db: Db
let a: ShopActor
let b: ShopActor
let first: { templateId: string }
let second: { templateId: string }

const actorOf = (owner: { shopId: string, userId: string }): ShopActor => ({ userId: owner.userId, shopId: owner.shopId, role: 'owner', statements: [], requestId: 'req-3' })

beforeEach(async () => {
  db = await createTestDb()
  const ownerA = await createOwner(db)
  const ownerB = await createOwner(db)
  a = actorOf(ownerA)
  b = actorOf(ownerB)
  first = await createTestTemplate(db, ownerA.userId, { design: counterDesign(), name: 'A first' })
  second = await createTestTemplate(db, ownerA.userId, { design: counterDesign(), name: 'B second' })
  for (const template of [first, second]) await attachTestTemplate(db, { shopId: a.shopId, templateId: template.templateId })
  await attachTestTemplate(db, { shopId: b.shopId, templateId: first.templateId, isDefault: true })
})

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string } }) => `${error.statusCode} ${error.data?.code}`)
}

const defaults = async (actor: ShopActor) => (await orderTemplates(db, actor)).filter(item => item.isDefault).map(item => item.name)

describe('setDefaultTemplate', () => {
  it('makes one attached template the default, then moves it; the other shop keeps its own', async () => {
    expect(await defaults(a)).toEqual([])
    expect((await setDefaultTemplate(db, a, first.templateId)).filter(item => item.isDefault).map(item => item.name)).toEqual(['A first'])
    await setDefaultTemplate(db, a, second.templateId)
    expect(await defaults(a)).toEqual(['B second'])
    await setDefaultTemplate(db, a, second.templateId)
    expect(await defaults(a)).toEqual(['B second'])
    expect(await defaults(b)).toEqual(['A first'])
    expect(await db.$count(auditEvents, eq(auditEvents.action, 'template.default'))).toBe(3)
  })

  it('refuses a template the shop can\'t use (404), and another shop\'s choice is untouched', async () => {
    const elsewhere = await createTestTemplate(db, a.userId, { design: counterDesign() })
    expect(await refusal(setDefaultTemplate(db, a, elsewhere.templateId))).toBe('404 NOT_FOUND')
    expect(await refusal(setDefaultTemplate(db, b, second.templateId))).toBe('404 NOT_FOUND')
    expect(await defaults(b)).toEqual(['A first'])
  })

  it('a template detached between the check and the write leaves the shop as it was', async () => {
    await setDefaultTemplate(db, a, first.templateId)
    const racing = new Proxy(db, {
      get(target, key, receiver) {
        if (key === 'batch') {
          return async (statements: unknown) => {
            await target.delete(templateShops).where(and(eq(templateShops.shopId, a.shopId), eq(templateShops.templateId, second.templateId)))
            return target.batch(statements as never)
          }
        }
        return Reflect.get(target, key, receiver)
      },
    })
    expect(await refusal(setDefaultTemplate(racing, a, second.templateId))).toBe('404 NOT_FOUND')
    expect(await defaults(a)).toEqual(['A first'])
  })
})
