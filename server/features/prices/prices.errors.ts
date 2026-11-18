import { apiError, ErrorCodes, notFound, versionConflict } from '#server/utils/errors'

export const PriceErrorCodes = {
  PRICE_KEY_TAKEN: 'PRICE_KEY_TAKEN',
} as const

export function priceNotFound() {
  return notFound('This price')
}

export function priceChanged() {
  return versionConflict('This price')
}

export function priceKeyTaken() {
  return apiError(409, PriceErrorCodes.PRICE_KEY_TAKEN, 'Another item already has this key.', { fieldErrors: { key: ['Another item already has this key'] } })
}

export function priceAlready(active: boolean) {
  return apiError(409, ErrorCodes.INVALID_STATE, active ? 'This item is already in use.' : 'This item is already archived.')
}
