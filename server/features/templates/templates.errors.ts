import { apiError, ErrorCodes, notFound, versionConflict } from '#server/utils/errors'

export const templateNotFound = () => notFound('The template')
export const templateChanged = () => versionConflict('This template')

export function templateNameTaken() {
  return apiError(409, 'TEMPLATE_NAME_TAKEN', 'Another template has this name.', { fieldErrors: { name: ['Another template has this name'] } })
}

export function templateWrongState(archived: boolean) {
  return apiError(409, ErrorCodes.INVALID_STATE, archived ? 'This template is already archived.' : 'This template isn\'t archived.')
}

/** Creating a shop from an archived template: the admin's list was out of date. */
export function templateUnavailable() {
  return apiError(409, 'TEMPLATE_UNAVAILABLE', 'This template is archived. Choose another.', { fieldErrors: { templateId: ['Choose an active template'] } })
}

export function templateListFull(max: number) {
  return apiError(409, 'TEMPLATE_LIST_FULL', `At most ${max} templates can be active. Archive some first.`)
}
