import { api, ApiError } from './api'
import { consumeLocalChallenge, createLocalChallenge } from './onboarding'

/**
 * Email verification adapter.
 *
 * The current API build has no verification routes, so development builds fall
 * back to a local, single-use challenge stored under `reyvo.onboarding.v1`.
 * Production builds always call the API and surface an honest unavailable
 * error instead of pretending an address was verified.
 */

const UNAVAILABLE_MESSAGE =
  'Email verification is not available on this API build yet. Contact support if you need your address verified.'

function isMissingEndpoint(error) {
  return error instanceof ApiError && (error.status === 404 || error.status === 405)
}

function unavailable() {
  return new ApiError(UNAVAILABLE_MESSAGE, {
    status: 501,
    code: 'verification_unavailable',
  })
}

export async function sendVerificationEmail(user) {
  if (!user?.email) {
    throw new ApiError('Sign in to resend the verification email.', {
      status: 401,
      code: 'not_authenticated',
    })
  }

  try {
    await api.resendVerification(user.email)
    return { delivered: true, development: false }
  } catch (error) {
    if (!isMissingEndpoint(error)) throw error
    if (!import.meta.env.DEV) throw unavailable()

    const token = createLocalChallenge(user)
    return {
      delivered: false,
      development: true,
      verifyPath: `/verify-email?token=${encodeURIComponent(token)}`,
    }
  }
}

export async function confirmVerificationToken(token) {
  if (!token) {
    throw new ApiError('This verification link is missing its token.', {
      status: 400,
      code: 'missing_verification_token',
    })
  }

  try {
    await api.verifyEmail(token)
    return { verified: true, development: false }
  } catch (error) {
    if (!isMissingEndpoint(error)) throw error
  }

  if (!import.meta.env.DEV) throw unavailable()

  const result = consumeLocalChallenge(token)

  if (result.status === 'valid') {
    return { verified: true, development: true }
  }

  if (result.status === 'expired') {
    throw new ApiError('This verification link has expired. Request a new one.', {
      status: 410,
      code: 'verification_expired',
    })
  }

  throw new ApiError('This verification link is invalid or has already been used.', {
    status: 410,
    code: 'verification_invalid',
  })
}
