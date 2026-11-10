import { api, ApiError } from './api'

/**
 * Password reset adapter.
 *
 * The design specifies `POST /auth/password/forgot` and
 * `POST /auth/password/reset` with single-use tokens that expire after 30
 * minutes. The current API build has neither route, so development builds keep
 * a local, single-use token store under `reyvo.passwordResets.v1`.
 *
 * Production builds always call the API. If the API build is still missing the
 * routes, the UI surfaces an honest "not available" error instead of pretending
 * the password changed.
 */

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000

const STORE_KEY = 'reyvo.passwordResets.v1'
const RETAIN_MS = 24 * 60 * 60 * 1000

const UNAVAILABLE_MESSAGE =
  'Password reset is not available on this API build yet. Contact support if you need help signing in.'

function isMissingEndpoint(error) {
  return error instanceof ApiError && (error.status === 404 || error.status === 405)
}

function unavailable() {
  return new ApiError(UNAVAILABLE_MESSAGE, {
    status: 501,
    code: 'password_reset_unavailable',
  })
}

function emptyStore() {
  return { tokens: {} }
}

function readStore() {
  if (typeof window === 'undefined') return emptyStore()
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw)
    return {
      tokens: parsed?.tokens && typeof parsed.tokens === 'object' ? parsed.tokens : {},
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    // Storage full or blocked. The request still reports success rather than
    // leaking whether the account exists.
  }
}

function makeToken() {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `dev_reset_${random}`
}

function prune(store, now) {
  for (const [token, record] of Object.entries(store.tokens)) {
    if (now - Number(record?.issuedAt ?? 0) > RETAIN_MS) delete store.tokens[token]
  }
}

/**
 * Creates a local reset token. `ageMs` lets the development tools open expired
 * and already-used links without waiting for real time to pass.
 */
export function createDevResetToken(email, { ageMs = 0, used = false } = {}) {
  const store = readStore()
  const now = Date.now()
  prune(store, now)

  const token = makeToken()
  store.tokens[token] = {
    email: String(email ?? '').trim().toLowerCase(),
    issuedAt: now - Math.max(0, ageMs),
    usedAt: used ? now : null,
  }

  writeStore(store)
  return token
}

export function inspectDevResetToken(token) {
  if (!token) return { status: 'invalid', reason: 'missing', email: null }

  const record = readStore().tokens[token]
  if (!record) return { status: 'invalid', reason: 'unknown', email: null }
  if (record.usedAt) return { status: 'invalid', reason: 'used', email: record.email }
  if (Date.now() - Number(record.issuedAt ?? 0) > PASSWORD_RESET_TTL_MS) {
    return { status: 'expired', reason: 'expired', email: record.email }
  }

  return { status: 'valid', reason: null, email: record.email }
}

function markDevResetUsed(token) {
  const store = readStore()
  const record = store.tokens[token]
  if (!record) return
  record.usedAt = Date.now()
  writeStore(store)
}

/** Paths for the development links shown after a successful request. */
export function createResetDemoLinks(email) {
  return {
    valid: `/reset-password?token=${encodeURIComponent(createDevResetToken(email))}`,
    expired: `/reset-password?token=${encodeURIComponent(
      createDevResetToken(email, { ageMs: PASSWORD_RESET_TTL_MS + 60_000 }),
    )}`,
    invalid: '/reset-password?token=not-a-real-token',
  }
}

/**
 * Requests a reset email. The response is intentionally identical whether or
 * not the address exists, so this screen cannot be used to enumerate accounts.
 */
export async function requestPasswordReset(email) {
  const address = String(email ?? '').trim().toLowerCase()

  try {
    await api.forgotPassword(address)
    return { delivered: true, development: false, resetPath: null, demoLinks: null }
  } catch (error) {
    if (!isMissingEndpoint(error)) throw error
    if (!import.meta.env.DEV) throw unavailable()
  }

  const token = createDevResetToken(address)
  return {
    delivered: false,
    development: true,
    resetPath: `/reset-password?token=${encodeURIComponent(token)}`,
    demoLinks: createResetDemoLinks(address),
  }
}

/**
 * Loads a reset token so the page can show valid, expired, and invalid states
 * before the user types a new password. Production has no inspection endpoint,
 * so it optimistically renders the form and lets the server reject the token.
 */
export async function loadResetToken(token) {
  if (!token) return { status: 'invalid', reason: 'missing', email: null }
  if (import.meta.env.DEV) return inspectDevResetToken(token)
  return { status: 'valid', reason: null, email: null }
}

/** Maps API errors onto the three reset outcomes the UI knows how to render. */
export function resetErrorState(error) {
  const code = String(error?.code ?? '').toLowerCase()
  if (code.includes('invalid') || code.includes('used')) return 'invalid'
  if (code.includes('expired')) return 'expired'
  if (error?.status === 410) return 'expired'
  return 'invalid'
}

export async function resetPassword({ token, password }) {
  if (!token) {
    throw new ApiError('This reset link is missing its token.', {
      status: 400,
      code: 'reset_invalid',
    })
  }

  try {
    await api.resetPassword({ token, password })
    return { development: false, email: null }
  } catch (error) {
    if (!isMissingEndpoint(error)) throw error
    if (!import.meta.env.DEV) throw unavailable()
  }

  const result = inspectDevResetToken(token)

  if (result.status === 'expired') {
    throw new ApiError('This reset link has expired. Request a new one.', {
      status: 410,
      code: 'reset_expired',
    })
  }

  if (result.status !== 'valid') {
    throw new ApiError('This reset link is invalid or has already been used.', {
      status: 410,
      code: 'reset_invalid',
    })
  }

  markDevResetUsed(token)
  return { development: true, email: result.email }
}
