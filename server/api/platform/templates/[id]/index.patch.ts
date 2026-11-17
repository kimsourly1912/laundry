import { MAX_DESIGN_BYTES } from '#shared/contracts/slip-design'
import { updateTemplateSchema } from '#shared/contracts/templates'
import { updateTemplate } from '#server/features/templates'

/** The studio's autosave (plan §5.8): a design is larger than other bodies, up to `MAX_DESIGN_BYTES`. */
export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { template: ['write'] })
  const templateId = readIdParam(event, 'id', 'The template')
  const input = await readValidBody(event, updateTemplateSchema, { maxBytes: MAX_DESIGN_BYTES })
  return updateTemplate(useDb(), actor, templateId, input)
})
