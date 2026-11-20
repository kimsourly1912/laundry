import * as v from 'valibot'
import { nameSchema, optionalParam, optionalTextSchema, pageQuerySchema, versionSchema } from './common'
import { passwordSchema, usernameSchema } from './identity'
import { CURRENCIES } from './shop-settings'
import type { Currency } from './shop-settings'

/**
 * The platform's shops (`/api/platform/shops`, spec §9, step M1.5): a super admin creates a shop
 * with its owner, keeps its details (name, phone, address, currency: what its slips print, D44),
 * suspends and resumes it, and helps its owner (temporary password, sign out everywhere). A super
 * admin sees a shop's details and status, never its orders or customers.
 */

export const SHOP_STATUSES = ['active', 'suspended'] as const
export type ShopStatus = typeof SHOP_STATUSES[number]

export const SHOP_NAME_MAX = 80
export const OWNER_NAME_MAX = 100
export const SLUG_MIN = 3
export const SLUG_MAX = 40

/** The shop's short name: lowercase letters, digits and single dashes (`sokha-laundry`). Fixed once created. */
export const slugSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.minLength(SLUG_MIN, `At least ${SLUG_MIN} characters`),
  v.maxLength(SLUG_MAX, `At most ${SLUG_MAX} characters`),
  v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single dashes'),
)

/** `POST /api/platform/shops`: the shop and its owner, created together or not at all. */
export const createShopSchema = v.strictObject({
  name: nameSchema(SHOP_NAME_MAX, 'Shop name'),
  slug: slugSchema,
  owner: v.strictObject({
    name: nameSchema(OWNER_NAME_MAX, 'Owner name'),
    username: usernameSchema,
    /** Temporary: the owner must change it at the first sign-in. */
    password: passwordSchema,
  }),
})
export type CreateShopInput = v.InferOutput<typeof createShopSchema>

/** A phone number as shown to customers: digits, spaces, `+`, `-`, `(`, `)`. */
const shopPhoneSchema = v.pipe(optionalTextSchema(30), v.check(phone => phone === null || /^[\d\s+\-()]+$/.test(phone), 'Use digits, spaces, + and - only'))

/** `PATCH /api/platform/shops/:shopId`: the shop's details, all of them, at the version read. */
export const updateShopSchema = v.strictObject({
  version: versionSchema,
  name: nameSchema(SHOP_NAME_MAX, 'Shop name'),
  phone: shopPhoneSchema,
  address: optionalTextSchema(200),
  /** Orders keep a copy of it (D33), so it may change at any time. */
  currency: v.picklist(CURRENCIES),
})
export type UpdateShopInput = v.InferOutput<typeof updateShopSchema>

/** `POST …/suspend` and `…/resume`: the version the admin saw. */
export const shopStatusChangeSchema = v.strictObject({ version: versionSchema })
export type ShopStatusChangeInput = v.InferOutput<typeof shopStatusChangeSchema>

/** `POST …/owner/reset-password`: a new temporary password; every owner session ends. */
export const resetOwnerPasswordSchema = v.strictObject({ password: passwordSchema })
export type ResetOwnerPasswordInput = v.InferOutput<typeof resetOwnerPasswordSchema>

/** `GET /api/platform/shops?status=&search=&page=&pageSize=`: search is the name or short name. */
export const shopListQuerySchema = v.object({
  ...pageQuerySchema,
  status: optionalParam(v.picklist(SHOP_STATUSES)),
  search: optionalParam(v.pipe(v.string(), v.trim(), v.maxLength(100))),
})
export type ShopListQuery = v.InferOutput<typeof shopListQuerySchema>

/** The shop's owner, as the platform sees them: no password, no sessions. */
export interface ShopOwner {
  id: string
  name: string
  username: string
  /** Still on a temporary password: hasn't signed in and changed it since the last reset. */
  mustChangePassword: boolean
}

/** A shop in the platform's list and detail. */
export interface PlatformShop {
  id: string
  name: string
  slug: string
  status: ShopStatus
  /** ISO 8601. */
  createdAt: string
  /** Send it back with every change (409 when someone changed the shop meanwhile). */
  version: number
  /** The shop's amounts are in this currency. */
  currency: Currency
  /** Printed on its slips. */
  phone: string | null
  address: string | null
  /** `null` only if the shop lost its owner (never by our routes). */
  owner: ShopOwner | null
}

/** One shop (`GET /api/platform/shops/:shopId` and every change to it). Step 2 adds its templates. */
export type PlatformShopDetail = PlatformShop
