import type { AttachTemplateInput, ShopTemplate, TemplateShop } from '#shared/contracts/templates'
import type { Db, Statement } from '#server/utils/batch'
import { runBatch } from '#server/utils/batch'
import { auditStatement } from '#server/features/platform'
import type { PlatformActor } from '#server/features/identity'
import * as repo from './attachments.repository'
import { findTemplate } from './templates.repository'
import { shopNotFound, templateNotAttachable, templateNotFound } from './templates.errors'

/**
 * Attaching templates to shops (plan §4, step 2): the platform chooses which published templates a
 * shop may use. Detaching (or archiving) a shop's default leaves it with none; its owner chooses
 * again, and old orders keep their version. Audited as platform actions, the template as target.
 */

function audit(db: Db, actor: PlatformActor, templateId: string, action: string, shopId: string, now: Date): Statement {
  return auditStatement(db, { userId: actor.userId, shopId: null, requestId: actor.requestId }, { action, targetType: 'template', targetId: templateId, data: { shopId } }, now)
}

async function requireTemplate(db: Db, templateId: string) {
  const template = await findTemplate(db, templateId)
  if (!template) throw templateNotFound()
  return template
}

async function requireShop(db: Db, shopId: string) {
  if (!await repo.shopExists(db, shopId)) throw shopNotFound()
}

export async function templateShops(db: Db, templateId: string): Promise<TemplateShop[]> {
  await requireTemplate(db, templateId)
  return (await repo.shopsOfTemplate(db, templateId)).map(row => ({ ...row, attachedAt: row.attachedAt.toISOString() }))
}

export async function shopTemplates(db: Db, shopId: string): Promise<ShopTemplate[]> {
  await requireShop(db, shopId)
  return (await repo.templatesOfShop(db, shopId)).map(row => ({ ...row, attachedAt: row.attachedAt.toISOString() }))
}

/**
 * Attaches a published template to the shop (422 `TEMPLATE_NOT_ATTACHABLE` for a draft or archived
 * one). Attaching it again changes nothing. One batch: the guard that it's still published, the row
 * and the audit row.
 */
export async function attachTemplate(db: Db, actor: PlatformActor, templateId: string, input: AttachTemplateInput, now = new Date()): Promise<TemplateShop[]> {
  const { shopId } = input
  const template = await requireTemplate(db, templateId)
  await requireShop(db, shopId)
  if (template.status !== 'published') throw templateNotAttachable()
  if (!await repo.isAttached(db, shopId, templateId)) {
    await runBatch(db, [
      repo.requireAttachable(db, templateId),
      repo.attachStatement(db, shopId, templateId, now),
      audit(db, actor, templateId, 'template.attach', shopId, now),
    ], templateNotAttachable)
  }
  return templateShops(db, templateId)
}

/** Detaches it; not attached: nothing changes (404 only for a missing template or shop). */
export async function detachTemplate(db: Db, actor: PlatformActor, templateId: string, shopId: string, now = new Date()): Promise<TemplateShop[]> {
  await requireTemplate(db, templateId)
  await requireShop(db, shopId)
  if (await repo.isAttached(db, shopId, templateId)) {
    await db.batch([
      repo.detachStatement(db, shopId, templateId),
      audit(db, actor, templateId, 'template.detach', shopId, now),
    ])
  }
  return templateShops(db, templateId)
}
