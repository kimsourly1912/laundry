import { apiError, ErrorCodes, notFound, versionConflict } from '#server/utils/errors'
import { IMAGE_MAX_SIDE, IMAGE_MIN_SIDE } from '#shared/contracts/templates'
import { PUBLISH_ERROR_TEXT } from '#shared/slip/checks'
import type { Problem, PublishError } from '#shared/slip/checks'

export const TemplateErrorCodes = {
  TEMPLATE_NAME_TAKEN: 'TEMPLATE_NAME_TAKEN',
  INVALID_IMAGE: 'INVALID_IMAGE',
  UNKNOWN_IMAGE: 'UNKNOWN_IMAGE',
  PUBLISH_CHECKS_FAILED: 'PUBLISH_CHECKS_FAILED',
  TEMPLATE_NOT_ATTACHABLE: 'TEMPLATE_NOT_ATTACHABLE',
  TEMPLATE_CHANGED: 'TEMPLATE_CHANGED',
} as const

export function templateNotFound() {
  return notFound('The template')
}

export function templateChanged() {
  // Plan §5.8: the studio shows its own words for this one; the message is for other callers.
  return versionConflict('This template')
}

export function templateNameTaken() {
  return apiError(409, TemplateErrorCodes.TEMPLATE_NAME_TAKEN, 'Another template already has this name.', { fieldErrors: { name: ['Another template already has this name'] } })
}

export function templateArchived() {
  return apiError(409, ErrorCodes.INVALID_STATE, 'This template is archived. Restore it to change it.')
}

export function imageNotFound() {
  return notFound('The image')
}

export function invalidImage() {
  return apiError(422, TemplateErrorCodes.INVALID_IMAGE, 'Upload a PNG or JPEG image of at most 1 MB.')
}

export function imageSizeOutOfRange() {
  return apiError(422, TemplateErrorCodes.INVALID_IMAGE, `The image must be ${IMAGE_MIN_SIDE} to ${IMAGE_MAX_SIDE} pixels on each side.`)
}

/** A design names an image that was never uploaded. */
export function unknownImage(path: string) {
  return apiError(422, TemplateErrorCodes.UNKNOWN_IMAGE, 'The design uses an image that doesn\'t exist.', { fieldErrors: { [path]: ['No such image'] } })
}

export function nothingToPublish(number: number) {
  return apiError(409, ErrorCodes.INVALID_STATE, `Nothing changed since version ${number}.`)
}

/**
 * 422: the draft fails the publish checks (plan §5.8). `fieldErrors` names each problem by the
 * element or group it's about (`design` when it's about the whole slip).
 */
export function publishChecksFailed(errors: Problem<PublishError>[]) {
  const fieldErrors: Record<string, string[]> = {}
  for (const error of errors) (fieldErrors[error.key ?? 'design'] ??= []).push(PUBLISH_ERROR_TEXT[error.code])
  return apiError(422, TemplateErrorCodes.PUBLISH_CHECKS_FAILED, PUBLISH_ERROR_TEXT[errors[0]!.code], { fieldErrors })
}

export function shopNotFound() {
  return notFound('The shop')
}

/** Only a published template can be attached: a draft has no version for orders, an archived one is retired. */
export function templateNotAttachable() {
  return apiError(422, TemplateErrorCodes.TEMPLATE_NOT_ATTACHABLE, 'Only a published template can be attached to a shop.')
}

export function alreadyArchived() {
  return apiError(409, ErrorCodes.INVALID_STATE, 'This template is already archived.')
}

export function notArchived() {
  return apiError(409, ErrorCodes.INVALID_STATE, 'This template is not archived.')
}

/** The shop's own view of a template: one it can't use answers like a missing one. */
export function paperSlipNotFound() {
  return notFound('This paper slip')
}

/**
 * 409: the order was filled on a version that is no longer the template's latest (the platform
 * published again), or the template was detached meanwhile. The owner reloads the slip and checks it.
 */
export function templateChangedForOrder() {
  return apiError(409, TemplateErrorCodes.TEMPLATE_CHANGED, 'This paper slip was updated. Check the order and save again.')
}
