import { createError } from 'h3'
import { describe, expect, it } from 'vitest'
import { apiError, ErrorCodes, notFound, toErrorResponse, versionConflict } from '#server/utils/errors'

describe('apiError', () => {
  it('carries the status and the flat body', () => {
    const error = apiError(409, 'VERSION_CONFLICT', 'Changed elsewhere.')
    expect(error.statusCode).toBe(409)
    expect(error.data).toEqual({ code: 'VERSION_CONFLICT', message: 'Changed elsewhere.' })
  })

  it('adds field errors only when given', () => {
    expect(apiError(400, 'VALIDATION_FAILED', 'Invalid.', { fieldErrors: { name: ['Required'] } }).data)
      .toEqual({ code: 'VALIDATION_FAILED', message: 'Invalid.', fieldErrors: { name: ['Required'] } })
  })

  it('has factories for the common answers', () => {
    expect(notFound('The order').data).toEqual({ code: 'NOT_FOUND', message: 'The order was not found.' })
    expect(versionConflict('The order').statusCode).toBe(409)
  })
})

describe('toErrorResponse', () => {
  it('sends a 4xx apiError as it is, with the request id', () => {
    const response = toErrorResponse(apiError(409, 'INVALID_STATE', 'Not ready yet.'), 'req-1')
    expect(response).toEqual({ status: 409, isServerError: false, body: { code: 'INVALID_STATE', message: 'Not ready yet.', requestId: 'req-1' } })
  })

  it('keeps field errors', () => {
    const response = toErrorResponse(apiError(400, 'VALIDATION_FAILED', 'Invalid.', { fieldErrors: { 'lines.0.quantity': ['Too small'] } }))
    expect(response.body.fieldErrors).toEqual({ 'lines.0.quantity': ['Too small'] })
  })

  it('gives a library\'s 4xx a shared code and a generic message, never its own text', () => {
    const response = toErrorResponse(createError({ statusCode: 401, message: 'session token abc expired' }))
    expect(response.body).toEqual({ code: ErrorCodes.UNAUTHENTICATED, message: 'Sign in to continue.' })
    expect(toErrorResponse(createError({ statusCode: 405 })).body.code).toBe('NOT_FOUND')
  })

  it('never sends a 5xx\'s details, even an apiError\'s', () => {
    for (const error of [new Error('SQLITE_ERROR: no such table orders'), apiError(500, 'X', 'secret detail'), 'thrown string']) {
      const response = toErrorResponse(error, 'req-2')
      expect(response).toEqual({ status: 500, isServerError: true, body: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.', requestId: 'req-2' } })
    }
  })

  it('treats a status outside 400–599 as 500', () => {
    expect(toErrorResponse(createError({ statusCode: 302 })).status).toBe(500)
  })
})
