import * as v from 'valibot'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '#shared/contracts/identity'

/**
 * The account forms (docs/standards/forms.md): Valibot schemas with the user's language, never
 * looser than the server (Better Auth checks the password length again).
 */

type Translate = (key: string, params?: Record<string, unknown>) => string

/** Sign-in: anything typed; the server says whether it's right (no hint about which part is wrong). */
export function signInFormSchema(t: Translate) {
  return v.object({
    username: v.pipe(v.string(), v.trim(), v.minLength(1, t('validation.required'))),
    password: v.pipe(v.string(), v.minLength(1, t('validation.required'))),
  })
}

export function changePasswordFormSchema(t: Translate) {
  return v.pipe(
    v.object({
      currentPassword: v.pipe(v.string(), v.minLength(1, t('validation.required'))),
      newPassword: v.pipe(
        v.string(),
        v.minLength(1, t('validation.required')),
        v.minLength(MIN_PASSWORD_LENGTH, t('validation.minLength', { min: MIN_PASSWORD_LENGTH })),
        v.maxLength(MAX_PASSWORD_LENGTH, t('validation.maxLength', { max: MAX_PASSWORD_LENGTH })),
      ),
      confirmPassword: v.pipe(v.string(), v.minLength(1, t('validation.required'))),
    }),
    v.forward(v.partialCheck([['newPassword'], ['confirmPassword']], input => input.newPassword === input.confirmPassword, t('account.changePassword.mismatch')), ['confirmPassword']),
  )
}

export interface ChangePasswordForm {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

/**
 * Better Auth's `change-password` body. Other sessions always end (the server enforces it too,
 * spec §12); the confirmation never leaves the form.
 */
export function toChangePasswordRequest(form: ChangePasswordForm) {
  return { currentPassword: form.currentPassword, newPassword: form.newPassword, revokeOtherSessions: true }
}
