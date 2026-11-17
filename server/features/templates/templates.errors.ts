import { apiError, ErrorCodes, notFound, versionConflict } from '#server/utils/errors'
import { IMAGE_MAX_SIDE, IMAGE_MIN_SIDE } from '#shared/contracts/templates'

export const TemplateErrorCodes = {
  TEMPLATE_NAME_TAKEN: 'TEMPLATE_NAME_TAKEN',
  INVALID_IMAGE: 'INVALID_IMAGE',
  UNKNOWN_IMAGE: 'UNKNOWN_IMAGE',
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
