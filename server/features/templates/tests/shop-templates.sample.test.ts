import { beforeEach, describe, expect, it } from 'vitest'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipDesign } from '#shared/contracts/slip-design'
import { createElement } from '#shared/slip/elements'
import { templateSampleSvg } from '#server/features/templates'
import type { ShopActor } from '#server/features/identity'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'
import { attachTestTemplate, createTestTemplate } from '#server/tests/support/slips'

// Paper slips' sample (D39): an attached template drawn by the server with sample values, for its
// own shop only.

let db: Db
let a: ShopActor
let b: ShopActor
let templateId: string

const actorOf = (owner: { shopId: string, userId: string }): ShopActor => ({ userId: owner.userId, shopId: owner.shopId, role: 'owner', statements: [] })

function htmlDesign(): SlipDesign {
  return {
    ...blankDesign(600, 400),
    elements: [createElement('number', { id: 'shirt' }, { label: 'Shirt' })],
    fillOrder: ['shirt'],
    html: '<div class="flex flex-col p-4"><span>{{shop.name}}</span><span>{{fields.shirt}}</span></div>',
  }
}

const refusal = (promise: Promise<unknown>) => promise.then(() => 'allowed', (error: { statusCode?: number }) => error.statusCode)

beforeEach(async () => {
  db = await createTestDb()
  const ownerA = await createOwner(db)
  const ownerB = await createOwner(db)
  a = actorOf(ownerA)
  b = actorOf(ownerB)
  const template = await createTestTemplate(db, ownerA.userId, { design: htmlDesign() })
  templateId = template.templateId
  await attachTestTemplate(db, { shopId: a.shopId, templateId })
})

describe('templateSampleSvg', () => {
  it('draws an attached template as the server\'s SVG', async () => {
    const svg = await templateSampleSvg(db, a, templateId)
    expect(svg.startsWith('<svg')).toBe(true)
  })

  it('another shop, or a template not attached to the shop, answers 404', async () => {
    expect(await refusal(templateSampleSvg(db, b, templateId))).toBe(404)
    const elsewhere = await createTestTemplate(db, a.userId, { design: htmlDesign() })
    expect(await refusal(templateSampleSvg(db, a, elsewhere.templateId))).toBe(404)
  })
})
