import { notFound, versionConflict } from '#server/utils/errors'

/** An item that isn't on the shop's slips answers like a missing one (D43). */
export function priceNotFound() {
  return notFound('This item')
}

export function priceChanged() {
  return versionConflict('This price')
}
