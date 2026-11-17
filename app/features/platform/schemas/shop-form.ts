import * as v from 'valibot'
import type { CreateShopInput } from '#shared/contracts/platform-shops'
import { OWNER_NAME_MAX, SHOP_NAME_MAX, SLUG_MAX, SLUG_MIN } from '#shared/contracts/platform-shops'
import { MAX_PASSWORD_LENGTH, MAX_USERNAME_LENGTH, MIN_PASSWORD_LENGTH, MIN_USERNAME_LENGTH } from '#shared/contracts/identity'

/**
 * The platform's shop forms (docs/standards/forms.md): the request contract's rules with messages in
 * the user's language. Never looser than `shared/contracts/platform-shops.ts`.
 */

type Translate = (key: string, params?: Record<string, unknown>) => string

const text = (t: Translate, max: number) => v.pipe(v.string(), v.trim(), v.minLength(1, t('validation.required')), v.maxLength(max, t('validation.maxLength', { max })))

export function shopNameFormSchema(t: Translate) {
  return text(t, SHOP_NAME_MAX)
}

export function newShopFormSchema(t: Translate) {
  return v.object({
    name: shopNameFormSchema(t),
    slug: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.minLength(1, t('validation.required')), v.minLength(SLUG_MIN, t('validation.minLength', { min: SLUG_MIN })), v.maxLength(SLUG_MAX, t('validation.maxLength', { max: SLUG_MAX })), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, t('validation.slug'))),
    owner: v.object({
      name: text(t, OWNER_NAME_MAX),
      username: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.minLength(1, t('validation.required')), v.minLength(MIN_USERNAME_LENGTH, t('validation.minLength', { min: MIN_USERNAME_LENGTH })), v.maxLength(MAX_USERNAME_LENGTH, t('validation.maxLength', { max: MAX_USERNAME_LENGTH })), v.regex(/^[a-z0-9_.]+$/, t('validation.username'))),
      password: temporaryPasswordFormSchema(t),
    }),
  })
}

export function temporaryPasswordFormSchema(t: Translate) {
  return v.pipe(v.string(), v.minLength(1, t('validation.required')), v.minLength(MIN_PASSWORD_LENGTH, t('validation.minLength', { min: MIN_PASSWORD_LENGTH })), v.maxLength(MAX_PASSWORD_LENGTH, t('validation.maxLength', { max: MAX_PASSWORD_LENGTH })))
}

export interface NewShopForm {
  name: string
  slug: string
  owner: { name: string, username: string, password: string }
}

export function emptyNewShopForm(): NewShopForm {
  return { name: '', slug: '', owner: { name: '', username: '', password: '' } }
}

/** A suggested short name from the shop's name: "Sokha Laundry" → "sokha-laundry" (Latin only). */
export function slugFromName(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, SLUG_MAX).replace(/-+$/, '')
}

/** The form's (already validated) values as the request body. */
export function toCreateShopRequest(form: NewShopForm): CreateShopInput {
  return { name: form.name, slug: form.slug, owner: { name: form.owner.name, username: form.owner.username, password: form.owner.password } }
}
