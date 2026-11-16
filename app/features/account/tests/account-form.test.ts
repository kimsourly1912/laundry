import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { changePasswordFormSchema, signInFormSchema, toChangePasswordRequest } from '../schemas/account-form'

const t = (key: string) => key
const issues = (schema: v.GenericSchema, input: unknown) => {
  const result = v.safeParse(schema, input)
  return result.success ? [] : result.issues.map(issue => `${v.getDotPath(issue)}: ${issue.message}`)
}

describe('signInFormSchema', () => {
  it('needs both; says nothing about which is wrong', () => {
    expect(issues(signInFormSchema(t), { username: ' ', password: '' })).toEqual(['username: validation.required', 'password: validation.required'])
    expect(issues(signInFormSchema(t), { username: 'Sokha', password: 'x' })).toEqual([])
  })
})

describe('changePasswordFormSchema', () => {
  const valid = { currentPassword: 'old', newPassword: 'a new password', confirmPassword: 'a new password' }

  it('a new password of the server\'s length, typed twice the same', () => {
    expect(issues(changePasswordFormSchema(t), valid)).toEqual([])
    expect(issues(changePasswordFormSchema(t), { ...valid, newPassword: 'short', confirmPassword: 'short' })).toEqual(['newPassword: validation.minLength'])
    expect(issues(changePasswordFormSchema(t), { ...valid, confirmPassword: 'a new passwore' })).toEqual(['confirmPassword: account.changePassword.mismatch'])
  })

  it('the request always ends the other sessions, and never carries the confirmation', () => {
    expect(toChangePasswordRequest(valid)).toEqual({ currentPassword: 'old', newPassword: 'a new password', revokeOtherSessions: true })
  })
})
