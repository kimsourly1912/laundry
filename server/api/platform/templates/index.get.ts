import { templateListQuerySchema } from '#shared/contracts/templates'
import { listTemplates } from '#server/features/templates'

export default defineEventHandler(async (event) => {
  await requirePlatformPermission(event, { template: ['read'] })
  const query = readValidQuery(event, templateListQuerySchema)
  return listTemplates(useDb(), query)
})
