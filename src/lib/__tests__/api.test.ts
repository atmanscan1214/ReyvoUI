import { describe, it, expect } from 'vitest'
import { ApiError, collectFieldErrors } from '../api'

describe('ApiError', () => {
  it('creates an error with default options', () => {
    const err = new ApiError('test error')
    expect(err.name).toBe('ApiError')
    expect(err.status).toBe(0)
    expect(err.code).toBe('request_failed')
    expect(err.fieldErrors).toEqual({})
    expect(err.idempotencyKey).toBeNull()
  })

  it('creates an error with custom options', () => {
    const err = new ApiError('custom', { status: 422, code: 'validation_error', fieldErrors: { email: 'Invalid email' } })
    expect(err.status).toBe(422)
    expect(err.code).toBe('validation_error')
    expect(err.fieldErrors).toEqual({ email: 'Invalid email' })
  })
})

describe('collectFieldErrors', () => {
  it('extracts field errors from FastAPI validation format', () => {
    const result = collectFieldErrors({
      errors: [
        { loc: ['body', 'email'], msg: 'Value error, Enter a valid email.', type: 'value_error' },
        { loc: ['body', 'password'], msg: 'Value error, Password too short.', type: 'value_error' },
      ],
    })
    expect(result).toEqual({
      email: 'Enter a valid email.',
      password: 'Password too short.',
    })
  })

  it('handles missing details gracefully', () => {
    const result = collectFieldErrors(undefined)
    expect(result).toEqual({})

    const result2 = collectFieldErrors(null)
    expect(result2).toEqual({})
  })

  it('deduplicates fields', () => {
    const result = collectFieldErrors({
      errors: [
        { loc: ['body', 'email'], msg: 'Email is required', type: 'value_error' },
        { loc: ['body', 'email'], msg: 'Email already exists', type: 'value_error' },
      ],
    })
    expect(result).toEqual({ email: 'Email is required' }) // first wins
  })
})